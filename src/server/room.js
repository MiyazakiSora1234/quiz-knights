import { DurableObject } from 'cloudflare:workers';
import { SLOTS, HOST_GRACE_MS } from './config.js';
import { BuzzRound, clampRtt } from './buzz.js';
import { lobbyStub } from './lobby.js';

const ID_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
const rnd = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => ID_CHARS[x % ID_CHARS.length]).join(''); };
const send = (ws, m) => { try { ws.send(JSON.stringify(m)); } catch { /* 切断済み */ } };
const fail = (ws, msg, code) => send(ws, { t: 'error', msg, ...(code ? { code } : {}) });

/**
 * 部屋ごとに1つ。WebSocket Hibernation を使い、待機中は課金・メモリを使わない。
 * 接続には役割 {role:'host'} / {role:'player', pid} を付ける（Hibernation から復帰しても残る）。
 */
export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.R = null;                 // {id,name,password,hostKey,players:{pid:{...}},hostGone}
    this.state = null;             // 進行役が送ってくる表示用の状態
    this.rtts = new Map();         // pid -> 往復遅延(ms)。参加者が自己申告（メモリのみ）
    this.round = new BuzzRound();  // 今の問題の早押し
    this.timer = null;             // 勝者を確定するタイマー
    ctx.blockConcurrencyWhile(async () => {
      this.R = (await ctx.storage.get('room')) || null;
      this.state = (await ctx.storage.get('state')) || null;
      this.round = BuzzRound.from(await ctx.storage.get('buzz'));
    });
  }

  async fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  /* ============================ 接続・配信のヘルパー ============================ */
  socks() { return this.ctx.getWebSockets(); }
  roleOf(ws) { return ws.deserializeAttachment() || {}; }
  hostWs(except) { return this.socks().find(s => s !== except && this.roleOf(s).role === 'host'); }
  playerWs(pid, except) { return this.socks().filter(s => s !== except && this.roleOf(s).pid === pid); }
  isOnline(pid, except) { return this.playerWs(pid, except).length > 0; }
  toPlayers(m, except) { for (const s of this.socks()) if (s !== except && this.roleOf(s).role === 'player') send(s, m); }
  toHost(m) { const h = this.hostWs(); if (h) send(h, m); }
  save() { return this.ctx.storage.put('room', this.R); }

  /** 参加者一覧を進行役・参加者に配り、部屋一覧のサマリーも更新する */
  lobby(except) {
    const players = Object.values(this.R.players).map(p => ({
      pid: p.pid, name: p.name, flavor: p.flavor, job: p.job, team: p.team,
      online: this.isOnline(p.pid, except), rtt: this.rtts.get(p.pid) ?? null,
    }));
    const h = this.hostWs(except); if (h) send(h, { t: 'lobby', players });
    this.toPlayers({ t: 'members', players: players.map(({ pid, name, flavor, online }) => ({ pid, name, flavor, online })) }, except);
    this.syncLobby(except);
  }
  syncLobby(except) {
    if (!this.R) return;
    const ps = Object.values(this.R.players);
    this.ctx.waitUntil(lobbyStub(this.env).upsert(this.R.id, {
      name: this.R.name, count: ps.length, online: ps.filter(p => this.isOnline(p.pid, except)).length,
      hasPw: !!this.R.password, started: !!this.state,
    }));
  }

  async closeRoom(why) {
    clearTimeout(this.timer);
    this.toPlayers({ t: 'closed', why });
    const id = this.R?.id;
    for (const s of this.socks()) { try { s.close(1000, 'closed'); } catch { /* noop */ } }
    this.R = null; this.state = null; this.round = new BuzzRound();
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    if (id) await lobbyStub(this.env).remove(id);
  }

  /* ================================= 早押し ================================= */
  persistRound() { return this.ctx.storage.put('buzz', this.round.toJSON()); }

  /** 遅れて届く押下を待つ時間が過ぎたら勝者を確定する */
  scheduleResolve() {
    clearTimeout(this.timer);
    const wait = this.round.deadline(pid => this.rtts.get(pid), pid => this.isOnline(pid)) - Date.now();
    this.timer = setTimeout(() => this.resolve(), Math.max(0, wait));
  }
  async resolve() {
    this.timer = null;
    const round = this.round;
    const ranking = round.ranking(pid => this.R?.players[pid]?.name);
    round.close();
    await this.persistRound();
    if (!ranking.length) return;
    const msg = { t: 'winner', q: round.q, pid: ranking[0].pid, name: ranking[0].name, ranking };
    this.toHost(msg);
    this.toPlayers(msg);
  }

  /* ============================ WebSocket のメッセージ ============================ */
  async webSocketMessage(ws, raw) {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'ping') return send(ws, { t: 'pong', c: m.c, s: Date.now() });
    // 役割を持たない接続でできること
    if (m.t === 'create') return this.onCreate(ws, m);
    if (m.t === 'host_resume') return this.onHostResume(ws, m);
    if (m.t === 'join') return this.onJoin(ws, m);
    if (!this.R) return;
    const att = this.roleOf(ws);
    if (att.role === 'host') return this.onHostMessage(m);
    if (att.role === 'player') return this.onPlayerMessage(ws, att.pid, m);
  }

  async onCreate(ws, m) {
    if (this.R) return fail(ws, 'その部屋はすでに使われています', 'taken');
    const id = String(+m.id);
    if (!(+m.id >= 1 && +m.id <= SLOTS)) return fail(ws, '部屋番号が不正です');
    this.R = { id, name: String(m.name || `部屋${id}`).slice(0, 30), password: String(m.password || '').slice(0, 20), hostKey: rnd(20), players: {}, hostGone: null };
    await this.save();
    ws.serializeAttachment({ role: 'host' });
    send(ws, { t: 'created', room: id, name: this.R.name, hostKey: this.R.hostKey });
    this.syncLobby();
  }

  async onHostResume(ws, m) {
    if (!this.R || this.R.hostKey !== m.hostKey) return fail(ws, '部屋が見つかりません', 'gone');
    // 別の画面が進行役だったら、そちらに知らせて引き継ぐ
    for (const s of this.socks()) {
      if (s !== ws && this.roleOf(s).role === 'host') { send(s, { t: 'replaced' }); try { s.close(1000, 'replaced'); } catch { /* noop */ } }
    }
    this.R.hostGone = null;
    await this.save();
    await this.ctx.storage.deleteAlarm();
    ws.serializeAttachment({ role: 'host' });
    send(ws, { t: 'created', room: this.R.id, name: this.R.name, hostKey: this.R.hostKey });
    this.lobby();
  }

  async onJoin(ws, m) {
    if (!this.R) return fail(ws, 'その部屋は存在しません', 'gone');
    let p = m.pid && this.R.players[m.pid];
    if (!p && this.R.password && this.R.password !== String(m.password || '')) return fail(ws, 'パスワードが違います', 'pw');
    if (!p) {
      const pid = rnd(8);
      p = { pid, name: String(m.name || '名無し').slice(0, 12), flavor: String(m.flavor || '').slice(0, 20), job: 'warrior', team: 'p' };
      this.R.players[pid] = p;
      await this.save();
    }
    ws.serializeAttachment({ role: 'player', pid: p.pid });
    send(ws, { t: 'joined', pid: p.pid, room: this.R.id, roomName: this.R.name, name: p.name, flavor: p.flavor, job: p.job, team: p.team });
    if (this.state) send(ws, { t: 'state', state: this.state });
    this.lobby();
  }

  /* ---- 進行役のメッセージ ---- */
  async onHostMessage(m) {
    switch (m.t) {
      case 'state': {
        const first = !this.state;
        this.state = m.state;
        this.ctx.waitUntil(this.ctx.storage.put('state', m.state));
        this.toPlayers({ t: 'state', state: m.state });
        if (first) this.syncLobby();                   // 一覧の「バトル中」表示を更新
        return;
      }
      case 'open':                                      // 次の問題の早押し受付を始める
        clearTimeout(this.timer);
        this.round = BuzzRound.start(m.q, m.eligible);
        await this.persistRound();
        this.toPlayers({ t: 'open', q: m.q, eligible: Object.keys(this.round.eligible) });
        return;
      case 'lock':
        clearTimeout(this.timer);
        this.round.close();
        await this.persistRound();
        this.toPlayers({ t: 'locked' });
        return;
      case 'kick': {
        const p = this.R.players[m.pid];
        if (!p) return;
        for (const s of this.playerWs(m.pid)) { send(s, { t: 'closed', why: '進行役に退室させられました' }); s.close(1000, 'kicked'); }
        delete this.R.players[m.pid];
        await this.save();
        this.lobby();
        return;
      }
      case 'close': return this.closeRoom('進行役が部屋を閉じました');
      case 'endgame':
        this.state = null;
        await this.ctx.storage.delete('state');
        this.toPlayers({ t: 'ended' });
        this.syncLobby();
    }
  }

  /* ---- 参加者のメッセージ ---- */
  async onPlayerMessage(ws, pid, m) {
    const p = this.R.players[pid];
    if (!p) return;
    switch (m.t) {
      case 'rtt': {
        const v = clampRtt(m.rtt), old = this.rtts.get(pid);
        this.rtts.set(pid, v);
        if (old == null || Math.abs(old - v) > 8) this.lobby();   // 進行役の遅延表示を更新
        return;
      }
      case 'profile':
        if (m.job) p.job = m.job;
        if (m.team) p.team = m.team;
        await this.save();
        return this.lobby();
      case 'leave':
        delete this.R.players[pid];
        await this.save();
        ws.serializeAttachment({});
        return this.lobby(ws);
      case 'buzz':
        if (!this.round.canBuzz(pid)) return;
        if (m.rtt > 0) this.rtts.set(pid, clampRtt(m.rtt));
        this.round.record(pid, m.ts, Date.now());
        send(ws, { t: 'ack' });
        this.scheduleResolve();
    }
  }

  /* ============================ 切断・タイマー ============================ */
  async webSocketClose(ws) {
    if (!this.R) return;
    const att = this.roleOf(ws);
    if (att.role === 'host' && !this.hostWs(ws)) {
      this.R.hostGone = Date.now();
      await this.save();
      await this.ctx.storage.setAlarm(Date.now() + HOST_GRACE_MS);
    } else if (att.role === 'player') this.lobby(ws);
  }
  async webSocketError(ws) { return this.webSocketClose(ws); }

  async alarm() {
    if (this.R?.hostGone && Date.now() - this.R.hostGone >= HOST_GRACE_MS - 1000) await this.closeRoom('進行役が長時間不在のため部屋を閉じました');
  }
}
