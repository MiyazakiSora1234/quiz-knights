// 進行役の状態: 部屋の接続・名簿・バトル（engine）・早押しの受付/配信
import { createBattle, SELECTABLE, BOSS, BERSERKER_DELAY_MS, GENRES, jobName, statusTags } from './engine.js';
import { Conn } from './net.js';
import { ask, toast, store, sfx } from './ui.svelte.js';

const vj = j => (SELECTABLE.includes(j) ? j : 'warrior');
let uidc = 0;

export class HostStore {
  id; conn; battle;
  status = $state('connecting');     // connecting | ready | reconnecting
  roomName = $state('');
  lobby = $state([]);
  roster = $state([]);
  mode = $state('cpu');
  boss = $state(1);
  penalty = $state(true);
  genresText = $state(store.get('qr_genres') || GENRES.join('、'));
  G = $state(null);
  busy = $state(false);
  canUndo = $state(false);
  rank = $state('');
  rtt = $state(null);
  saved = $state(null);
  #openedFor = null;
  #lobbyInit = false;
  #closing = false;

  constructor(id) {
    this.id = id;
    this.battle = createBattle({
      ask, toast,
      changed: snap => { this.G = snap; this.busy = this.battle.busy; this.canUndo = this.battle.canUndo; this.#publish(); },
      persist: G => store.set('qr_save_' + id, JSON.stringify(G)),
    });
    try { this.saved = JSON.parse(store.get('qr_save_' + id)); } catch { this.saved = null; }
    if (this.saved && this.saved.over) this.saved = null;
  }

  /** 盗賊が選べるジャンル（区切りは、 , スペース / のどれでも可） */
  get genreList() {
    const l = [...new Set(this.genresText.split(/[、,，\s/]+/).map(x => x.trim()).filter(Boolean))].slice(0, 12);
    return l.length ? l : [...GENRES];
  }
  resetGenres() { this.genresText = GENRES.join('、'); }
  get playersNamed() { return this.roster.filter(p => p.name.trim()); }
  get online() { return this.lobby.filter(p => p.online).length; }
  get joinUrl() { return `${location.origin}/play?id=${this.id}`; }
  /** 開始できない理由（空なら開始可能） */
  get startBlock() {
    const ps = this.playersNamed;
    if (!ps.length) return '参加者が入室すると開始できます';
    if (this.mode === 'pvp') {
      if (!ps.some(p => p.team === 'p') || !ps.some(p => p.team === 'e')) return '両チームに1人以上が必要です';
    }
    return '';
  }

  /* ---------- 接続 ---------- */
  connect() {
    const key = store.get('qr_hk_' + this.id);
    if (!this.id || !key) { location.href = '/'; return; }
    this.conn = new Conn(this.id, {
      status: s => { if (this.status === 'replaced') return; this.status = s === 'open' ? this.status : s; },
      open: () => this.conn.send({ t: 'host_resume', id: this.id, hostKey: key }),
      clock: c => { this.rtt = Math.round(c.rtt); },
      message: m => this.#onMessage(m),
    });
    this.conn.connect();
  }
  destroy() { this.#closing = true; this.conn?.close(); }
  /** 別の画面に奪われた進行役を、この画面で引き継ぐ */
  takeOver() { this.status = 'connecting'; this.conn.connect(); }

  #onMessage(m) {
    if (m.t === 'created') {
      this.status = 'ready'; this.roomName = m.name; this.#openedFor = null;
      if (this.G) this.#publish();
    } else if (m.t === 'error') {
      store.set('qr_hk_' + this.id, '');
      try { localStorage.removeItem('qr_hk_' + this.id); } catch { /* noop */ }
      toast(m.msg, 3000); this.#closing = true;
      setTimeout(() => { location.href = '/'; }, 1400);
    } else if (m.t === 'replaced') {
      this.status = 'replaced'; this.conn.close();
    } else if (m.t === 'lobby') {
      if (this.#lobbyInit) {
        for (const p of m.players) {
          const o = this.lobby.find(x => x.pid === p.pid);
          if (!o) toast(`${p.name} が入室しました`);
          else if (!o.online && p.online) toast(`${p.name} が再接続しました`);
          else if (o.online && !p.online) toast(`${p.name} の接続が切れました`);
        }
        for (const o of this.lobby) if (!m.players.find(p => p.pid === o.pid)) toast(`${o.name} が退室しました`);
      }
      this.#lobbyInit = true;
      this.lobby = m.players;
      this.#syncRoster();
    } else if (m.t === 'winner') {
      sfx.buzz();
      this.rank = m.ranking.map((x, i) => `${i + 1}. ${x.name}${i ? ` (+${Math.round(x.ms)}ms)` : ''}`).join('　');
      const G = this.battle.G;
      if (G && !this.battle.busy && !G.over && G.sel == null && G.pids && G.pids[m.pid] != null) this.battle.select(G.pids[m.pid]);
    }
  }

  #syncRoster() {
    const ids = new Set(this.lobby.map(p => p.pid));
    this.roster = this.roster.filter(p => !p.pid || ids.has(p.pid));
    for (const lp of this.lobby) {
      const row = this.roster.find(p => p.pid === lp.pid);
      if (!row) this.roster.push({ key: ++uidc, name: lp.name, flavor: lp.flavor || '', job: vj(lp.job), team: lp.team || 'p', pid: lp.pid, online: lp.online });
      else {
        row.online = lp.online; row.flavor = lp.flavor || '';
        if (!row.touchedJob) row.job = vj(lp.job);
        if (!row.touchedTeam) row.team = lp.team || row.team;
      }
    }
  }
  addGuest() {
    const n = this.roster.filter(p => !p.pid).length + 1;
    this.roster.push({ key: ++uidc, name: `ゲスト${n}`, flavor: '', job: 'warrior', team: this.roster.length % 2 ? 'e' : 'p', pid: null, online: false, touchedJob: true, touchedTeam: true });
  }
  remove(p) {
    if (p.pid) this.conn.send({ t: 'kick', pid: p.pid });
    this.roster = this.roster.filter(x => x !== p);
  }

  /* ---------- バトル ---------- */
  start() {
    if (this.startBlock) { toast(this.startBlock); return; }
    store.set('qr_genres', this.genresText);
    this.battle.start({ players: this.playersNamed.map(p => ({ name: p.name, job: p.job, team: p.team, pid: p.pid })), mode: this.mode, boss: this.boss, bossPenalty: this.penalty, genres: this.genreList });
    this.saved = null; this.rank = ''; this.#openedFor = null;
  }
  resume() { if (this.saved) { this.battle.load(this.saved); this.saved = null; this.#openedFor = null; } }
  discardSaved() { this.saved = null; try { localStorage.removeItem('qr_save_' + this.id); } catch { /* noop */ } }
  quit() {
    this.battle.reset(); this.#openedFor = null; this.rank = '';
    try { localStorage.removeItem('qr_save_' + this.id); } catch { /* noop */ }
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

  closeRoom() {
    this.#closing = true; this.conn.send({ t: 'close' });
    try { localStorage.removeItem('qr_hk_' + this.id); localStorage.removeItem('qr_save_' + this.id); } catch { /* noop */ }
    setTimeout(() => { location.href = '/'; }, 200);
  }
  copyUrl = async () => {
    try { await navigator.clipboard.writeText(this.joinUrl); toast('参加用URLをコピーしました'); } catch { toast(this.joinUrl, 6000); }
  };

  /* ---------- 配信 ---------- */
  #publish(force = false) {
    const G = this.battle.G; if (!G || !this.conn) return;
    this.conn.send({
      t: 'state', state: {
        mode: G.mode, q: G.q, over: G.over, pids: G.pids, sel: G.sel,
        genre: (G.genre && G.genreFor === G.q) ? `ジャンル：${G.genre}` : '',
        units: G.units.map(u => ({ id: u.id, name: u.name, job: u.job, jobName: jobName(u), side: u.side, hp: u.hp, maxHp: u.maxHp, alive: u.alive, ghost: !!u.ghost, restNow: u.restNow, guards: u.guards, isBoss: u.isBoss, atk: u.atk, st: statusTags(u, false, G.q) })),
        log: G.log.slice(0, 14).map(l => l.m),
        stats: G.stats || {},
      },
    });
    if (G.sel == null && !G.over && (force || this.#openedFor !== G.q)) {
      this.#openedFor = G.q;
      const eligible = {};
      for (const [pid, uid] of Object.entries(G.pids || {})) {
        const u = G.units.find(x => x.id === uid);
        if (u && (u.alive || u.ghost) && !u.restNow) eligible[pid] = (u.job === 'berserker' || u.delayQ === G.q) ? BERSERKER_DELAY_MS : 0;
      }
      this.conn.send({ t: 'open', q: G.q, eligible });
    }
  }
}

export { BOSS };
