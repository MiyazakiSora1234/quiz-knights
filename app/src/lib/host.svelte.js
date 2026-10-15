// 進行役の状態: 部屋の接続・名簿・バトル（engine）・早押しの受付と配信
import { createBattle } from './engine.js';
import { Conn } from './net.js';
import { ask, toast, confirmAsk } from './ui.svelte.js';
import { sfx } from './sound.svelte.js';
import { store, KEY } from './storage.js';
import { syncRoster, startBlock } from './roster.js';
import { publicState, eligibleDelays } from './publish.js';

let rowKey = 0;
const nextKey = () => ++rowKey;
const goList = (ms) => setTimeout(() => { location.href = '/'; }, ms);

export class HostStore {
  id; conn; battle;
  status = $state('connecting');     // connecting | ready | reconnecting | replaced
  roomName = $state('');
  password = $state('');
  lobby = $state([]);                // サーバーから届いた参加者一覧
  roster = $state([]);               // 準備画面の名簿（進行役が職業などを調整できる）
  mode = $state('cpu');
  boss = $state(1);
  penalty = $state(true);
  G = $state(null);                  // バトルの状態（engine から届く写し）
  busy = $state(false);
  canUndo = $state(false);
  rank = $state('');                 // 直近の早押しの順位
  rtt = $state(null);
  saved = $state(null);              // 途中のバトル（再開できる）
  #openedFor = null;                 // 早押しを受け付け済みの問題番号
  #lobbyInit = false;

  constructor(id) {
    this.id = id;
    this.battle = createBattle({
      ask, toast,
      changed: snap => { this.G = snap; this.busy = this.battle.busy; this.canUndo = this.battle.canUndo; this.#publish(); queueMicrotask(() => this.#joinLate()); },
      persist: G => store.set(KEY.save(id), JSON.stringify(G)),
    });
    try { this.saved = JSON.parse(store.get(KEY.save(id))); } catch { this.saved = null; }
    if (this.saved?.over) this.saved = null;
  }

  /* ---------- 画面が使う導出値 ---------- */
  get playersNamed() { return this.roster.filter(p => p.name.trim()); }
  get online() { return this.lobby.filter(p => p.online).length; }
  get joinUrl() { return `${location.origin}/play?id=${this.id}`; }
  get startBlock() { return startBlock(this.roster, this.mode); }

  /* ---------- 接続 ---------- */
  connect() {
    const key = store.get(KEY.hostKey(this.id));
    if (!this.id || !key) { location.href = '/'; return; }
    this.conn = new Conn(this.id, {
      status: s => { if (this.status === 'replaced') return; this.status = s === 'open' ? this.status : s; },
      open: () => this.conn.send({ t: 'host_resume', id: this.id, hostKey: key }),
      clock: c => { this.rtt = Math.round(c.rtt); },
      message: m => this.#onMessage(m),
    });
    this.conn.connect();
  }
  destroy() { this.conn?.close(); }
  /** 別の画面に奪われた進行役を、この画面で引き継ぐ */
  takeOver() { this.status = 'connecting'; this.conn.connect(); }

  #onMessage(m) {
    switch (m.t) {
      case 'created':
        this.status = 'ready'; this.roomName = m.name; this.password = m.password ?? ''; this.#openedFor = null;
        if (this.G) this.#publish();
        return;
      case 'error':
        store.remove(KEY.hostKey(this.id));
        toast(m.msg, 3000); goList(1400);
        return;
      case 'demoted':
        store.remove(KEY.hostKey(this.id)); store.remove(KEY.save(this.id)); this.conn.close();
        toast('進行役をおりました。参加者として入室します'); setTimeout(() => { location.href = `/play?id=${this.id}`; }, 700);
        return;
      case 'settings': this.roomName = m.name; this.password = m.password; toast('部屋の設定を変更しました'); return;
      case 'notice': toast(m.msg, 3000); return;
      case 'replaced':
        this.status = 'replaced'; this.conn.close();
        return;
      case 'lobby': return this.#onLobby(m.players);
      case 'winner': return this.#onWinner(m);
    }
  }
  #onLobby(players) {
    if (this.#lobbyInit) this.#announceChanges(players);
    this.#lobbyInit = true;
    this.lobby = players;
    syncRoster(this.roster, players, nextKey);
    this.#joinLate();
  }
  /** バトル中に入室した人を、途中参戦としてバトルに加える */
  #joinLate() {
    const G = this.battle.G;
    if (!G || G.over || this.battle.busy) return;
    let added = false;
    for (const r of this.roster) {
      if (r.pid && r.online && G.pids[r.pid] == null && this.battle.join({ name: r.name, job: r.job, team: r.team, pid: r.pid })) added = true;
    }
    if (added && this.battle.G.sel == null) this.reopen();   // 新しい人も押せるよう、受付を出し直す
  }
  /** 入室・再接続・切断・退室をトーストで知らせる（最初の一覧は除く） */
  #announceChanges(players) {
    for (const p of players) {
      const o = this.lobby.find(x => x.pid === p.pid);
      if (!o) toast(`${p.name} が入室しました`);
      else if (!o.online && p.online) toast(`${p.name} が再接続しました`);
      else if (o.online && !p.online) toast(`${p.name} の接続が切れました`);
    }
    for (const o of this.lobby) if (!players.find(p => p.pid === o.pid)) toast(`${o.name} が退室しました`);
  }
  /** 最初に押した人を回答者として自動で選ぶ */
  #onWinner(m) {
    sfx.buzz();
    this.rank = m.ranking.map((x, i) => `${i + 1}. ${x.name}${i ? ` (+${Math.round(x.ms)}ms)` : ''}`).join('　');
    const G = this.battle.G;
    if (G && !this.battle.busy && !G.over && G.sel == null && G.pids?.[m.pid] != null) this.battle.select(G.pids[m.pid]);
  }

  /* ---------- 名簿 ---------- */
  remove(p) {
    if (p.pid) this.conn.send({ t: 'kick', pid: p.pid });
    this.roster = this.roster.filter(x => x !== p);
  }

  /* ---------- バトル ---------- */
  start() {
    if (this.startBlock) { toast(this.startBlock); return; }
    this.battle.start({
      players: this.playersNamed.map(p => ({ name: p.name, job: p.job, team: p.team, pid: p.pid })),
      mode: this.mode, boss: this.boss, bossPenalty: this.penalty,
    });
    this.saved = null; this.rank = ''; this.#openedFor = null;
  }
  resume() { if (this.saved) { this.battle.load(this.saved); this.saved = null; this.#openedFor = null; } }
  discardSaved() { this.saved = null; store.remove(KEY.save(this.id)); }
  quit() {
    this.battle.reset(); this.#openedFor = null; this.rank = '';
    store.remove(KEY.save(this.id));
    this.conn.send({ t: 'endgame' });
  }
  select(id) {
    const G = this.battle.G; if (!G) return;
    if (G.sel === id) { this.battle.select(null); this.reopen(); return; }
    if (this.battle.select(id)) this.conn.send({ t: 'lock' });
  }
  deselect() { this.battle.select(null); this.reopen(); }
  correct() { return this.battle.correct(); }
  wrong() { return this.battle.wrong(); }
  skip() { return this.battle.skip(); }
  undo() { return this.battle.undo(); }
  reopen() { this.#openedFor = null; this.rank = ''; this.#publish(true); }

  saveRoom(name, password) { this.conn.send({ t: 'settings', name, password }); }
  /** 進行役を、いま入室している参加者に譲る */
  async transfer(p) {
    if (!(await confirmAsk(`${p.name} さんに進行役を譲りますか？`, '進行中のバトルは終了し、あなたは参加者になります。', '譲る', false))) return;
    this.conn.send({ t: 'transfer', pid: p.pid });
  }
  async release() {
    if (!(await confirmAsk('進行役をやめますか？', '部屋は残り、ほかの人が進行役になれます。進行中のバトルは終了します。', 'やめる'))) return;
    this.conn.send({ t: 'release' });
  }
  closeRoom() {
    this.conn.send({ t: 'close' });
    store.remove(KEY.hostKey(this.id)); store.remove(KEY.save(this.id));
    goList(200);
  }
  copyUrl = async () => {
    try { await navigator.clipboard.writeText(this.joinUrl); toast('参加用URLをコピーしました'); } catch { toast(this.joinUrl, 6000); }
  };

  /* ---------- 参加者への配信 ---------- */
  /** バトルの状態を配り、回答者が決まっていなければ次の早押しの受付を始める */
  #publish(force = false) {
    const G = this.battle.G;
    if (!G || !this.conn) return;
    this.conn.send({ t: 'state', state: publicState(G) });
    if (G.sel == null && !G.over && (force || this.#openedFor !== G.q)) {
      this.#openedFor = G.q;
      this.conn.send({ t: 'open', q: G.q, eligible: eligibleDelays(G) });
    }
  }
}
