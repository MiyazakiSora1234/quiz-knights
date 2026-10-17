// 問題集と、問読みの進み具合（進行役の画面だけが持つ。問題文はサーバーにも参加者にも送らない）
import { store } from '../storage.js';
import { importText, normalizeQuestion, chunksOf, readChars, chunksAt, cpuPlan, exportBank, SAMPLE_BANK, MAX_QUESTIONS } from '../questions.js';

const KEY_BANK = 'qk_bank';
const KEY_CPU = 'qk_cpu_buzz';

export class QuizStore {
  title = $state('');
  questions = $state([]);            // 問題集
  offset = $state(0);                // 何問目の問題を出すか（バトルの第N問に足してずらす。手動で前後に動かせる）
  qno = $state(0);                   // いま読んでいるバトルの問題番号
  shown = $state(0);                 // 表示済みの塊の数
  frozen = $state(null);             // 早押しで止まった位置（塊の数）。止まっていなければ null
  plans = $state([]);                // この問題でのCPUの押し方 [{ id, name, at, ok, used }]
  cpuOn = $state(true);              // CPUも早押しする
  onCpu = null;                      // CPUが押したときの処理（持ち主が設定する）
  #times = [];                       // 各塊を表示した時刻（performance.now）

  constructor() {
    try {
      const d = JSON.parse(store.get(KEY_BANK) ?? 'null');
      if (d?.questions) { this.title = d.title ?? ''; this.questions = importText(JSON.stringify(d)).questions; }
    } catch { /* 保存が壊れていても使えるように */ }
    this.cpuOn = store.get(KEY_CPU) !== '0';
  }

  /* ---------- 導出値 ---------- */
  get has() { return this.questions.length > 0; }
  get index() {
    const n = this.questions.length;
    return n ? (((this.qno - 1 + this.offset) % n) + n) % n : -1;
  }
  get cur() { return this.questions[this.index] ?? null; }
  get chunks() { return this.cur ? chunksOf(this.cur) : []; }
  get chars() { return this.cur ? readChars(this.cur, this.shown) : 0; }
  get done() { return this.shown >= this.chunks.length; }

  /* ---------- 問題集の編集 ---------- */
  #save() { store.set(KEY_BANK, JSON.stringify({ title: this.title, questions: this.questions })); }
  /** 文字列（JSON／1行1問）から取り込む。replace=false なら末尾に足す。戻り値は検査の結果 */
  importFrom(text, replace = true) {
    const r = importText(text);
    if (!r.questions.length) return r;
    if (replace) { this.questions = r.questions; if (r.title) this.title = r.title; }
    else {
      const base = this.questions.reduce((m, q) => Math.max(m, q.no), 0);
      this.questions = [...this.questions, ...r.questions.map((q, i) => ({ ...q, no: base + i + 1 }))].slice(0, MAX_QUESTIONS);
    }
    this.#save(); this.#invalidate();
    return r;
  }
  addSample() { return this.importFrom(JSON.stringify(SAMPLE_BANK), true); }
  /** 1問を直す（検査をかけ直す）。直せないときはエラーの文を返す */
  update(i, raw) {
    const cur = this.questions[i]; if (!cur) return '問題がありません';
    const r = normalizeQuestion({ ...cur, ...raw }, cur.no);
    if (!r.q) return r.error;
    this.questions = this.questions.map((q, k) => (k === i ? r.q : q));
    this.#save(); this.#invalidate();
    return '';
  }
  remove(i) { this.questions = this.questions.filter((_, k) => k !== i).map((q, k) => ({ ...q, no: k + 1 })); this.#save(); this.#invalidate(); }
  clear() { this.questions = []; this.title = ''; this.offset = 0; this.#save(); this.#invalidate(); }
  exportJson() { return exportBank(this.title, this.questions); }
  setCpuOn(v) { this.cpuOn = !!v; store.set(KEY_CPU, v ? '1' : '0'); }

  /* ---------- 出題 ---------- */
  /** バトルの問題番号が変わったら、読み始めに戻して、CPUの押し方を決める。cpus: 押す可能性のあるCPU [{id,name}] */
  sync(qno, cpus = [], level = 'normal') {
    if (qno === this.qno && this.#planned) return;
    this.qno = qno;
    this.#reset(cpus, level);
    this.#planned = true;
  }
  #invalidate() { this.#planned = false; this.#reset(); }
  #planned = false;
  #lastCpus = [];
  #lastLevel = 'normal';
  #reset(cpus = this.#lastCpus, level = this.#lastLevel) {
    this.#lastCpus = cpus; this.#lastLevel = level;
    this.shown = 0; this.frozen = null; this.#times = [];
    this.plans = [];
    const q = this.cur;
    if (!q) return;
    const plans = [];
    for (const c of cpus) { const p = cpuPlan(q, level); if (p) plans.push({ id: c.id, name: c.name, at: p.at, ok: p.ok, used: false }); }
    this.plans = plans.sort((a, b) => a.at - b.at);
  }
  /** 出す問題を前後にずらす（読み始めに戻る） */
  jump(d) { this.offset += d; this.#invalidate(); }

  /* ---------- 問読み（手動送り） ---------- */
  /** 次の塊を表示する */
  advance() {
    if (!this.cur || this.shown >= this.chunks.length) return false;
    this.shown++; this.#times.push(performance.now());
    this.frozen = null;
    this.#checkCpu();
    return true;
  }
  /** 1つ戻す */
  back() { if (this.shown > 0) { this.shown--; this.#times.pop(); this.frozen = null; } }
  revealAll() { while (this.advance()) { /* 全部出す */ } }
  restart() { this.shown = 0; this.frozen = null; this.#times = []; this.plans = this.plans.map(p => ({ ...p, used: false })); }
  /** 誰かが押して回答権が決まった。serverAt=勝者が押した時刻（サーバー時刻）、offset=この端末とサーバーの時計のずれ */
  freezeAt(serverAt, offset) {
    if (!this.cur) return;
    let n = this.shown;
    if (typeof serverAt === 'number' && Number.isFinite(offset)) n = Math.min(this.shown, chunksAt(this.#times, serverAt - offset));
    this.frozen = n; this.shown = n; this.#times = this.#times.slice(0, n);
  }
  #checkCpu() {
    if (!this.cpuOn || this.frozen != null || !this.onCpu) return;
    const p = this.plans.find(x => !x.used && x.at <= this.chars);
    if (!p) return;
    this.plans = this.plans.map(x => (x.id === p.id ? { ...x, used: true } : x));
    this.onCpu({ id: p.id, name: p.name, ok: p.ok, answer: p.ok ? this.cur.a : null, question: this.cur });
  }
}
