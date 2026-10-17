// 問題集（問題文・正解・スラッシュの位置・確定ポイント）の検査・変換・CPUの押し方。画面にも通信にも依存しない純粋な関数
// 形式の設計は docs/QUESTION_DESIGN.md

export const BANK_VERSION = 1;
export const MAX_QUESTIONS = 500;
export const MAX_Q_LEN = 400;

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strList = (v, max = 8) => (Array.isArray(v) ? v.map(x => str(x, 60)).filter(Boolean).slice(0, max) : []);

/**
 * 印入りの文 → { q, cuts, sure? }。「日本で/一番高い/山は」→ q=日本で一番高い山は, cuts=[3,7]
 * 「｜」（全角の縦棒）は確定ポイントの印: 「日本で/一番高い｜/山は」→ sure=7
 */
export function parseSlashed(text) {
  let q = '', cuts = [], sure = null;
  for (const ch of String(text ?? '').replace(/[\r\n]+/g, '')) {
    if (ch === '/' || ch === '／') { if (q.length && cuts[cuts.length - 1] !== q.length) cuts.push(q.length); }
    else if (ch === '｜') { if (q.length) sure = q.length; }
    else q += ch;
  }
  cuts = cuts.filter(c => c > 0 && c < q.length);
  return sure != null ? { q, cuts, sure } : { q, cuts };
}
/** { q, cuts } → スラッシュ入りの文 */
export function toSlashed(q, cuts = []) {
  const set = new Set(cuts);
  return [...q].map((ch, i) => (set.has(i) ? '/' : '') + ch).join('');
}

/** 1問を正規化する。問題のある項目は直し、直せないときは null と理由を返す */
export function normalizeQuestion(raw, no) {
  const warn = [];
  if (!raw || typeof raw !== 'object') return { q: null, error: '問題の形式が正しくありません' };
  let q = str(raw.q, MAX_Q_LEN), a = str(raw.a, 60);
  let cuts = Array.isArray(raw.cuts) ? raw.cuts : [];
  let sure = raw.sure;
  if (/[\/／｜]/.test(q)) {                                  // 問題文に / や ｜ が混ざっていたら、区切り・確定ポイントの印として読む
    const p = parseSlashed(q); q = p.q; cuts = [...new Set([...cuts, ...p.cuts])];
    if (p.sure != null) sure = p.sure;
  }
  if (!q) return { q: null, error: '問題文が空です' };
  if (!a) return { q: null, error: '正解が空です' };
  const clean = [...new Set(cuts.map(Number).filter(Number.isInteger))].sort((x, y) => x - y);
  const cs = clean.filter(c => c > 0 && c < q.length);
  if (cs.length !== clean.length) warn.push('範囲外のスラッシュの位置を除きました');
  if (sure == null || sure === '') sure = null;
  else {
    sure = Math.round(Number(sure));
    if (!Number.isFinite(sure) || sure < 1 || sure > q.length) { warn.push('確定ポイントが範囲外のため、なしにしました'); sure = null; }
  }
  return {
    q: { no, q, a, alt: strList(raw.alt), wrong: strList(raw.wrong), cuts: cs, sure, reading: str(raw.reading, MAX_Q_LEN) || null },
    warn,
  };
}

/**
 * 取り込んだ内容（JSONの文字列／オブジェクト）を検査する。
 * 戻り値 { title, questions, errors: ['3問目: 正解が空です'], warnings: [...] }。直せない問題は questions に入らない
 */
export function normalizeBank(input) {
  const errors = [], warnings = [];
  let data = input;
  if (typeof input === 'string') {
    try { data = JSON.parse(input); } catch { return { title: '', questions: [], errors: ['JSONとして読めません'], warnings }; }
  }
  const list = Array.isArray(data) ? data : Array.isArray(data?.questions) ? data.questions : null;
  if (!list) return { title: '', questions: [], errors: ['questions（問題の配列）が見つかりません'], warnings };
  if (data?.version != null && data.version > BANK_VERSION) warnings.push(`新しい形式（version ${data.version}）です。読めない項目は無視します`);
  if (list.length > MAX_QUESTIONS) warnings.push(`${MAX_QUESTIONS}問を超える分は読み込みません`);
  const questions = [], seen = new Set();
  list.slice(0, MAX_QUESTIONS).forEach((raw, i) => {
    let no = Number(raw?.no);
    if (!Number.isInteger(no) || no < 1) no = i + 1;
    if (seen.has(no)) { errors.push(`${i + 1}番目: 問題番号 ${no} が重複しています`); return; }
    const r = normalizeQuestion(raw, no);
    if (!r.q) { errors.push(`${i + 1}番目: ${r.error}`); return; }
    seen.add(no);
    for (const w of r.warn) warnings.push(`${i + 1}番目: ${w}`);
    questions.push(r.q);
  });
  questions.sort((x, y) => x.no - y.no);
  return { title: str(data?.title, 40), questions, errors, warnings };
}

/**
 * 手書きの一覧（1行1問）を問題集にする。
 * 形式: 「問題文（/で区切る）<タブまたは||>正解」。正解の右に「<タブまたは||>確定ポイント(文字数)」も書ける
 */
export function parseLines(text) {
  const out = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split(/\t|\|\|/).map(s => s.trim());
    if (parts.length < 2) { out.push({ q: line.trim(), a: '' }); continue; }
    const p = parseSlashed(parts[0]);
    out.push({ q: p.q, cuts: p.cuts, a: parts[1], sure: p.sure ?? (parts[2] ? Number(parts[2]) : null) });
  }
  return out;
}

/** 取り込みの入口。JSON でも1行1問でも受ける */
export function importText(text) {
  const t = String(text ?? '').trim();
  if (!t) return { title: '', questions: [], errors: ['空です'], warnings: [] };
  return normalizeBank(/^[\[{]/.test(t) ? t : { questions: parseLines(t) });
}

/** 書き出し用 */
export function exportBank(title, questions) {
  return JSON.stringify({ version: BANK_VERSION, title: title || '', questions }, null, 2);
}

/** 問題文を、スラッシュの位置で塊に分ける */
export function chunksOf(q) {
  const out = [];
  let from = 0;
  for (const c of [...(q.cuts ?? []), q.q.length]) { if (c > from) { out.push(q.q.slice(from, c)); from = c; } }
  return out;
}
/** n塊まで表示したときの、読み済みの文字数 */
export function readChars(q, shown) {
  let n = 0;
  for (const c of chunksOf(q).slice(0, shown)) n += c.length;
  return n;
}
/** 押した時刻（performance.now 基準）から、読み済みの塊の数を求める。times[i] は i+1 塊目を表示した時刻 */
export function chunksAt(times, t) {
  let n = 0;
  for (const x of times) if (x <= t) n++; else break;
  return n;
}

/** CPUの強さごとの押し方。lag=確定ポイントを過ぎてから押すまでの文字数、early=確定前に当てずっぽうで押す確率、never=押さない確率 */
export const CPU_SKILL = {
  weak: { lag: [4, 14], early: 0.22, never: 0.25 },
  normal: { lag: [1, 6], early: 0.12, never: 0.1 },
  strong: { lag: [0, 2], early: 0.05, never: 0.03 },
};

/**
 * CPU 1体の押し方を決める。{ at: 何文字読まれたら押すか, ok: 正解するか } か、押さないとき null。
 * 確定ポイント（sure）が無い問題では押さない。正誤は「押した位置が確定ポイント以降か」で決まる
 */
export function cpuPlan(question, level = 'normal', rand = Math.random) {
  const sure = question?.sure;
  if (!sure) return null;
  const k = CPU_SKILL[level] ?? CPU_SKILL.normal;
  if (rand() < k.never) return null;
  if (sure > 3 && rand() < k.early) {
    const at = Math.max(1, Math.floor(sure * (0.35 + 0.6 * rand())));
    return { at: Math.min(at, sure - 1), ok: false };
  }
  const lag = k.lag[0] + Math.floor(rand() * (k.lag[1] - k.lag[0] + 1));
  return { at: Math.min(question.q.length, sure + lag), ok: true };
}
/** CPUが誤答したときに言う答え（誤答の候補から選ぶ。無ければ null） */
export function cpuWrongAnswer(question, rand = Math.random) {
  const w = question?.wrong ?? [];
  return w.length ? w[Math.floor(rand() * w.length)] : null;
}

export const SAMPLE_BANK = {
  version: BANK_VERSION,
  title: 'サンプル問題集',
  questions: [
    { no: 1, q: '日本で一番高い山は何でしょう？', a: '富士山', alt: ['ふじさん', '富士'], wrong: ['北岳', '穂高岳', '立山'], cuts: [4, 7, 10], sure: 7 },
    { no: 2, q: '光が一年間に進む距離を表す天文学の単位は何でしょう？', a: '光年', alt: ['こうねん'], wrong: ['天文単位', 'パーセク'], cuts: [3, 7, 10, 15, 20], sure: 20 },
  ],
};
