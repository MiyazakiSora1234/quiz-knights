// QUIZ KNIGHTS - Cloudflare Workers 版サーバー
//  - 静的ファイル(public/)は Workers Assets が配信（無制限・無料）
//  - GET  /api/rooms : 部屋一覧（Lobby Durable Object）
//  - WS   /ws?id=N   : 部屋 N の Durable Object（早押しの時計を1か所に集約）
//  - ゲーム処理は進行役のブラウザ側。サーバーは「部屋」「状態の中継」「早押し判定」だけを担当する。
//  - 早押し判定: 各クライアントが時計ずれ補正した押下時刻(ts)を送り、サーバーは
//    e = ts + ディレイ が最小の人を勝者にする。ただし通信遅延の許容(TOLERANCE_MS)の間は
//    後から届く「より早い押下」を待つ。
import { DurableObject } from 'cloudflare:workers';

const SLOTS = 16;
const TOLERANCE_MS = 150;
const HOST_GRACE_MS = 30 * 60e3; // 進行役が切断してから部屋を解放するまで

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/rooms') {
      const map = await env.LOBBY.get(env.LOBBY.idFromName('main')).list();
      const list = Array.from({ length: SLOTS }, (_, i) => {
        const r = map[i + 1];
        return { id: i + 1, used: !!r, name: r?.name || '', count: r?.count || 0, online: r?.online || 0, hasPw: !!r?.hasPw, started: !!r?.started };
      });
      return Response.json(list, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (url.pathname === '/ws') {
      const id = +url.searchParams.get('id');
      if (!(id >= 1 && id <= SLOTS)) return new Response('bad id', { status: 400 });
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
      return env.ROOM.get(env.ROOM.idFromName(String(id))).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

/** 部屋一覧のサマリーを保持する（1つだけ） */
export class Lobby extends DurableObject {
  async list() { return (await this.ctx.storage.get('rooms')) || {}; }
  async upsert(id, v) { const m = await this.list(); m[id] = v; await this.ctx.storage.put('rooms', m); }
  async remove(id) { const m = await this.list(); delete m[id]; await this.ctx.storage.put('rooms', m); }
}

const rnd = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => 'abcdefghjkmnpqrstuvwxyz23456789'[x % 31]).join(''); };
const send = (ws, m) => { try { ws.send(JSON.stringify(m)); } catch { /* 切断済み */ } };

/** 部屋ごとに1つ。WebSocket Hibernation を使い、待機中は課金・メモリを使わない */
export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.R = null;       // {id,name,password,hostKey,players:{pid:{...}},hostGone}
    this.state = null;   // 進行役が送ってくる表示用の状態
    this.buzz = { open: false, q: 0, eligible: {}, buzzes: {}, timer: null };
    ctx.blockConcurrencyWhile(async () => {
      this.R = (await ctx.storage.get('room')) || null;
      this.state = (await ctx.storage.get('state')) || null;
      const b = await ctx.storage.get('buzz');
      if (b) this.buzz = { ...this.buzz, open: b.open, q: b.q, eligible: b.eligible };
    });
  }

  async fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // ---- ヘルパー ----
  socks() { return this.ctx.getWebSockets(); }
  hostWs(except) { return this.socks().find(s => s !== except && s.deserializeAttachment()?.role === 'host'); }
  playerWs(pid, except) { return this.socks().filter(s => s !== except && s.deserializeAttachment()?.pid === pid); }
  isOnline(pid, except) { return this.playerWs(pid, except).length > 0; }
  save() { return this.ctx.storage.put('room', this.R); }
  toPlayers(m, except) { for (const s of this.socks()) { if (s !== except && s.deserializeAttachment()?.role === 'player') send(s, m); } }

  lobby(except) {
    const players = Object.values(this.R.players).map(p => ({ pid: p.pid, name: p.name, flavor: p.flavor, job: p.job, team: p.team, online: this.isOnline(p.pid, except) }));
    const h = this.hostWs(except); if (h) send(h, { t: 'lobby', players });
    this.toPlayers({ t: 'members', players: players.map(({ pid, name, flavor, online }) => ({ pid, name, flavor, online })) }, except);
    this.syncLobby(except);
  }
  syncLobby(except) {
    if (!this.R) return;
    const ps = Object.values(this.R.players);
    const stub = this.env.LOBBY.get(this.env.LOBBY.idFromName('main'));
    this.ctx.waitUntil(stub.upsert(this.R.id, { name: this.R.name, count: ps.length, online: ps.filter(p => this.isOnline(p.pid, except)).length, hasPw: !!this.R.password, started: !!this.state }));
  }
  async closeRoom(why) {
    if (this.buzz.timer) clearTimeout(this.buzz.timer);
    this.toPlayers({ t: 'closed', why });
    const id = this.R?.id;
    for (const s of this.socks()) { try { s.close(1000, 'closed'); } catch { /* noop */ } }
    this.R = null; this.state = null;
    this.buzz = { open: false, q: 0, eligible: {}, buzzes: {}, timer: null };
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    if (id) await this.env.LOBBY.get(this.env.LOBBY.idFromName('main')).remove(id);
  }
  async persistBuzz() { await this.ctx.storage.put('buzz', { open: this.buzz.open, q: this.buzz.q, eligible: this.buzz.eligible }); }

  async resolve() {
    const b = this.buzz; b.timer = null;
    const list = Object.entries(b.buzzes).map(([pid, e]) => ({ pid, e, name: this.R?.players[pid]?.name })).sort((x, y) => x.e - y.e);
    b.open = false; await this.persistBuzz();
    if (!list.length) return;
    const msg = { t: 'winner', q: b.q, pid: list[0].pid, name: list[0].name, ranking: list.map(x => ({ pid: x.pid, name: x.name, ms: x.e - list[0].e })) };
    const h = this.hostWs(); if (h) send(h, msg);
    this.toPlayers(msg);
  }

  // ---- WebSocket ----
  async webSocketMessage(ws, raw) {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const att = ws.deserializeAttachment() || {};

    if (m.t === 'ping') return send(ws, { t: 'pong', c: m.c, s: Date.now() });

    if (m.t === 'create') {
      if (this.R) return send(ws, { t: 'error', msg: 'その部屋はすでに使われています', code: 'taken' });
      const id = String(+m.id);
      if (!(+m.id >= 1 && +m.id <= SLOTS)) return send(ws, { t: 'error', msg: '部屋番号が不正です' });
      this.R = { id, name: String(m.name || `部屋${id}`).slice(0, 30), password: String(m.password || '').slice(0, 20), hostKey: rnd(20), players: {}, hostGone: null };
      await this.save();
      ws.serializeAttachment({ role: 'host' });
      send(ws, { t: 'created', room: id, name: this.R.name, hostKey: this.R.hostKey });
      return this.syncLobby();
    }
    if (m.t === 'host_resume') {
      if (!this.R || this.R.hostKey !== m.hostKey) return send(ws, { t: 'error', msg: '部屋が見つかりません', code: 'gone' });
      for (const s of this.socks()) if (s !== ws && s.deserializeAttachment()?.role === 'host') { try { s.close(1000, 'replaced'); } catch { /* noop */ } }
      this.R.hostGone = null; await this.save(); await this.ctx.storage.deleteAlarm();
      ws.serializeAttachment({ role: 'host' });
      send(ws, { t: 'created', room: this.R.id, name: this.R.name, hostKey: this.R.hostKey });
      return this.lobby();
    }
    if (m.t === 'join') {
      if (!this.R) return send(ws, { t: 'error', msg: 'その部屋は存在しません', code: 'gone' });
      let p = m.pid && this.R.players[m.pid];
      if (!p && this.R.password && this.R.password !== String(m.password || '')) return send(ws, { t: 'error', msg: 'パスワードが違います', code: 'pw' });
      if (!p) {
        const pid = rnd(8);
        p = { pid, name: String(m.name || '名無し').slice(0, 12), flavor: String(m.flavor || '').slice(0, 20), job: 'warrior', team: 'p' };
        this.R.players[pid] = p; await this.save();
      }
      ws.serializeAttachment({ role: 'player', pid: p.pid });
      send(ws, { t: 'joined', pid: p.pid, room: this.R.id, roomName: this.R.name, name: p.name, flavor: p.flavor, job: p.job, team: p.team });
      if (this.state) send(ws, { t: 'state', state: this.state });
      return this.lobby();
    }
    if (!this.R) return;

    if (att.role === 'host') {
      if (m.t === 'state') { this.state = m.state; this.ctx.waitUntil(this.ctx.storage.put('state', m.state)); this.toPlayers({ t: 'state', state: m.state }); }
      else if (m.t === 'open') {
        if (this.buzz.timer) clearTimeout(this.buzz.timer);
        this.buzz = { open: true, q: m.q, eligible: m.eligible || {}, buzzes: {}, timer: null };
        await this.persistBuzz();
        this.toPlayers({ t: 'open', q: m.q, eligible: Object.keys(this.buzz.eligible) });
      } else if (m.t === 'lock') {
        if (this.buzz.timer) clearTimeout(this.buzz.timer);
        this.buzz.open = false; await this.persistBuzz(); this.toPlayers({ t: 'locked' });
      } else if (m.t === 'kick') {
        const p = this.R.players[m.pid];
        if (p) { for (const s of this.playerWs(m.pid)) { send(s, { t: 'closed', why: '進行役に退室させられました' }); s.close(1000, 'kicked'); } delete this.R.players[m.pid]; await this.save(); this.lobby(); }
      } else if (m.t === 'close') await this.closeRoom('進行役が部屋を閉じました');
      else if (m.t === 'endgame') { this.state = null; await this.ctx.storage.delete('state'); this.toPlayers({ t: 'ended' }); this.syncLobby(); }
      return;
    }

    if (att.role === 'player') {
      const pid = att.pid, p = this.R.players[pid];
      if (!p) return;
      if (m.t === 'profile') { if (m.job) p.job = m.job; if (m.team) p.team = m.team; await this.save(); return this.lobby(); }
      if (m.t === 'leave') { delete this.R.players[pid]; await this.save(); ws.serializeAttachment({}); return this.lobby(ws); }
      if (m.t === 'buzz') {
        const b = this.buzz;
        if (!b.open || !(pid in b.eligible) || pid in b.buzzes) return;
        const arrival = Date.now();
        const ts = Math.min(arrival, Math.max(arrival - 1000, +m.ts || arrival)); // 時計の偽装を限定
        b.buzzes[pid] = ts + (b.eligible[pid] || 0);
        send(ws, { t: 'ack' });
        const eMin = Math.min(...Object.values(b.buzzes));
        if (b.timer) clearTimeout(b.timer);
        b.timer = setTimeout(() => this.resolve(), Math.max(0, eMin + TOLERANCE_MS - Date.now()));
      }
    }
  }

  async webSocketClose(ws) {
    if (!this.R) return;
    const att = ws.deserializeAttachment() || {};
    if (att.role === 'host' && !this.hostWs(ws)) {
      this.R.hostGone = Date.now(); await this.save();
      await this.ctx.storage.setAlarm(Date.now() + HOST_GRACE_MS);
    } else if (att.role === 'player') this.lobby(ws);
  }
  async webSocketError(ws) { return this.webSocketClose(ws); }

  async alarm() {
    if (this.R?.hostGone && Date.now() - this.R.hostGone >= HOST_GRACE_MS - 1000) await this.closeRoom('進行役が長時間不在のため部屋を閉じました');
  }
}
