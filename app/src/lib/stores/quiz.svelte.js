// 問題集と、問読みの進み具合（進行役の画面だけが持つ。問題文はサーバーにも参加者にも送らない）
// 問読みは、一定の速さ（字/秒）で1文字ずつ進む。カラオケの歌詞のように、読んだ部分の色が変わる
import { store } from '../storage.js';
import { importText, normalizeQuestion, chunksOf, cpuPlan, exportBank, SAMPLE_BANK, MAX_QUESTIONS } from '../questions.js';

const KEY_BANK = 'qk_bank';
const KEY_CPU = 'qk_cpu_buzz';
const KEY_SPEED = 'qk_read_speed';
export const SPEED_MIN = 2;
export const SPEED_MAX = 20;
export const SPEED_DEFAULT = 7;
const TICK_MS = 50;

export class QuizStore {
  title = $state('');
  questions = $state([]);            // 問題集
  offset = $state(0);                // 何問目の問題を出すか（バトルの第N問に足してずらす。手動で前後に動かせる）
  qno = $state(0);                   // いま読んでいるバトルの問題番号
  pos = $state(0);                   // 読み済みの文字数（小数。表示は切り捨て）
  speed = $state(SPEED_DEFAULT);     // 読む速さ（字/秒）
  reading = $state(false);           // 読み進めている最中
  frozen = $state(null);             // 早押しで止まった位置（文字数）。止まっていなければ null
  plans = $state([]);                // この問題でのCPUの押し方 [{ id, name, at, ok, used }]
  cpuOn = $state(true);              // CPUも早押しする
  onCpu = null;                      // CPUが押したときの処理（持ち主が設定する）
  #segs = [];                        // 読み進めた区間 { t0, p0, v, t1 }（t0〜t1 の間、p0 から速さ v で進んだ）。押した時刻から位置を求めるのに使う
  #timer = null;

  constructor() {
    try {
      const d = JSON.parse(store.get(KEY_BANK) ?? 'null');
      if (d?.questions) { this.title = d.title ?? ''; this.questions = importText(JSON.stringify(d)).questions; }
    } catch { /* 保存が壊れていても使えるように */ }
    this.cpuOn = store.get(KEY_CPU) !== '0';
    const v = Number(store.get(KEY_SPEED));
    if (v >= SPEED_MIN && v <= SPEED_MAX) this.speed = v;
  }
  dispose() { this.#stop(); }

  /* ---------- 導出値 ---------- */
  get has() { return this.questions.length > 0; }
  get index() {
    const n = this.questions.length;
    return n ? (((this.qno - 1 + this.offset) % n) + n) % n : -1;
  }
  get cur() { return this.questions[this.index] ?? null; }
  get len() { return this.cur?.q.length ?? 0; }
  get chars() { return Math.min(this.len, Math.floor(this.pos + 1e-9)); }
  get done() { return !!this.cur && this.chars >= this.len; }
  get chunks() { return this.cur ? chunksOf(this.cur) : []; }
  /** 塊の終わりの位置の一覧（文字数） */
  get ends() { let n = 0; return this.chunks.map(c => (n += c.length)); }

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
  #planned = false;
  #lastCpus = [];
  #lastLevel = 'normal';
  #invalidate() { this.#planned = false; this.#reset(); }
  #reset(cpus = this.#lastCpus, level = this.#lastLevel) {
    this.#lastCpus = cpus; this.#lastLevel = level;
    this.#stop(); this.reading = false;
    this.pos = 0; this.frozen = null; this.#segs = [];
    this.plans = [];
    const q = this.cur;
    if (!q) return;
    const plans = [];
    for (const c of cpus) { const p = cpuPlan(q, level); if (p) plans.push({ id: c.id, name: c.name, at: p.at, ok: p.ok, used: false }); }
    this.plans = plans.sort((a, b) => a.at - b.at);
  }
  /** 出す問題を前後にずらす（読み始めに戻る） */
  jump(d) { this.offset += d; this.#invalidate(); }

  /* ---------- 問読み（一定の速さで進む） ---------- */
  #now() { return performance.now(); }
  #stop() { clearInterval(this.#timer); this.#timer = null; }
  /** いまの区間を閉じる（読み進めている間だけ開いている） */
  #closeSeg() { const s = this.#segs.at(-1); if (s && s.t1 == null) s.t1 = this.#now(); }
  #openSeg(t = this.#now()) { this.#segs.push({ t0: t, p0: this.pos, v: this.speed, t1: null }); }
  /** 読み始める／続きを読む（止まっていた位置から） */
  start() {
    if (!this.cur || this.reading || this.done) return false;
    this.frozen = null; this.reading = true;
    this.#openSeg();
    this.#timer = setInterval(() => this.#tick(), TICK_MS);
    return true;
  }
  /** 一時停止 */
  pause() {
    if (!this.reading) return;
    this.#tick(); this.#closeSeg(); this.reading = false; this.#stop();
  }
  toggle() { return this.reading ? (this.pause(), true) : this.start(); }
  #tick() {
    const s = this.#segs.at(-1);
    if (!this.reading || !s || s.t1 != null) return;
    this.pos = Math.min(this.len, s.p0 + ((this.#now() - s.t0) * s.v) / 1000);
    if (this.pos >= this.len) { this.#closeSeg(); this.reading = false; this.#stop(); }
    this.#checkCpu();
  }
  /** 位置を飛ばす（手動の操作）。読み進めている最中なら、そこから続ける */
  #moveTo(p) {
    this.#closeSeg();
    this.pos = Math.max(0, Math.min(this.len, p)); this.frozen = null;
    if (this.reading && this.pos < this.len) this.#openSeg();
    else { this.reading = false; this.#stop(); this.#segs.push({ t0: this.#now(), p0: this.pos, v: this.speed, t1: this.#now() }); }
    this.#checkCpu();
  }
  /** 次の塊の終わりまで進める */
  advance() {
    if (!this.cur || this.done) return false;
    this.#moveTo(this.ends.find(e => e > this.chars) ?? this.len);
    return true;
  }
  /** 前の塊の初めまで戻す */
  back() {
    if (!this.cur || this.chars === 0) return;
    const starts = [0, ...this.ends.slice(0, -1)];
    this.#moveTo([...starts].reverse().find(s => s < this.chars) ?? 0);
  }
  revealAll() { if (this.cur && !this.done) this.#moveTo(this.len); }
  restart() { this.#stop(); this.reading = false; this.pos = 0; this.frozen = null; this.#segs = []; this.plans = this.plans.map(p => ({ ...p, used: false })); }
  setSpeed(v) {
    const n = Math.max(SPEED_MIN, Math.min(SPEED_MAX, Math.round(Number(v) || SPEED_DEFAULT)));
    if (n === this.speed) return;
    if (this.reading) { this.#tick(); this.#closeSeg(); this.speed = n; this.#openSeg(); } else this.speed = n;
    store.set(KEY_SPEED, String(n));
  }
  /** 押した時刻（performance.now 基準）の読み済みの文字数 */
  posAt(t) {
    for (let i = this.#segs.length - 1; i >= 0; i--) {
      const s = this.#segs[i];
      if (t >= s.t0) return Math.min(this.len, s.p0 + ((Math.min(t, s.t1 ?? t) - s.t0) * s.v) / 1000);
    }
    return 0;
  }
  /** 誰かが押して回答権が決まった。serverAt=勝者が押した時刻（サーバー時刻）、offset=この端末とサーバーの時計のずれ */
  freezeAt(serverAt, offset) {
    if (!this.cur) return;
    if (this.reading) this.#tick();
    let p = this.pos;
    if (typeof serverAt === 'number' && Number.isFinite(offset)) p = Math.min(this.pos, this.posAt(serverAt - offset));
    this.#closeSeg(); this.reading = false; this.#stop();
    this.pos = Math.floor(p + 1e-9); this.frozen = this.pos;
    this.#segs.push({ t0: this.#now(), p0: this.pos, v: this.speed, t1: this.#now() });
  }
  #checkCpu() {
    if (!this.cpuOn || this.frozen != null || !this.onCpu) return;
    const p = this.plans.find(x => !x.used && x.at <= this.chars);
    if (!p) return;
    this.plans = this.plans.map(x => (x.id === p.id ? { ...x, used: true } : x));
    this.onCpu({ id: p.id, name: p.name, ok: p.ok, answer: p.ok ? this.cur.a : null, question: this.cur });
  }
}
