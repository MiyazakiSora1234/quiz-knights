// WebSocket 接続: 自動再接続 ＋ サーバーとの時計ずれ補正（早押しの公平性のため）
//
// 時計合わせの方針（誤差を数ms〜10ms台に抑える）
//  - 時刻は単調な performance.now() 基準で測る（端末の時計が途中で変わっても影響しない）
//  - 往復が最短だったサンプルほど、行きと帰りの差（非対称）の影響が小さい。
//    直近60秒のサンプルから、往復が短い上位5件の中央値を採用する
//  - 押した時刻は、入力イベント自体の時刻（event.timeStamp）を使う。
//    画面の処理待ちの分のずれが入らない
export const wsUrl = id => (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws?id=' + id;

const dbg = (...a) => { try { if (localStorage.getItem('qk_debug')) (window.__qkdebug ??= []).push(a.join(' ')); } catch { /* noop */ } };
const perf = () => performance.now();

export class Conn {
  /** handlers: { open(), message(m), status(s), clock({rtt,offset,jitter,samples}) } */
  constructor(id, handlers) {
    this.id = id; this.h = handlers;
    this.ws = null; this.closed = false; this.retry = 0;
    this.offset = 0;        // サーバー時刻(ms) - performance.now()
    this.rtt = null;        // 採用サンプルの最短往復(ms)
    this.jitter = null;     // 採用サンプル間のずれの幅(ms)。小さいほど安定
    this.samples = [];
    this._timer = null; this._sync = null; this._reported = 0;
  }
  connect() {
    this.closed = false;
    this.h.status?.('connecting');
    const ws = (this.ws = new WebSocket(wsUrl(this.id)));
    dbg('connect', this.id);
    ws.onopen = () => {
      dbg('open');
      this.retry = 0; this.h.status?.('open');
      this.resync(16, 70);                                   // 最初に多めに測る（約1秒）
      clearInterval(this._sync); this._sync = setInterval(() => this.resync(4, 120), 8000);
      this.h.open?.();
    };
    ws.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'pong') return this._pong(m);
      dbg('msg', m.t);
      this.h.message?.(m);
    };
    ws.onclose = e => {
      dbg('close', e.code, e.reason, 'closed=' + this.closed);
      clearInterval(this._sync);
      if (this.closed) return;
      this.h.status?.('reconnecting');
      this._timer = setTimeout(() => this.connect(), Math.min(5000, 800 + this.retry++ * 700));
    };
    ws.onerror = () => { try { ws.close(); } catch { /* noop */ } };
  }
  send(m) { if (this.ws && this.ws.readyState === 1) { if (m.t !== 'ping') dbg('send', m.t); this.ws.send(JSON.stringify(m)); return true; } return false; }
  close() { this.closed = true; clearTimeout(this._timer); clearInterval(this._sync); try { this.ws?.close(); } catch { /* noop */ } }

  /** n 回、gap ミリ秒おきに ping を送って時計ずれを測る */
  resync(n = 4, gap = 100) {
    for (let i = 0; i < n; i++) setTimeout(() => this.send({ t: 'ping', c: perf() }), i * gap);
  }
  _pong(m) {
    const t1 = perf(), rtt = t1 - m.c;
    if (!(rtt >= 0) || rtt > 5000) return;
    this.samples.push({ rtt, offset: m.s + rtt / 2 - t1, at: t1 });
    const cutoff = t1 - 60000;
    this.samples = this.samples.filter(s => s.at >= cutoff).slice(-80);
    const best = [...this.samples].sort((a, b) => a.rtt - b.rtt).slice(0, Math.min(5, this.samples.length));
    const offs = best.map(s => s.offset).sort((a, b) => a - b);
    this.offset = offs[Math.floor(offs.length / 2)];
    this.rtt = best[0].rtt;
    this.jitter = offs[offs.length - 1] - offs[0];
    this.h.clock?.({ rtt: this.rtt, offset: this.offset, jitter: this.jitter, samples: this.samples.length });
    // サーバーが「どれだけ待てば遅れて届く押下を拾えるか」を決められるよう、遅延を知らせる
    if (t1 - this._reported > 4000 && this.samples.length >= 3) {
      this._reported = t1;
      this.send({ t: 'rtt', rtt: Math.round(this.rtt) });
    }
  }
  /** サーバー時刻の推定（ms） */
  now() { return perf() + this.offset; }
  /** 入力イベント（event.timeStamp）の時刻をサーバー時刻に換算する */
  stamp(eventTimeStamp) { return eventTimeStamp + this.offset; }
}
