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
    this.chat = [];                // 直近のチャット（メモリのみ）
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
  /** チャットを全員（進行役含む）に配る。直近50件は入室した人に送る */
  say(entry) {
    const e = { t: 'chat', ts: Date.now(), ...entry };
    this.chat.push(e); if (this.chat.length > 50) this.chat.shift();
    for (const s of this.socks()) if (this.roleOf(s).role) send(s, e);
  }
  save() { return this.ctx.storage.put('room', this.R); }

  /** 参加者一覧を進行役・参加者に配り、部屋一覧のサマリーも更新する */
  lobby(except) {
    const players = Object.values(this.R.players).map(p => ({
      pid: p.pid, name: p.name, flavor: p.flavor, job: p.job, team: p.team,
      online: this.isOnline(p.pid, except), rtt: this.rtts.get(p.pid) ?? null,
    }));
    const h = this.hostWs(except); if (h) send(h, { t: 'lobby', players });
    const hasHost = !!this.R.hostKey;
    this.toPlayers({ t: 'members', roomName: this.R.name, hasHost, hostOnline: hasHost && !!this.hostWs(except), players: players.map(({ pid, name, flavor, online, job, team }) => ({ pid, name, flavor, online, job, team })) }, except);
    this.syncLobby(except);
  }
  syncLobby(except) {
    if (!this.R) return;
    const ps = Object.values(this.R.players);
    this.ctx.waitUntil(lobbyStub(this.env).upsert(this.R.id, {
      name: this.R.name, count: ps.length, online: ps.filter(p => this.isOnline(p.pid, except)).length,
      hasPw: !!this.R.password, started: !!this.state, hasHost: !!this.R.hostKey,
    }));
  }

  async closeRoom(why) {
    clearTimeout(this.timer);
    this.toPlayers({ t: 'closed', why });
    const id = this.R?.id;
    for (const s of this.socks()) { try { s.close(1000, 'closed'); } catch { /* noop */ } }
    this.R = null; this.state = null; this.chat = []; this.round = new BuzzRound();
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
    if (m.t === 'chat') return this.onChat(ws, m);
    if (!this.R) return;
    const att = this.roleOf(ws);
    if (att.role === 'host') return this.onHostMessage(m);
    if (att.role === 'player') return this.onPlayerMessage(ws, att.pid, m);
  }

  async onCreate(ws, m) {
    if (this.R) return fail(ws, 'その部屋はすでに使われています', 'taken');
    const id = String(+m.id);
    if (!(+m.id >= 1 && +m.id <= SLOTS)) return fail(ws, '部屋番号が不正です');
    // host:false … 進行役を決めずに部屋だけ作る（作った人は参加者として入り、あとで誰かが進行役になる）
    const withHost = m.host !== false;
    this.R = { id, name: String(m.name || `部屋${id}`).slice(0, 30), password: String(m.password || '').slice(0, 20), hostKey: withHost ? rnd(20) : null, players: {}, hostGone: null };
    await this.save();
    if (withHost) ws.serializeAttachment({ role: 'host' });
    send(ws, { t: 'created', room: id, name: this.R.name, ...(withHost ? { hostKey: this.R.hostKey } : {}) });
    this.syncLobby();
  }

  onChat(ws, m) {
    const text = String(m.text || '').trim().slice(0, 200);
    if (!this.R || !text) return;
    const att = this.roleOf(ws);
    if (att.role === 'host') return this.say({ name: '進行役', text, host: true });
    if (att.role === 'player' && this.R.players[att.pid]) this.say({ name: this.R.players[att.pid].name, text, pid: att.pid });
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
    send(ws, { t: 'created', room: this.R.id, name: this.R.name, password: this.R.password, hostKey: this.R.hostKey });
    this.lobby();
  }

  async onJoin(ws, m) {
    if (!this.R) return fail(ws, 'その部屋は存在しません', 'gone');
    let p = m.pid && this.R.players[m.pid];
    if (!p && this.R.password && this.R.password !== String(m.password || '')) return fail(ws, 'パスワードが違います', 'pw');
    let isNew = false;
    if (!p) {
      isNew = true;
      const pid = rnd(8);
      p = { pid, name: String(m.name || '名無し').slice(0, 12), flavor: String(m.flavor || '').slice(0, 20), job: 'warrior', team: 'p' };
      this.R.players[pid] = p;
      await this.save();
    }
    ws.serializeAttachment({ role: 'player', pid: p.pid });
    if (!this.R.hostKey && this.R.hostGone) { this.R.hostGone = null; await this.save(); await this.ctx.storage.deleteAlarm(); }
    send(ws, { t: 'joined', pid: p.pid, room: this.R.id, roomName: this.R.name, name: p.name, flavor: p.flavor, job: p.job, team: p.team });
    for (const e of this.chat) send(ws, e);
    if (this.state) send(ws, { t: 'state', state: this.state });
    if (isNew) this.say({ sys: true, text: `${p.name} が入室しました。` });
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
      case 'settings': return this.updateSettings(m);
      case 'ask': {                                      // 回答者の端末に選択ダイアログを出す
        const { to, qid, title, sub, options } = m;
        for (const s of this.playerWs(to)) send(s, { t: 'ask', qid, title, sub, options });
        return;
      }
      case 'ask_close': this.toPlayers({ t: 'ask_close', qid: m.qid }); return;
      case 'transfer': return this.transferHost(m.pid);
      case 'release': return this.releaseHost();
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
        if (typeof m.name === 'string' && m.name.trim()) p.name = m.name.trim().slice(0, 12);
        if (typeof m.flavor === 'string') p.flavor = m.flavor.trim().slice(0, 20);
        if (m.job) p.job = m.job;
        if (m.team) p.team = m.team;
        await this.save();
        return this.lobby();
      case 'leave':
        this.say({ sys: true, text: `${p.name} が退室しました。` });
        delete this.R.players[pid];
        await this.save();
        ws.serializeAttachment({});
        return this.lobby(ws);
      case 'settings': if (!this.R.hostKey) return this.updateSettings(m); return;   // 進行役がいない間は誰でも変えられる
      case 'answer': this.toHost({ t: 'answer', pid, qid: m.qid, i: m.i }); return;
      case 'claim_host': return this.claimHost(ws, pid);
      case 'buzz':
        if (!this.round.canBuzz(pid)) return;
        if (m.rtt > 0) this.rtts.set(pid, clampRtt(m.rtt));
        this.round.record(pid, m.ts, Date.now());
        send(ws, { t: 'ack' });
        this.scheduleResolve();
    }
  }

  /** 部屋名・パスワードの変更（入室済みの人には影響しない） */
  async updateSettings(m) {
    if (typeof m.name === 'string' && m.name.trim()) this.R.name = m.name.trim().slice(0, 30);
    if (typeof m.password === 'string') this.R.password = m.password.slice(0, 20);
    await this.save();
    this.toHost({ t: 'settings', name: this.R.name, password: this.R.password });
    this.lobby();
  }

  /* ============================ 進行役の決定・交代 ============================ */
  /** 参加者を名簿から外し、新しい進行役の鍵を発行する（鍵を受け取った画面が /host に移る） */
  async grantHost(pid) {
    const hostKey = rnd(20);
    const ws = this.playerWs(pid);
    this.R.hostKey = hostKey;
    this.R.hostGone = Date.now();                       // 新しい進行役が繋ぐまでの猶予
    delete this.R.players[pid];
    await this.save();
    await this.ctx.storage.setAlarm(Date.now() + HOST_GRACE_MS);
    for (const s of ws) { send(s, { t: 'host_granted', hostKey }); s.serializeAttachment({}); }
  }
  /** 進行役がいない部屋で、参加者が自分から進行役になる（先着） */
  async claimHost(ws, pid) {
    if (this.R.hostKey) return fail(ws, 'すでに進行役がいます');
    await this.grantHost(pid);
    this.lobby();
  }
  /** いまの進行役が、参加者の1人に進行役を譲る */
  async transferHost(pid) {
    if (!this.R.players[pid] || !this.isOnline(pid)) return this.toHost({ t: 'notice', msg: 'その人はオンラインではありません' });
    const old = this.hostWs();
    await this.grantHost(pid);
    this.endBattleState();
    if (old) { send(old, { t: 'demoted' }); old.serializeAttachment({}); }
    this.lobby();
  }
  /** 進行役をやめる。部屋は残り、誰かがあとから進行役になれる */
  async releaseHost() {
    const old = this.hostWs();
    this.R.hostKey = null; this.R.hostGone = null;
    await this.save();
    await this.ctx.storage.deleteAlarm();
    this.endBattleState();
    if (old) { send(old, { t: 'demoted' }); old.serializeAttachment({}); }
    this.lobby();
  }
  /** 進行役が替わるとバトルの状態は引き継げないので、参加者の画面をロビーに戻す */
  endBattleState() {
    this.state = null; clearTimeout(this.timer); this.round = new BuzzRound();
    this.ctx.waitUntil(Promise.all([this.ctx.storage.delete('state'), this.persistRound()]));
    this.toPlayers({ t: 'ended' });
  }

  /* ============================ 切断・タイマー ============================ */
  async webSocketClose(ws) {
    if (!this.R) return;
    const att = this.roleOf(ws);
    if (att.role === 'host' && !this.hostWs(ws)) {
      this.R.hostGone = Date.now();
      await this.save();
      await this.ctx.storage.setAlarm(Date.now() + HOST_GRACE_MS);
    } else if (att.role === 'player') {
      // 進行役のいない部屋で、全員がいなくなったら猶予のあとに閉じる
      if (!this.R.hostKey && !this.R.hostGone && !Object.keys(this.R.players).some(pid => this.isOnline(pid, ws))) {
        this.R.hostGone = Date.now(); await this.save(); await this.ctx.storage.setAlarm(Date.now() + HOST_GRACE_MS);
      }
      this.lobby(ws);
    }
  }
  async webSocketError(ws) { return this.webSocketClose(ws); }

  async alarm() {
    if (this.R?.hostGone && Date.now() - this.R.hostGone >= HOST_GRACE_MS - 1000) await this.closeRoom(this.R.hostKey ? '進行役が長時間不在のため部屋を閉じました' : '長時間だれもいないため部屋を閉じました');
  }
}
