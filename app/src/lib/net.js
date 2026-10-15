// WebSocket 接続: 自動再接続 ＋ サーバーとの時計ずれ補正（早押しの公平性のため）
export const wsUrl = id => (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws?id=' + id;

const dbg = (...a) => { try { if (localStorage.getItem('qk_debug')) (window.__qkdebug ??= []).push(a.join(' ')); } catch { /* noop */ } };

export class Conn {
  /** handlers: { open(), message(m), status(s), clock({rtt,offset}) } */
  constructor(id, handlers) {
    this.id = id; this.h = handlers;
    this.ws = null; this.closed = false; this.retry = 0;
    this.offset = 0; this.rtt = null; this._best = Infinity; this._timer = null; this._sync = null;
  }
  connect() {
    this.closed = false;
    this.h.status?.('connecting');
    const ws = (this.ws = new WebSocket(wsUrl(this.id)));
    dbg('connect', this.id);
    ws.onopen = () => {
      dbg('open');
      this.retry = 0; this.h.status?.('open');
      this.resync(8);
      clearInterval(this._sync); this._sync = setInterval(() => this.resync(4), 30000);
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
  /** 時計ずれ測定。往復が最短だったサンプルを採用する */
  resync(n = 4) {
    this._best = Infinity;
    for (let i = 0; i < n; i++) setTimeout(() => this.send({ t: 'ping', c: Date.now() }), i * 130);
  }
  _pong(m) {
    const t1 = Date.now(), rtt = t1 - m.c;
    if (rtt < this._best) {
      this._best = rtt; this.rtt = rtt;
      this.offset = m.s + rtt / 2 - t1;
      this.h.clock?.({ rtt, offset: this.offset });
    }
  }
  /** サーバー時刻の推定 */
  now() { return Date.now() + this.offset; }
}
