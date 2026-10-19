import { DurableObject } from 'cloudflare:workers';
import {
  SLOTS, HOST_GRACE_MS, HOST_TAKEOVER_MS, BATTLE_MAX_CHARS, BOSS_COUNT, PERSONAL_DELAY_MAX, OFFLINE_PRUNE_MS,
  MAX_MSG_PLAYER, MAX_MSG_HOST, MAX_MSG_BANK, BANK_INTERVAL_MS, MAX_SOCKETS_PER_ROOM, MAX_SOCKETS_PER_IP, MAX_PLAYERS, MAX_PLAYERS_PER_IP,
  RATE_PLAYER, RATE_HOST, RATE_STRIKES_MAX, RATE_CHAT, FAIL_MAX, FAIL_LOCK_MS,
} from './config.js';
import { clean, safeEq, own, ipTag, Bucket, FailLock } from './safe.js';
import { JOB, BOSS } from '../app/src/lib/engine/data.js';
import { BuzzRound, clampRtt } from './buzz.js';
import { lobbyStub } from './lobby.js';

const ID_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
const rnd = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => ID_CHARS[x % ID_CHARS.length]).join(''); };
/** 職業・魔王として使ってよいキー（これ以外は、画面を壊すので受け付けない） */
const ALLOWED_JOBS = new Set([...Object.keys(JOB), ...Object.keys(BOSS).map(id => 'boss' + id)]);
const okJob = v => typeof v === 'string' && ALLOWED_JOBS.has(v);
/** 称号のid（t001〜）だけを通す。ほかの文字列は空にする（名前の横に出すだけの飾り） */
const cleanTitle = t => (typeof t === 'string' && /^t[0-9]{3}$/.test(t) ? t : '');
const cleanPw = v => clean(v, 20);
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
    this.battle = null;            // 進行役が送ってくるバトルの全状態（進行役が替わっても続きから進められるように、サーバーが預かる）
    this.cpuNames = {};            // CPUの pid（cpu:…） -> 名前（メモリのみ）
    this.rtts = new Map(); this.bankAt = new Map();         // pid -> 往復遅延(ms)。参加者が自己申告（メモリのみ）
    this.chat = [];                // 直近のチャット（メモリのみ）
    this.lastWinner = null;        // 直近の早押しの勝者（進行役が戻ったとき用）
    this.round = new BuzzRound();  // 今の問題の早押し
    this.timer = null;             // 勝者を確定するタイマー
    this.buckets = new WeakMap();  // 接続 -> メッセージの回数制限（メモリのみ）
    this.chatBuckets = new Map();  // pid（進行役は 'host'）-> チャットの回数制限
    this.fails = new FailLock(FAIL_MAX, FAIL_LOCK_MS);   // パスワード・鍵の総当たり対策（接続元ごと）
    ctx.blockConcurrencyWhile(async () => {
      this.R = (await ctx.storage.get('room')) || null;
      this.state = (await ctx.storage.get('state')) || null;
      this.battle = (await ctx.storage.get('battle')) || null;
      this.round = BuzzRound.from(await ctx.storage.get('buzz'));
    });
  }

  async fetch(request) {
    try { this.slot = new URL(request.url).searchParams.get('id'); } catch { /* noop */ }   // 接続先の部屋番号（作成時に照合する）
    // 接続の数に上限を設ける（部屋全体・同じ接続元）。接続元が分からない開発環境では、接続元ごとの数は数えない
    const tag = await ipTag(request.headers.get('CF-Connecting-IP') || '');
    if (this.socks().length >= MAX_SOCKETS_PER_ROOM) return new Response('room is busy', { status: 503, headers: { 'Retry-After': '10' } });
    if (tag && this.ctx.getWebSockets('ip:' + tag).length >= MAX_SOCKETS_PER_IP) return new Response('too many connections', { status: 429, headers: { 'Retry-After': '10' } });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, tag ? ['ip:' + tag] : []);
    return new Response(null, { status: 101, webSocket: client });
  }
  /** この接続の接続元の印（IP そのものではない）。分からなければ空 */
  tagOf(ws) { const t = this.ctx.getTags(ws).find(x => x.startsWith('ip:')); return t ? t.slice(3) : ''; }
  /** 参加者を pid で探す（'__proto__' などで、Object の中身を取り出されないように、自分自身のものだけ） */
  player(pid) { return this.R ? own(this.R.players, pid) : undefined; }
  /** メッセージの回数制限。超えた分は捨てて、続けて超えるなら接続を切る */
  allowMessage(ws, isHost) {
    let b = this.buckets.get(ws);
    if (!b) { const c = isHost ? RATE_HOST : RATE_PLAYER; b = new Bucket(c.cap, c.perSec); this.buckets.set(ws, b); }
    if (b.allow()) return true;
    if (b.strikes > RATE_STRIKES_MAX) { try { ws.close(1008, 'rate limit'); } catch { /* noop */ } }
    return false;
  }
  /** チャットの回数制限（1人ごと） */
  allowChat(key) {
    let b = this.chatBuckets.get(key);
    if (!b) { b = new Bucket(RATE_CHAT.cap, RATE_CHAT.perSec); this.chatBuckets.set(key, b); }
    return b.allow();
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
    // 長いこと接続が切れたままの人は、名簿から外す（部屋に幽霊が溜まらないように）
    const now = Date.now();
    let pruned = false;
    for (const p of Object.values(this.R.players)) {
      if (p.lastSeen && now - p.lastSeen > OFFLINE_PRUNE_MS && !this.isOnline(p.pid, except)) { delete this.R.players[p.pid]; pruned = true; }
    }
    if (pruned) this.ctx.waitUntil(this.save());
    const players = Object.values(this.R.players).map(p => ({
      pid: p.pid, name: p.name, flavor: p.flavor, title: p.title || '', job: p.job, team: p.team, delay: p.delay || 0,
      online: this.isOnline(p.pid, except), rtt: this.rtts.get(p.pid) ?? null,
    }));
    const boss = this.R.boss ?? 1, foes = this.R.foes ?? ['boss1'], level = this.R.level ?? 'normal';
    const h = this.hostWs(except); if (h) send(h, { t: 'lobby', players, boss, foes, level });
    const hasHost = !!this.R.hostKey;
    this.toPlayers({ t: 'members', roomName: this.R.name, boss, foes, level, hasHost, hostOnline: hasHost && !!this.hostWs(except), players: players.map(({ pid, name, flavor, title, online, job, team, delay }) => ({ pid, name, flavor, title, online, job, team, delay })) }, except);
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
    this.R = null; this.state = null; this.battle = null; this.lastWinner = null; this.chat = []; this.round = new BuzzRound();
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    if (id) await lobbyStub(this.env).remove(id);
  }

  /* ================================= 早押し ================================= */
  persistRound() { return this.ctx.storage.put('buzz', this.round.toJSON()); }
  /** 順位表に出す名前。CPU（pid が cpu: で始まる）は、進行役が知らせた名前 */
  nameOf = pid => this.R?.players[pid]?.name ?? this.cpuNames[pid] ?? (pid.startsWith('cpu:') ? 'CPU' : undefined);

  /** 遅れて届く押下を待つ時間が過ぎたら勝者を確定する */
  scheduleResolve() {
    clearTimeout(this.timer);
    const wait = this.round.deadline(pid => this.rtts.get(pid), pid => this.isOnline(pid)) - Date.now();
    this.timer = setTimeout(() => this.resolve(), Math.max(0, wait));
  }
  async resolve() {
    this.timer = null;
    const round = this.round;
    const ranking = round.ranking(this.nameOf);
    round.decided();
    await this.persistRound();
    if (!ranking.length) return;
    const msg = { t: 'winner', q: round.q, pid: ranking[0].pid, name: ranking[0].name, at: round.raws[ranking[0].pid], ranking, all: ranking };
    this.lastWinner = msg;                // 進行役が不在でも、戻ってきたときに伝えられるよう覚えておく
    this.toHost(msg);
    this.toPlayers(msg);
  }

  /* ============================ WebSocket のメッセージ ============================ */
  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string') return;                                  // 文字列（JSON）以外は受け付けない
    const att0 = this.roleOf(ws), isHost = att0.role === 'host';
    const bank = !isHost && raw.startsWith('{"t":"bank"');            // 問題集だけは、参加者でも大きく送れる
    if (raw.length > (isHost ? MAX_MSG_HOST : bank ? MAX_MSG_BANK : MAX_MSG_PLAYER)) { try { ws.close(1009, 'message too big'); } catch { /* noop */ } return; }
    if (!this.allowMessage(ws, isHost)) return;
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
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
    if (this.slot && this.slot !== id) return fail(ws, '部屋番号が接続先と違います');
    if (!(Number.isInteger(+m.id) && +m.id >= 1 && +m.id <= SLOTS) || m.id === null || m.id === '') return fail(ws, '部屋番号が不正です');
    // host:false … 進行役を決めずに部屋だけ作る（作った人は参加者として入り、あとで誰かが進行役になる）
    const withHost = m.host !== false;
    // 1つの接続元が、部屋をたくさん占領したり、作り続けたりしないように
    if (!(await lobbyStub(this.env).reserve(this.tagOf(ws), id))) return fail(ws, '部屋を作りすぎです。しばらくしてから、もう一度お試しください', 'limit');
    if (this.R) return fail(ws, 'その部屋はすでに使われています', 'taken');         // 待っている間に、ほかの人が作った
    this.R = { id, name: clean(m.name, 30) || `部屋${id}`, password: cleanPw(m.password), hostKey: withHost ? rnd(20) : null, players: {}, hostGone: null };
    await this.save();
    if (withHost) ws.serializeAttachment({ role: 'host' });
    send(ws, { t: 'created', room: id, name: this.R.name, ...(withHost ? { hostKey: this.R.hostKey } : {}) });
    this.syncLobby();
  }

  onChat(ws, m) {
    const text = clean(m.text, 200);
    if (!this.R || !text) return;
    const att = this.roleOf(ws);
    if (att.role === 'host') return this.allowChat('host') ? this.say({ name: '進行役', text, host: true }) : undefined;
    if (att.role !== 'player' || !this.player(att.pid)) return;
    if (!this.allowChat(att.pid)) return;                                   // 連投は捨てる
    const name = this.player(att.pid).name;
    if (m.answer) {                                         // チャット回答: 問題番号を付けて全員に配る
      const q = this.round.q;
      this.say({ name, text, pid: att.pid, answer: true, q });
      send(ws, { t: 'answer_ack', q, text });
      return;
    }
    this.say({ name, text, pid: att.pid });
  }

  async onHostResume(ws, m) {
    const lockKey = 'h' + (this.tagOf(ws) || '-');
    if (this.fails.locked(lockKey)) return fail(ws, '失敗が続いたため、しばらくお待ちください', 'locked');
    if (!this.R || !safeEq(this.R.hostKey, m.hostKey)) { this.fails.fail(lockKey); return fail(ws, '部屋が見つかりません', 'gone'); }
    this.fails.ok(lockKey);
    // 別の画面が進行役だったら、そちらに知らせて引き継ぐ
    for (const s of this.socks()) {
      if (s !== ws && this.roleOf(s).role === 'host') { send(s, { t: 'replaced' }); try { s.close(1000, 'replaced'); } catch { /* noop */ } }
    }
    this.R.hostGone = null;
    await this.save();
    await this.ctx.storage.deleteAlarm();
    ws.serializeAttachment({ role: 'host' });
    send(ws, { t: 'created', room: this.R.id, name: this.R.name, password: this.R.password, hostKey: this.R.hostKey, battle: this.battle });
    this.lobby();
    // 受付が終わっていて、勝者がまだ回答者に選ばれていないなら、戻った進行役にもう一度伝える
    if (this.lastWinner && this.lastWinner.q === this.round.q && !this.round.open) send(ws, this.lastWinner);
  }

  async onJoin(ws, m) {
    if (!this.R) return fail(ws, 'その部屋は存在しません', 'gone');
    const tag = this.tagOf(ws);
    const lockKey = 'p' + (tag || '-');
    let p = this.player(m.pid);
    // 参加者IDを失って戻ってきた人（別の端末・保存領域の消去）は、同じ名前で接続が切れたままの人を引き継ぐ
    if (!p && m.name) {
      const name = clean(m.name, 12);
      const same = Object.values(this.R.players).filter(x => x.name === name && !this.isOnline(x.pid));
      if (same.length === 1 && (!this.R.password || safeEq(this.R.password, cleanPw(m.password)))) p = same[0];
    }
    if (!p && this.R.password) {
      if (this.fails.locked(lockKey)) return fail(ws, 'パスワードの失敗が続いたため、しばらくお待ちください', 'locked');
      if (!safeEq(this.R.password, cleanPw(m.password))) { this.fails.fail(lockKey); return fail(ws, 'パスワードが違います', 'pw'); }
      this.fails.ok(lockKey);
    }
    if (p && typeof m.title === 'string') p.title = cleanTitle(m.title);
    let isNew = false;
    if (!p) {
      const all = Object.values(this.R.players);
      if (all.length >= MAX_PLAYERS) return fail(ws, 'この部屋は満員です', 'full');
      if (tag && all.filter(x => x.ip === tag).length >= MAX_PLAYERS_PER_IP) return fail(ws, 'この接続元からは、これ以上入室できません', 'full');
      isNew = true;
      const pid = rnd(8);
      p = { pid, name: clean(m.name, 12) || '名無し', flavor: clean(m.flavor, 20), title: cleanTitle(m.title), job: 'warrior', team: 'p', ...(tag ? { ip: tag } : {}) };
      this.R.players[pid] = p;
      await this.save();
    }
    ws.serializeAttachment({ role: 'player', pid: p.pid });
    if (!this.R.hostKey && this.R.hostGone) { this.R.hostGone = null; await this.save(); await this.ctx.storage.deleteAlarm(); }
    send(ws, { t: 'joined', pid: p.pid, room: this.R.id, roomName: this.R.name, name: p.name, flavor: p.flavor, job: p.job, team: p.team, delay: p.delay || 0 });
    for (const e of this.chat) send(ws, e);
    if (this.state) send(ws, { t: 'state', state: this.state });
    // 受付中に入り直した人にも、いまの受付を知らせる（押せないまま次の問題まで待たされないように）
    if ((this.round.open || this.round.backup) && p.pid in this.round.eligible) {
      send(ws, { t: 'open', q: this.round.q, chain: this.round.chain, eligible: Object.keys(this.round.eligible) });
      if (p.pid in this.round.buzzes) send(ws, { t: 'ack' });
    }
    if (this.lastWinner && this.lastWinner.q === this.round.q && !this.round.open) send(ws, this.lastWinner);
    if (isNew) this.say({ sys: true, text: `${p.name} が入室しました。` });
    this.lobby();
  }

  /* ---- 進行役のメッセージ ---- */
  async onHostMessage(m) {
    switch (m.t) {
      case 'state': {
        if (!m.state || typeof m.state !== 'object') return;
        const first = !this.state;
        this.state = m.state;
        this.ctx.waitUntil(this.ctx.storage.put('state', m.state));
        this.toPlayers({ t: 'state', state: m.state });
        if (first) this.syncLobby();                   // 一覧の「バトル中」表示を更新
        return;
      }
      case 'save': {                                    // バトルの全状態を預かる（進行役が替わったとき、新しい進行役に渡す）
        const G = m.G;
        if (!G || typeof G !== 'object' || !Array.isArray(G.units) || JSON.stringify(G).length > BATTLE_MAX_CHARS) return;
        this.battle = G;
        this.ctx.waitUntil(this.ctx.storage.put('battle', G));
        return;
      }
      case 'open':                                      // 次の問題の早押し受付を始める
        clearTimeout(this.timer);
        if (!Number.isFinite(+m.q)) return;
        this.round = BuzzRound.start(+m.q, this.withPersonalDelays(m.eligible), !!m.chain);
        await this.persistRound();
        this.toPlayers({ t: 'open', q: this.round.q, chain: this.round.chain, eligible: Object.keys(this.round.eligible) });
        return;
      case 'cpu_buzz': {                                // CPU（魔王など）が押した。参加者と同じ順位表に入れて、いちばん早い者が勝つ
        const cid = (typeof m.id === 'string' || typeof m.id === 'number') ? String(m.id).replace(/[^\w-]/g, '').slice(0, 16) : '';
        const pid = cid ? 'cpu:' + cid : '';
        if (!pid || !(this.round.open || this.round.backup)) return;
        if (!Object.hasOwn(this.round.eligible, pid)) {
          if (Object.keys(this.round.eligible).filter(k => k.startsWith('cpu:')).length >= 16) return;      // CPUの数に上限
          this.round.eligible[pid] = 0;
        }
        this.cpuNames[pid] = clean(m.name, 12) || 'CPU';
        if (!this.round.record(pid, m.ts, Date.now())) return;
        if (this.round.open) this.scheduleResolve();
        else {
          const all = this.round.ranking(this.nameOf);
          const msg = { t: 'ranking', q: this.round.q, all };
          this.toHost(msg); this.toPlayers(msg);
        }
        return;
      }
      case 'add_eligible': {                            // 途中参戦した人を、いまの受付に加える（ほかの人の受付は変えない）
        const pid = m.pid;
        if (!this.player(pid) || !(this.round.open || this.round.backup) || Object.hasOwn(this.round.eligible, pid)) return;
        this.round.eligible[pid] = Math.max(0, Math.min(2000, +m.delay || 0)) + (this.player(pid).delay || 0);
        await this.persistRound();
        for (const s of this.playerWs(pid)) send(s, { t: 'open', q: this.round.q, chain: this.round.chain, eligible: Object.keys(this.round.eligible) });
        return;
      }
      case 'next': {                                    // 連チャン: 誤答のあと、次の順位の人に回答権を移す
        const list = this.round.ranking(this.nameOf, Array.isArray(m.exclude) ? m.exclude.filter(x => typeof x === 'string').slice(0, 100) : []);
        if (!list.length) return this.toHost({ t: 'nobody', q: this.round.q });
        const msg = { t: 'winner', q: this.round.q, pid: list[0].pid, name: list[0].name, at: this.round.raws[list[0].pid], ranking: list, all: this.round.ranking(this.nameOf) };
        this.lastWinner = msg;
        this.toHost(msg); this.toPlayers(msg);
        return;
      }
      case 'lock':
        clearTimeout(this.timer);
        this.round.close();
        await this.persistRound();
        this.toPlayers({ t: 'locked' });
        return;
      case 'kick': {
        const p = this.player(m.pid);
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
        if (typeof to !== 'string') return;
        for (const s of this.playerWs(to)) send(s, { t: 'ask', qid, title, sub, options });
        return;
      }
      case 'priv': {                                      // 本人だけに見せる情報（持ち物など）。その人の端末にだけ送る
        if (!Array.isArray(m.items) || typeof m.to !== 'string') return;
        const clean = a => a.filter(x => typeof x === 'string').slice(0, 40);
        const allies = {};                                    // 仲間の持ち物 { ユニットid: [アイテム] }
        if (m.allies && typeof m.allies === 'object') for (const [k, v] of Object.entries(m.allies).slice(0, 40)) if (Array.isArray(v)) allies[k] = clean(v);
        for (const s of this.playerWs(m.to)) send(s, { t: 'priv', items: clean(m.items), allies });
        return;
      }
      case 'ask_close': this.toPlayers({ t: 'ask_close', qid: m.qid }); return;
      case 'set_delay': return this.setDelay(m.pid, m.delay);
      case 'set_profile': return this.setProfile(m);
      case 'set_foes': return this.setFoes(m.foes);
      case 'set_level': return this.setLevel(m.level);
      case 'transfer': return this.transferHost(m.pid, m.name);
      case 'release': return this.releaseHost(m.name);
      case 'close': return this.closeRoom('進行役が部屋を閉じました');
      case 'endgame':
        this.state = null; this.battle = null; this.round = new BuzzRound();
        await Promise.all([this.ctx.storage.delete('state'), this.ctx.storage.delete('battle')]);
        this.toPlayers({ t: 'ended' });
        this.syncLobby();
    }
  }

  /* ---- 参加者のメッセージ ---- */
  async onPlayerMessage(ws, pid, m) {
    const p = this.player(pid);
    if (!p) return;
    switch (m.t) {
      case 'rtt': {
        const v = clampRtt(m.rtt), old = this.rtts.get(pid);
        this.rtts.set(pid, v);
        if (old == null || Math.abs(old - v) > 8) this.lobby();   // 進行役の遅延表示を更新
        return;
      }
      case 'bank': {                                    // 参加者が、問題集（JSON）を進行役へ送る。進行役の端末が検査して取り込む
        const now = Date.now();
        if (typeof m.json !== 'string' || m.json.length > MAX_MSG_BANK - 200 || !this.hostWs()) return;
        if (now - (this.bankAt.get(pid) ?? 0) < BANK_INTERVAL_MS) return;
        this.bankAt.set(pid, now);
        this.toHost({ t: 'bank', from: clean(p.name, 12), json: m.json });
        return;
      }
      case 'profile':
        if (clean(m.name, 12)) p.name = clean(m.name, 12);
        if (typeof m.flavor === 'string') p.flavor = clean(m.flavor, 20);
        if (typeof m.title === 'string') p.title = cleanTitle(m.title);
        if (okJob(m.job)) p.job = m.job;
        if (m.team === 'p' || m.team === 'e' || m.team === 'c') p.team = m.team;
        if (m.delay != null) p.delay = this.cleanDelay(m.delay);
        await this.save();
        return this.lobby();
      case 'leave':
        this.say({ sys: true, text: `${p.name} が退室しました。` });
        delete this.R.players[pid];
        await this.save();
        ws.serializeAttachment({});
        return this.lobby(ws);
      case 'settings': if (!this.R.hostKey) return this.updateSettings(m); return;   // 進行役がいない間は誰でも変えられる
      // 戦う相手・難易度・魔王の選択は、進行役だけが決める（進行役がいない間だけ、参加者も変えられる）
      case 'set_boss': if (!this.R.hostKey) return this.setBoss(m.boss); return;
      case 'set_foes': if (!this.R.hostKey) return this.setFoes(m.foes); return;
      case 'set_level': if (!this.R.hostKey) return this.setLevel(m.level); return;
      case 'answer': if (Number.isInteger(m.qid) && Number.isInteger(m.i) && m.i >= 0 && m.i < 200) this.toHost({ t: 'answer', pid, qid: m.qid, i: m.i }); return;
      case 'claim_host': return this.claimHost(ws, pid);
      case 'buzz':
        if (!this.round.canBuzz(pid)) return;
        if (m.rtt > 0) this.rtts.set(pid, clampRtt(m.rtt));
        this.round.record(pid, m.ts, Date.now());
        send(ws, { t: 'ack' });
        if (this.round.open) this.scheduleResolve();
        else {                                            // 勝者が決まったあとの押下（連チャンの2着以降）は記録して、順位を全員に知らせる
          const all = this.round.ranking(this.nameOf);
          const msg = { t: 'ranking', q: this.round.q, all };
          this.toHost(msg); this.toPlayers(msg);
        }
    }
  }

  /** 部屋名・パスワードの変更（入室済みの人には影響しない） */
  /** 進行役が、参加者の職業・チーム・名前を変える。本人の画面にもすぐ反映する */
  async setProfile(m) {
    const p = this.player(m.pid);
    if (!p) return;
    const out = {};
    if (okJob(m.job)) { p.job = m.job; out.job = p.job; }
    if (m.team === 'p' || m.team === 'e' || m.team === 'c') { p.team = m.team; out.team = p.team; }
    if (clean(m.name, 12)) { p.name = clean(m.name, 12); out.name = p.name; }
    if (!Object.keys(out).length) return;
    await this.save();
    for (const s of this.playerWs(p.pid)) send(s, { t: 'profile_set', ...out });
    this.lobby();
  }
  /** 個人のディレイ（ms）を安全な値にする */
  cleanDelay(v) { const n = Math.round(+v); return Number.isFinite(n) ? Math.max(0, Math.min(PERSONAL_DELAY_MAX, n)) : 0; }
  /** 進行役が決めた「押せる人とディレイ」に、各自のディレイ設定を足す */
  withPersonalDelays(eligible) {
    const out = {};
    for (const [pid, d] of Object.entries(eligible && typeof eligible === 'object' ? eligible : {})) if (this.player(pid)) out[pid] = (+d || 0) + (this.player(pid).delay || 0);
    return out;
  }
  /** 進行役が、参加者のディレイを決める */
  async setDelay(pid, delay) {
    const p = this.player(pid);
    if (!p) return;
    p.delay = this.cleanDelay(delay);
    await this.save();
    this.lobby();
  }
  /** 戦う相手（魔王 'boss1'〜'boss6' と職業のキー。最大12体）。進行役も参加者も変えられる */
  async setFoes(list) {
    if (!Array.isArray(list)) return;
    const ok = list.filter(f => okJob(f)).slice(0, 12);
    if (JSON.stringify(ok) === JSON.stringify(this.R.foes ?? ['boss1'])) return;
    this.R.foes = ok;
    await this.save();
    this.lobby();
  }
  async setLevel(v) {
    if (!['weak', 'normal', 'strong', 'extreme'].includes(v) || v === (this.R.level ?? 'normal')) return;
    this.R.level = v;
    await this.save();
    this.lobby();
  }
  /** 戦う魔王の選択（進行役も参加者も変えられる。最後に選んだものが有効） */
  async setBoss(v) {
    const b = Math.trunc(+v);
    if (!(b >= 1 && b <= BOSS_COUNT) || b === this.R.boss) return;
    this.R.boss = b;
    await this.save();
    this.lobby();
  }
  async updateSettings(m) {
    if (m.boss != null) await this.setBoss(m.boss);
    const room = typeof m.name === 'string' || typeof m.password === 'string';     // 魔王の選択だけのときは、部屋設定の通知を出さない
    if (clean(m.name, 30)) this.R.name = clean(m.name, 30);
    if (typeof m.password === 'string') this.R.password = cleanPw(m.password);
    await this.save();
    if (room) this.toHost({ t: 'settings', name: this.R.name, password: this.R.password });
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
    if (this.R.hostKey) {
      // 進行役が落ちたままなら、少し待ってから参加者が引き継げる（元の進行役の鍵は無効になる）
      if (this.hostWs()) return fail(ws, 'すでに進行役がいます', 'claim');
      const gone = this.R.hostGone ? Date.now() - this.R.hostGone : Infinity;
      if (gone < HOST_TAKEOVER_MS) return fail(ws, `進行役が戻るかもしれません。あと${Math.ceil((HOST_TAKEOVER_MS - gone) / 1000)}秒ほど待ってください`, 'claim');
      this.dropPendingAsks();
    }
    await this.grantHost(pid);
    this.lobby();
  }
  /** いまの進行役が、参加者の1人に進行役を譲る */
  /** 進行役をおりた接続を、そのまま参加者にする（部屋から出入りさせない）。新しい参加者の pid を返す */
  async demote(ws, name) {
    const pid = rnd(8);
    this.R.players[pid] = { pid, name: clean(name, 12) || '進行役', flavor: '', job: 'warrior', team: 'p', delay: 0 };
    await this.save();
    send(ws, { t: 'demoted', pid, name: this.R.players[pid].name });
    ws.serializeAttachment({ role: 'player', pid });
  }
  async transferHost(pid, name) {
    if (!this.player(pid) || !this.isOnline(pid)) return this.toHost({ t: 'notice', msg: 'その人はオンラインではありません' });
    const old = this.hostWs();
    await this.grantHost(pid);
    this.dropPendingAsks();
    if (old) await this.demote(old, name);
    this.lobby();
  }
  /** 進行役をやめる。部屋は残り、誰かがあとから進行役になれる */
  async releaseHost(name) {
    const old = this.hostWs();
    this.R.hostKey = null; this.R.hostGone = null;
    await this.save();
    await this.ctx.storage.deleteAlarm();
    this.dropPendingAsks();
    if (old) await this.demote(old, name);
    this.lobby();
  }
  /** 進行役が替わっても、バトルは続けられる（新しい進行役が、預かっている全状態を受け取る）。途中だった選択ダイアログだけは閉じる */
  dropPendingAsks() {
    clearTimeout(this.timer);
    this.toPlayers({ t: 'ask_close', all: true });
  }

  /* ============================ 切断・タイマー ============================ */
  async webSocketClose(ws) {
    if (!this.R) return;
    const att = this.roleOf(ws);
    if (att.role === 'host' && !this.hostWs(ws)) {
      this.R.hostGone = Date.now();
      await this.save();
      await this.ctx.storage.setAlarm(Date.now() + HOST_GRACE_MS);
      this.lobby(ws);                                  // 参加者に「進行役が不在」と知らせる
    } else if (att.role === 'player') {
      if (this.player(att.pid)) this.player(att.pid).lastSeen = Date.now();      // いつ切れたか（長いと名簿から外す）
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
