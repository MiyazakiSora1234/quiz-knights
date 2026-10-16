// 参加者の状態: 入室・ロビー・バトル中の表示用状態と、早押し
import { Conn } from './net.js';
import { toast } from './ui.svelte.js';
import { sfx, vib, unlockAudio } from './sound.svelte.js';
import { store, session, KEY } from './storage.js';
import { rankTags } from './ranks.js';

const goList = (ms = 1200) => setTimeout(() => { location.href = '/'; }, ms);

export class PlayStore {
  id; conn = null;
  phase = $state('loading');      // loading | join | connecting | lobby | game
  info = $state(null);            // 部屋一覧から見つけた、この部屋の情報
  name = $state(store.get(KEY.name) ?? '');
  flavor = $state(store.get(KEY.flavor) ?? '');
  pw = $state('');
  err = $state('');
  pid = $state(null);
  roomName = $state('');
  myJob = $state('warrior');
  myTeam = $state('p');
  members = $state([]);
  answered = $state(null);        // 最後に送ったチャット回答 {q,text}
  ranks = $state({});             // この問題の早押しの順位 pid → 表示用のタグ
  myItems = $state([]);           // 自分の持ち物（アイテムのキー。本人にだけ届く）
  req = $state(null);             // 自分が選ぶ場面（行動・対象など）{qid,title,sub,options}
  foes = $state(['boss1']);       // 部屋で選ばれている戦う相手（魔王・職業のCPU。誰でも変えられる）
  level = $state('normal');       // 難易度（誰でも変えられる）
  delay = $state(Math.max(0, parseInt(store.get(KEY.delay) ?? '0', 10) || 0));   // 自分の早押しディレイ（ms）。クイズ設定で変える
  chat = $state([]);              // 部屋のチャットと入退室のお知らせ
  hasHost = $state(true);         // 進行役がいるか（いなければ誰でもなれる）
  hostOnline = $state(false);
  gs = $state(null);              // 進行役から届く表示用の状態
  chain = $state(false);          // 連チャン（誤答したら次の順位へ回答権が移る）
  open = $state(false);           // 早押し受付中
  eligible = $state([]);          // 今回押せる人
  sent = $state(false);
  winner = $state(null);
  status = $state('connecting');
  rtt = $state(null);
  jitter = $state(null);
  #wake = null;

  constructor(id) { this.id = id; }
  get pidKey() { return KEY.pid(this.id); }

  /* ---------- 画面が使う導出値 ---------- */
  get mine() { return this.gs?.pids?.[this.pid]; }
  get me() { return this.gs && this.mine != null ? this.gs.units.find(u => u.id === this.mine) ?? null : null; }
  get canPress() { return this.open && this.eligible.includes(this.pid); }
  get canBuzz() { return !!(this.canPress && !this.sent && this.gs && !this.gs.over); }
  get hasWinner() { return !!(this.winner && this.winner.q === this.gs?.q); }
  get myWin() { return this.hasWinner && this.winner.pid === this.pid; }
  get bannerKind() {
    if (this.gs?.over) return '';
    return this.myWin ? 'win' : this.hasWinner ? 'other' : this.canPress ? 'open' : '';
  }
  get bannerText() {
    if (!this.gs) return '';
    if (this.gs.over) return 'バトル終了';
    if (this.hasWinner) return this.myWin ? '回答権を獲得！答えてください' : `回答権：${this.winner.name}`;
    if (this.canPress) return '';
    if (this.open) return '受付中（今回は押せません）';
    return '';
  }
  get buzzLabel() {
    const me = this.me;
    if (this.canBuzz) return this.hasWinner ? (this.chain ? '控えで押す' : '押す（順位のみ）') : '押す！';
    if (this.sent) return this.myWin ? '回答権獲得' : '送信済み';
    if (me && !me.alive && !me.ghost) return '戦闘不能';
    if (me && me.restNow) return '今回は休み';
    return '待機中';
  }
  get overText() {
    const { gs, me } = this;
    if (!gs?.over) return '';
    if (gs.over === 'win') return '勝利！';
    if (gs.over === 'lose') return '全滅…';
    if (gs.cpu && gs.over === 'teame') return '全滅…';
    if (gs.cpu && gs.over === 'teamp') return '勝利！';
    if (gs.over === 'draw') return '引き分け';
    const winSide = gs.over.slice(4);                               // teamp / teame / teamc
    return me ? (me.side === winSide ? '勝利！' : '敗北…') : `チーム${{ p: 'A', e: 'B', c: 'C' }[winSide] ?? '?'}の勝利`;
  }
  get lost() { return /全滅|敗北/.test(this.overText); }
  /** 同期の状態が良好か（往復が短く、ばらつきも小さい） */
  get netGood() { return this.status === 'open' && this.rtt != null && this.rtt < 150 && (this.jitter ?? 0) <= 10; }

  /* ---------- 入室 ---------- */
  async init() {
    try { this.info = (await (await fetch('/api/rooms', { cache: 'no-store' })).json()).find(r => String(r.id) === String(this.id)); } catch { /* noop */ }
    if (!this.info || !this.info.used) { toast('その部屋は存在しません'); goList(); return; }
    this.roomName = this.info.name;
    this.phase = 'join';
    if (!this.name.trim()) { this.name = `旅人${100 + Math.floor(Math.random() * 900)}`; store.set(KEY.name, this.name); }
    const pw = session.get(KEY.pw(this.id)); if (pw != null) { this.pw = pw; session.remove(KEY.pw(this.id)); }
    const known = session.get(this.pidKey);
    // 再接続、または部屋を作った直後だけ自動で入室する。初めての入室は taQu と同じく、参加ダイアログ（名前・ひとこと・パスワード）を出す
    if ((known || this.pw) && this.name) this.join(true);
  }

  join(auto = false) {
    if (!this.name.trim()) { this.err = '名前を入力してください'; return; }
    this.err = ''; unlockAudio();
    if (!auto) session.remove(this.pidKey);
    this.conn?.close();
    const conn = this.conn = new Conn(this.id, {
      status: s => { this.status = s; },
      clock: c => { this.rtt = Math.round(c.rtt); this.jitter = Math.round(c.jitter ?? 0); },
      open: () => conn.send({ t: 'join', id: this.id, name: this.name.trim(), flavor: this.flavor.trim(), password: this.pw, pid: session.get(this.pidKey) || undefined }),
      message: m => this.#onMessage(m),
    });
    conn.connect();
    if (auto) this.phase = 'connecting';
  }

  #onMessage(m) {
    switch (m.t) {
      case 'error': return this.#onError(m);
      case 'joined': return this.#onJoined(m);
      case 'members': this.members = m.players; if (m.roomName) this.roomName = m.roomName; if (Array.isArray(m.foes)) this.foes = [...m.foes]; if (m.level) this.level = m.level; this.hasHost = m.hasHost; this.hostOnline = m.hostOnline; return;
      case 'ask': this.req = m; if (typeof navigator.vibrate === 'function') vib(40); sfx.open(); return;
      case 'priv': this.myItems = m.items ?? []; return;
      case 'answer_ack': this.answered = { q: m.q, text: m.text }; return;
      case 'ask_close': if (this.req?.qid === m.qid) this.req = null; return;
      case 'chat': this.chat = [...this.chat, m].slice(-100); return;
      case 'host_granted': store.set(KEY.hostKey(this.id), m.hostKey); session.remove(this.pidKey); location.href = `/host?id=${this.id}`; return;
      case 'state': { const first = !this.gs; this.gs = m.state; this.phase = 'game'; if (first) toast('バトル開始！'); return; }
      case 'ended': this.myItems = []; this.req = null; this.gs = null; this.open = false; this.winner = null; this.sent = false; this.phase = 'lobby'; return;
      case 'open':
        this.ranks = {}; this.open = true; this.chain = !!m.chain; this.eligible = m.eligible; this.sent = false; this.winner = null;
        if (m.eligible.includes(this.pid)) { sfx.open(); vib(30); }
        return;
      case 'locked': return;     // 回答者が決まったあとも押せる（順位の表示のため。連チャンでは回答権の移り先にもなる）
      case 'ack': this.sent = true; return;
      case 'ranking': if (m.q === this.gs?.q || this.gs == null) this.ranks = rankTags(m.all); return;
      case 'winner':
        this.ranks = rankTags(m.all ?? m.ranking);
        // 受付は閉じない: 後から押した人の順位も、全員に表示する
        this.winner = m;
        if (m.pid === this.pid) { sfx.win(); vib([120, 60, 200]); } else sfx.other();
        return;
      case 'closed':
        session.remove(this.pidKey);
        toast(m.why || '部屋が閉じられました', 3500); goList(2200);
    }
  }
  #onError(m) {
    if (m.code === 'claim') { toast(m.msg, 3500); return; }   // 進行役の引き継ぎができなかっただけ（入室は続ける）
    session.remove(this.pidKey);
    if (m.code === 'gone') { toast(m.msg); goList(); return; }
    this.pid = null; this.conn.close();
    this.phase = 'join'; this.err = m.msg;
    if (m.code === 'pw') this.info = { ...this.info, hasPw: true };
  }
  #onJoined(m) {
    this.pid = m.pid; session.set(this.pidKey, m.pid);
    store.set(KEY.name, m.name); store.set(KEY.flavor, m.flavor || '');
    this.myJob = m.job; this.myTeam = m.team; this.roomName = m.roomName;
    if (this.delay && m.delay !== this.delay) this.conn.send({ t: 'profile', delay: this.delay });   // 入り直したときも、自分のディレイを引き継ぐ
    this.phase = this.gs ? 'game' : 'lobby';
    this.keepAwake();
  }

  /* ---------- 早押し ---------- */
  /** e: 押した入力イベント。画面の処理待ちが入らないよう、イベント自体の時刻で申告する */
  buzz(e) {
    if (!this.canBuzz) return;
    const ts = this.conn.stamp(e?.timeStamp ?? performance.now());
    unlockAudio(); sfx.press(); vib(25);
    this.conn.send({ t: 'buzz', ts, rtt: this.conn.rtt != null ? Math.round(this.conn.rtt) : undefined });
    this.sent = true;   // 通信を待たずに押した感触を返す
  }

  /* ---------- ロビー ---------- */
  #sendProfile() { this.conn.send({ t: 'profile', job: this.myJob, team: this.myTeam }); }
  pickJob(j) { this.myJob = j; store.set(KEY.job, j); this.#sendProfile(); }
  pickTeam(t) { this.myTeam = t; store.set(KEY.team, t); this.#sendProfile(); }
  /** 選択ダイアログの答え（i=選択肢の番号） */
  answer(i) {
    const r = this.req; if (!r || r.options[i]?.disabled) return;
    this.conn.send({ t: 'answer', qid: r.qid, i });
    this.req = null;
  }
  /** チャット回答（進行役にだけ届く） */
  sendAnswer(text) { if (text.trim()) this.conn.send({ t: 'chat', text, answer: true }); }
  /** 自分の早押しディレイを決める（0〜3000ms）。サーバーが押した時刻に足して順位を決める */
  setDelay(ms) {
    this.delay = Math.max(0, Math.min(3000, Math.round(+ms) || 0));
    store.set(KEY.delay, String(this.delay));
    this.conn?.send({ t: 'profile', delay: this.delay });
  }
  setFoes(list) { this.foes = [...list]; this.conn.send({ t: 'set_foes', foes: this.foes }); }
  setLevel(v) { this.level = v; this.conn.send({ t: 'set_level', level: v }); }
  sendChat(text) { if (text.trim()) this.conn.send({ t: 'chat', text }); }
  /** 部屋の中で名前・ひとことを変える */
  saveProfile(name, flavor) {
    if (!name.trim()) return;
    this.name = name.trim(); this.flavor = flavor.trim();
    store.set(KEY.name, this.name); store.set(KEY.flavor, this.flavor);
    this.conn.send({ t: 'profile', name: this.name, flavor: this.flavor });
  }
  /** 進行役がいないときだけ、参加者が部屋名・パスワードを変えられる */
  saveRoom(name, password) { this.conn.send({ t: 'settings', name, password }); }
  /** 進行役のいない部屋で、自分が進行役になる */
  claimHost() { this.conn.send({ t: 'claim_host' }); }
  leave() { this.conn.send({ t: 'leave' }); session.remove(this.pidKey); location.href = '/'; }
  /** 名前を変える（いったん退室して入室フォームへ） */
  rename() {
    this.conn.send({ t: 'leave' }); session.remove(this.pidKey);
    this.conn.close(); this.pid = null; this.gs = null; this.phase = 'join';
  }

  /* ---------- 画面の常時点灯 ---------- */
  async keepAwake() {
    try {
      if ('wakeLock' in navigator && !this.#wake) {
        this.#wake = await navigator.wakeLock.request('screen');
        this.#wake.addEventListener('release', () => { this.#wake = null; });
      }
    } catch { /* noop */ }
  }
  destroy() { this.conn?.close(); }
}
