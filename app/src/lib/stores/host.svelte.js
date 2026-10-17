// 進行役の状態: 部屋の接続・名簿・バトル（engine）・早押しの受付と配信
import { createBattle, CANCEL, SELECTABLE, recommendedHpScale } from '../engine.js';
import { Conn } from '../net.js';
import { ask, toast, confirmAsk } from './ui.svelte.js';
import { sfx } from './sound.svelte.js';
import { store, session, KEY } from '../storage.js';
import { syncRoster, startBlock } from '../roster.js';
import { publicState, eligibleDelays } from '../publish.js';
import { rankTags } from '../ranks.js';
import { QuizStore } from './quiz.svelte.js';

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
  items = $state(1);                 // 開始時に1人へ配るアイテムの数（0でなし）
  level = $state('normal');          // 難易度: weak / normal / strong
  buzzRule = $state('next');         // next=誤答したら次の問題 / retry=誤答した人を除いて同じ問題を再受付 / chain=誤答したら次の順位の人へ回答権が移る（連チャン）
  chat = $state([]);                 // チャット（参加者のチャット回答を含む）
  editing = $state(null);            // 調整中のユニットid
  G = $state(null);                  // バトルの状態（engine から届く写し）
  busy = $state(false);
  canUndo = $state(false);
  canRedo = $state(false);
  rank = $state('');
  ranks = $state({});                // この問題の早押しの順位 pid → 表示用のタグ
  rtt = $state(null);
  saved = $state(null);              // 途中のバトル（再開できる）
  quiz = new QuizStore();            // 問題集と問読みの進み具合
  #openedFor = null;                 // 早押しを受け付け済みの問題番号
  #lobbyInit = false;

  constructor(id) {
    this.id = id;
    this.quiz.onCpu = p => this.#cpuBuzz(p);
    this.battle = createBattle({
      ask: (title, options, o) => this.#ask(title, options, o), toast,
      pause: ms => new Promise(r => setTimeout(r, ms)),
      changed: snap => { this.G = snap; this.busy = this.battle.busy; this.canUndo = this.battle.canUndo; this.canRedo = this.battle.canRedo; this.#publish(); queueMicrotask(() => this.#joinLate()); },
      persist: G => { store.set(KEY.save(id), JSON.stringify(G)); this.#saveToServer(G); },
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
  destroy() { this.conn?.close(); this.quiz.dispose(); this.#cancelCpuTimers(); }
  /** 別の画面に奪われた進行役を、この画面で引き継ぐ */
  takeOver() { this.status = 'connecting'; this.conn.connect(); }

  #onMessage(m) {
    switch (m.t) {
      case 'created':
        this.status = 'ready'; this.roomName = m.name; this.password = m.password ?? ''; this.#openedFor = null;
        // 進行役が替わったとき（別の人が引き継いだ・譲られた・画面を開き直した）は、サーバーが預かっているバトルの続きから進める
        if (m.battle && !m.battle.over && !this.battle.G) { this.saved = null; this.battle.load(m.battle); toast('バトルを引き継ぎました。続きから進めます', 3500); }
        else if (this.G) this.#publish();
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
    if (!G || G.over || this.battle.busy || !this.#lobbyInit) return;      // 参加者の一覧が届く前は、退室したかどうかを判断できない
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
    this.quiz.freezeAt(m.at, this.conn?.offset);              // 押された位置で問読みを止める
    const cpu = typeof m.pid === 'string' && m.pid.startsWith('cpu:') ? this.#cpuPending.get(m.pid) : null;
    this.#cpuPending.clear(); this.#cancelCpuTimers();
    if (cpu) { this.#cpuResolve(cpu); return; }              // CPUが最初に押していた
    const G = this.battle.G;
    if (G && !this.battle.busy && !G.over && G.sel == null && G.pids?.[m.pid] != null) this.battle.select(G.pids[m.pid]);
  }

  /* ---------- 問読み・CPUの早押し ---------- */
  /** バトルの問題番号に合わせて、問題集の出題とCPUの押し方を更新する */
  syncQuiz() {
    const G = this.battle.G;
    if (!G || !this.quiz.has) return;
    const cpus = G.cpu && G.cfg?.cpuAuto ? G.units.filter(u => (u.isBoss || u.cpu) && !u.human && u.alive && !u.restNow).map(u => ({ id: u.id, name: u.name })) : [];
    this.quiz.sync(G.q, cpus, this.level);
  }
  #cpuPending = new Map();           // サーバーに押下を送ったCPU { 'cpu:ID' → { id, name, ok, answer, question } }（勝者が決まるまで）
  /**
   * 問読みが、CPUの押す位置に達した。CPUも参加者と同じように、サーバーに押下を送り、いちばん早い者が回答権を取る
   * （遅れて届く参加者の押下も、押した時刻で比べられる）。問読みは、押された時点で止める
   */
  #cpuTimers = new Set();            // CPUが「わかった」あと、実際に押すまでの反応の遅れ（人間らしい間）
  #cancelCpuTimers() { for (const t of this.#cpuTimers) clearTimeout(t); this.#cpuTimers.clear(); }
  #cpuBuzz(p) {
    const G = this.battle.G;
    if (!G || G.over || G.sel != null || this.battle.busy) return;
    const q0 = G.q;
    const timer = setTimeout(() => {
      this.#cpuTimers.delete(timer);
      const g = this.battle.G;
      if (!g || g.over || g.q !== q0 || g.sel != null || this.battle.busy || this.quiz.frozen != null) return;     // 反応している間に、人間が押していた
      const pid = 'cpu:' + p.id;
      this.#cpuPending.set(pid, p);
      this.quiz.pause();
      if (!this.conn?.send({ t: 'cpu_buzz', id: p.id, name: p.name, ts: this.conn.stamp(performance.now()) })) {
        this.#cpuPending.delete(pid);       // 通信できないときは、すぐにCPUの回答にする
        this.#cpuResolve(p);
      }
    }, Math.max(0, Math.min(1500, p.react ?? 0)));
    this.#cpuTimers.add(timer);
  }
  /** CPUが回答権を取った。正解なら問題が終わり、誤答ならCPUが罰を受けて、参加者がもう一度早押しする */
  async #cpuResolve(p) {
    toast(p.ok ? `🤖 ${p.name} が先に押して正解（${p.answer}）` : `🤖 ${p.name} が先に押して誤答${p.answer ? `（${p.answer}）` : ''}`, 3500);
    const done = await this.battle.cpuBuzz(p.id, p.ok, p.answer ?? '');
    if (done) this.quiz.noteResult(p.id, p.ok);
    if (done && !p.ok) this.reopen();
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
  /** 接続が切れている参加者を、まとめて名簿から外す */
  removeOffline() {
    for (const p of [...this.roster]) if (p.pid && !p.online) this.remove(p);
  }
  /** 全員の職業をランダムに決める（進行役が決めた扱いになり、参加者の選び直しで上書きされない） */
  randomizeJobs() {
    for (const p of this.roster) { p.job = SELECTABLE[Math.floor(Math.random() * SELECTABLE.length)]; p.touchedJob = true; this.pushProfile(p, { job: p.job }); }
  }
  /** 進行役が名簿で変えた職業・チーム・名前を、サーバー経由で本人の画面にも反映する（本人が入室中のときだけ） */
  pushProfile(p, patch) { if (p.pid) this.conn?.send({ t: 'set_profile', pid: p.pid, ...patch }); }
  remove(p) {
    if (p.pid) this.conn.send({ t: 'kick', pid: p.pid });
    this.roster = this.roster.filter(x => x !== p);
  }

  /* ---------- バトル ---------- */
  start() {
    if (this.startBlock) { toast(this.startBlock); return; }
    this.battle.start({
      players: this.playersNamed.map(p => ({ name: p.name, job: p.job, team: p.team, pid: p.pid })),
      mode: this.mode, foes: this.mode === 'cpu' ? [...this.foes] : [], boss: this.boss, hpScale: recommendedHpScale(this.mode, this.playersNamed.length, this.mode === 'cpu' ? this.foes : []), bossPenalty: false, cpuAuto: true, level: this.level, items: this.items,
    });
    this.saved = null; this.rank = ''; this.#openedFor = null; this.chat = [];
    setTimeout(() => this.battle.intro(), 700);        // 魔王の登場の演出（画面が出そろってから）
  }
  resume() { if (this.saved) { this.battle.load(this.saved); this.saved = null; this.#openedFor = null; } }
  discardSaved() { this.saved = null; store.remove(KEY.save(this.id)); }
  quit() {
    this.battle.reset(); this.#openedFor = null; this.rank = '';
    store.remove(KEY.save(this.id));
    this.conn.send({ t: 'endgame' });
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
  redo() { return this.battle.redo(); }
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

  /* ---------- バトルの全状態をサーバーに預ける（進行役が替わっても続けられるように） ---------- */
  #saveToServer(G) {
    if (!this.conn) return;
    this.conn.send({ t: 'save', G: { ...G, log: G.log.slice(0, 40) } });       // ログは直近だけで十分（サイズを抑える）
  }

  /* ---------- 参加者への配信 ---------- */
  /** バトルの状態を配り、回答者が決まっていなければ次の早押しの受付を始める */
  #publish(force = false) {
    const G = this.battle.G;
    if (!G || !this.conn) return;
    this.syncQuiz();
    this.conn.send({ t: 'state', state: publicState(G) });
    for (const [pid, uid] of Object.entries(G.pids)) {          // 持ち物は、本人と、同じ陣営の仲間にだけ教える（相手には個数だけ）
      const u = G.units.find(x => x.id === uid);
      if (!u?.items) continue;
      const allies = {};
      for (const x of G.units) if (x.id !== u.id && x.side === u.side && x.items?.length) allies[x.id] = x.items;
      this.conn.send({ t: 'priv', to: pid, items: u.items, allies });
    }
    if (G.sel == null && !G.over && (force || this.#openedFor !== G.q)) {
      this.#openedFor = G.q;
      this.#cpuPending.clear(); this.#cancelCpuTimers();
      this.ranks = {};
      this.conn.send({ t: 'open', q: G.q, chain: this.buzzRule === 'chain', eligible: eligibleDelays(G) });
    }
  }
}
