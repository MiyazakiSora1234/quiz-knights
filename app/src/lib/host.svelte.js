// 進行役の状態: 部屋の接続・名簿・バトル（engine）・早押しの受付と配信
import { createBattle, CANCEL, SELECTABLE } from './engine.js';
import { Conn } from './net.js';
import { ask, toast, confirmAsk } from './ui.svelte.js';
import { sfx } from './sound.svelte.js';
import { store, session, KEY } from './storage.js';
import { syncRoster, startBlock } from './roster.js';
import { publicState, eligibleDelays } from './publish.js';
import { rankTags } from './ranks.js';

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
  mode = $state('cpu');              // cpu=CPU戦（魔王・CPUの職業を好きに並べる） / pvp=ユーザー対戦
  foes = $state(['boss1']);          // CPU戦の相手: 'boss1'〜'boss6'（魔王）と職業のキー
  boss = $state(1);
  level = $state('normal');          // 難易度: weak / normal / strong
  buzzRule = $state('next');         // next=誤答したら次の問題 / retry=誤答した人を除いて同じ問題を再受付 / chain=誤答したら次の順位の人へ回答権が移る（連チャン）
  chat = $state([]);                 // チャット（参加者のチャット回答を含む）
  editing = $state(null);            // 調整中のユニットid
  G = $state(null);                  // バトルの状態（engine から届く写し）
  busy = $state(false);
  canUndo = $state(false);
  rank = $state('');
  ranks = $state({});                // この問題の早押しの順位 pid → 表示用のタグ                 // 直近の早押しの順位
  rtt = $state(null);
  saved = $state(null);              // 途中のバトル（再開できる）
  #openedFor = null;                 // 早押しを受け付け済みの問題番号
  #lobbyInit = false;

  constructor(id) {
    this.id = id;
    this.battle = createBattle({
      ask: (title, options, o) => this.#ask(title, options, o), toast,
      pause: ms => new Promise(r => setTimeout(r, ms)),
      changed: snap => { this.G = snap; this.busy = this.battle.busy; this.canUndo = this.battle.canUndo; this.#publish(); queueMicrotask(() => this.#joinLate()); },
      persist: G => store.set(KEY.save(id), JSON.stringify(G)),
    });
    try { this.saved = JSON.parse(store.get(KEY.save(id))); } catch { this.saved = null; }
    if (this.saved?.over) this.saved = null;
  }

  /* ---------- 画面が使う導出値 ---------- */
  /** バトルに参加する人: 名前があり、いまオンラインの人（切断中の人は、戻ってきたら途中参戦する） */
  get playersNamed() { return this.roster.filter(p => p.name.trim() && p.online); }
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
        // 部屋からは出ず、そのまま参加者になる（参加者の画面では同じ pid で自動的に入り直す）
        store.remove(KEY.hostKey(this.id)); store.remove(KEY.save(this.id)); this.conn.close();
        if (m.pid) { session.set(KEY.pid(this.id), m.pid); store.set(KEY.name, m.name); }
        toast('進行役をおりました。参加者になります'); setTimeout(() => { location.href = `/play?id=${this.id}`; }, 600);
        return;
      case 'answer': return this.#onAnswer(m);
      case 'chat': this.chat = [...this.chat, m].slice(-200); if (m.answer) sfx.open(); return;
      case 'settings': this.roomName = m.name; this.password = m.password; toast('部屋の設定を変更しました'); return;
      case 'notice': toast(m.msg, 3000); return;
      case 'replaced':
        this.status = 'replaced'; this.conn.close();
        return;
      case 'lobby': this.#applyShared(m); return this.#onLobby(m.players);
      case 'winner': return this.#onWinner(m);
      case 'nobody': return this.#chainExhausted();
      case 'ranking': this.ranks = rankTags(m.all); return;
    }
  }
  /** サーバーにある共有の設定（戦う相手・難易度）を、この画面に反映する */
  #applyShared(m) {
    if (Array.isArray(m.foes) && JSON.stringify(m.foes) !== JSON.stringify(this.foes)) this.foes = [...m.foes];
    if (m.level && m.level !== this.level) this.level = m.level;
  }
  #onLobby(players) {
    if (this.#lobbyInit) this.#announceChanges(players);
    this.#lobbyInit = true;
    this.lobby = players;
    syncRoster(this.roster, players, nextKey);
    this.#fallbackIfOffline(players);
    this.#joinLate();
  }
  /** バトル中に入室した人を、途中参戦としてバトルに加える */
  #joinLate() {
    const G = this.battle.G;
    if (!G || G.over || this.battle.busy) return;
    // 退室した人（一覧から消えた人）は戦闘から外す。接続が切れただけの人は残す（戻ってこられる）
    let removed = false;
    for (const pid of Object.keys(G.pids)) {
      if (!this.lobby.some(l => l.pid === pid) && this.battle.leave(pid)) removed = true;
    }
    if (removed && this.battle.G.sel == null && !this.battle.G.over) this.reopen();
    const added = [];
    for (const r of this.roster) {
      if (r.pid && r.online && G.pids[r.pid] == null && this.battle.join({ name: r.name, job: r.job, team: r.team, pid: r.pid })) added.push(r.pid);
    }
    // 途中参戦した人だけを今の受付に加える（ほかの人の受付はそのまま。押した記録も消えない）
    if (added.length && this.battle.G.sel == null) {
      const el = eligibleDelays(this.battle.G);
      for (const pid of added) if (pid in el) this.conn.send({ t: 'add_eligible', pid, delay: el[pid] });
    }
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
    this.ranks = rankTags(m.all ?? m.ranking);
    this.rank = m.ranking.map((x, i) => `${i + 1}. ${x.name}${i ? ` (+${Math.round(x.ms)}ms)` : ''}`).join('　');
    const G = this.battle.G;
    if (G && !this.battle.busy && !G.over && G.sel == null && G.pids?.[m.pid] != null) this.battle.select(G.pids[m.pid]);
  }

  /* ---------- 選択ダイアログ（回答者の端末へ送る） ---------- */
  #qid = 0;
  #remote = null;     // 回答者の端末に出している選択 { qid, pid, title, options, o, resolve, reject }
  waiting = $state(null);   // 回答者の選択待ち { name }
  /** o.actor のユニットを操作している人がオンラインなら、その人の端末にだけ選択を出し、進行役の画面には出さない。
   *  選択中にその人が切断したら、進行役の画面に出し直す。魔王・CPU・オフラインの人は進行役が選ぶ。 */
  #ask(title, options, o = {}) {
    const G = this.battle.G;
    const unit = o.actor != null && G ? G.units.find(u => u.id === o.actor) : null;
    const pid = unit && Object.keys(G.pids).find(p => G.pids[p] === unit.id);
    const online = !!pid && this.lobby.some(l => l.pid === pid && l.online);
    if (!online) return ask(title, options, o);
    const qid = ++this.#qid;
    return new Promise((resolve, reject) => {
      const done = () => { this.#remote = null; this.waiting = null; this.conn.send({ t: 'ask_close', qid }); };
      this.#remote = { qid, pid, title, options, o, resolve: v => { done(); resolve(v); }, reject: e => { done(); reject(e); } };
      this.waiting = { name: unit.name };
      this.conn.send({ t: 'ask', to: pid, qid, title, sub: o.sub || '', options: options.map(({ label, sub, disabled, cls, unit, group, gcls, gorder }) => ({ label, sub, disabled, cls, unit, group, gcls, gorder })) });
    });
  }
  #onAnswer(m) {
    const r = this.#remote;
    if (!r || r.qid !== m.qid || r.pid !== m.pid) return;
    const o = r.options[m.i];
    if (!o || o.disabled) return;
    r.resolve(o.value);
  }
  /** 選択待ちを取り消す（この問題の処理を元に戻す） */
  abortWaiting() { this.#remote?.reject(CANCEL); }
  /** 選択中の人が切断したら、進行役の画面で代わりに選ぶ */
  #fallbackIfOffline(players) {
    const r = this.#remote;
    if (!r || players.some(p => p.pid === r.pid && p.online)) return;
    this.#remote = null; this.waiting = null; this.conn.send({ t: 'ask_close', qid: r.qid });
    toast('選択中の人の接続が切れたため、進行役の画面で選びます');
    ask(r.title, r.options, r.o).then(r.resolve, r.reject);
  }

  /* ---------- 名簿 ---------- */
  /** 全員の職業をランダムに決める（進行役が決めた扱いになり、参加者の選び直しで上書きされない） */
  randomizeJobs() {
    for (const p of this.roster) { p.job = SELECTABLE[Math.floor(Math.random() * SELECTABLE.length)]; p.touchedJob = true; }
  }
  remove(p) {
    if (p.pid) this.conn.send({ t: 'kick', pid: p.pid });
    this.roster = this.roster.filter(x => x !== p);
  }

  /* ---------- バトル ---------- */
  start() {
    if (this.startBlock) { toast(this.startBlock); return; }
    this.battle.start({
      players: this.playersNamed.map(p => ({ name: p.name, job: p.job, team: p.team, pid: p.pid })),
      mode: this.mode, foes: this.mode === 'cpu' ? [...this.foes] : [], boss: this.boss, bossPenalty: false, cpuAuto: true, level: this.level,
    });
    this.saved = null; this.rank = ''; this.#openedFor = null; this.chat = [];
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
    return;   // 回答者は早押しで決まり、CPUは自動で動く。進行役がユニットを選んで回答者にすることはない
    if (G.sel === id) { this.battle.select(null); this.reopen(); return; }
    if (this.battle.select(id)) this.conn.send({ t: 'lock' });
  }
  deselect() { this.battle.select(null); this.reopen(); }
  correct() { return this.battle.correct(); }
  /** 誤答。retry のルールなら同じ問題を再受付し、押せる人がいなければスルーで終える */
  async wrong() {
    const retry = this.buzzRule !== 'next';
    const ok = await this.battle.wrong({ retry });
    const G = this.battle.G;
    if (ok && retry && G && !G.over && G.sel == null) {
      if (this.buzzRule === 'chain') this.#chainNext();
      else this.#retryOrEnd();
    }
    return ok;
  }
  /** 誤答者を除いて受付を出し直す。押せる人がいなければ問題を終える */
  async #retryOrEnd() {
    const G = this.battle.G;
    if (!Object.keys(eligibleDelays(G)).length) { toast('押せる人がいないため、この問題を終えます'); await this.battle.skip(); }
    else this.reopen();
  }
  /** 連チャン: 誤答した人を除いて、次の順位の人に回答権を移す（サーバーの順位表から選ぶ） */
  #chainNext() {
    const G = this.battle.G;
    const tried = (G.wrongOn ?? []).map(id => Object.keys(G.pids).find(p => G.pids[p] === id)).filter(Boolean);
    this.conn.send({ t: 'next', exclude: tried });
  }
  /** 順位表に次の人がいない: 誤答者を除いて、もう一度みんなで早押しする */
  #chainExhausted() {
    const G = this.battle.G;
    if (!G || G.over || G.sel != null) return;
    toast('次の順位の人がいないため、受付を出し直します');
    this.#retryOrEnd();
  }
  /** 戦闘中のユニット調整（職業・体力など） */
  editUnit(id, patch) { const ok = this.battle.edit(id, patch); if (ok) this.#openedFor = null; return ok; }
  sendChat(text) { if (text.trim()) this.conn.send({ t: 'chat', text }); }
  skip() { return this.battle.skip(); }
  undo() { return this.battle.undo(); }
  reopen() { this.#openedFor = null; this.rank = ''; this.#publish(true); }

  saveRoom(name, password) { this.conn.send({ t: 'settings', name, password }); }
  /** 参加者のディレイ（ms）を進行役が決める */
  setDelay(pid, ms) { this.conn?.send({ t: 'set_delay', pid, delay: ms }); }
  /** 戦う相手を決める（参加者も変えられるので、サーバー経由で全員に反映される） */
  setFoes(list) { this.foes = [...list]; this.conn?.send({ t: 'set_foes', foes: this.foes }); }
  setLevel(v) { this.level = v; this.conn?.send({ t: 'set_level', level: v }); }
  /** 進行役を、いま入室している参加者に譲る */
  async transfer(p) {
    if (!(await confirmAsk(`${p.name} さんに進行役を譲りますか？`, '進行中のバトルは終了し、あなたは参加者になります。', '譲る', false))) return;
    this.conn.send({ t: 'transfer', pid: p.pid, name: store.get(KEY.name) || '' });
  }
  async release() {
    if (!(await confirmAsk('進行役をやめますか？', '部屋は残り、ほかの人が進行役になれます。進行中のバトルは終了します。', 'やめる'))) return;
    this.conn.send({ t: 'release', name: store.get(KEY.name) || '' });
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
      this.ranks = {};
      this.conn.send({ t: 'open', q: G.q, chain: this.buzzRule === 'chain', eligible: eligibleDelays(G) });
    }
  }
}
