// 問題集の検査・変換・CPUの押し方（純粋な関数）
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBank, normalizeQuestion, parseSlashed, toSlashed, parseLines, importText, chunksOf, readChars, chunksAt, cpuPlan, cpuWrongAnswer, exportBank, SAMPLE_BANK, CPU_SKILL, MAX_QUESTIONS } from '../../app/src/lib/questions.js';

const Q = { no: 1, q: '日本で一番高い山は何でしょう？', a: '富士山', cuts: [3, 7, 10], sure: 7 };

test('スラッシュ: 文 ⇄ 位置の変換。端・連続・全角も扱う', () => {
  assert.deepEqual(parseSlashed('日本で/一番高い/山は'), { q: '日本で一番高い山は', cuts: [3, 7] });
  assert.deepEqual(parseSlashed('/日本で//一番／高い/'), { q: '日本で一番高い', cuts: [3, 5] });
  assert.equal(toSlashed('日本で一番高い山は', [3, 7]), '日本で/一番高い/山は');
  for (const s of ['あ/いう/えお', 'a/b/c/d']) { const p = parseSlashed(s); assert.equal(toSlashed(p.q, p.cuts), s); }
  assert.deepEqual(parseSlashed(''), { q: '', cuts: [] });
});

test('1問の検査: 必須項目・範囲外の位置・確定ポイント', () => {
  assert.match(normalizeQuestion({ q: '', a: 'x' }, 1).error, /問題文/);
  assert.match(normalizeQuestion({ q: 'あ', a: '  ' }, 1).error, /正解/);
  assert.match(normalizeQuestion(null, 1).error, /形式/);
  const r = normalizeQuestion({ q: 'あいうえお', a: 'x', cuts: [0, 2, 2, 5, 9, 'x', 1.5, 4], sure: 99 }, 3);
  assert.deepEqual(r.q.cuts, [2, 4]);
  assert.equal(r.q.sure, null);
  assert.equal(r.q.no, 3);
  assert.ok(r.warn.length >= 2);
  assert.equal(normalizeQuestion({ q: 'あいう', a: 'x', sure: 3 }, 1).q.sure, 3);
  assert.equal(normalizeQuestion({ q: 'あいう', a: 'x', sure: 0 }, 1).q.sure, null);
  // 問題文にスラッシュが混ざっていたら区切りとして読む
  const s = normalizeQuestion({ q: 'あい/うえ/お', a: 'x' }, 1).q;
  assert.equal(s.q, 'あいうえお'); assert.deepEqual(s.cuts, [2, 4]);
});

test('問題集の検査: 番号の補完・重複・並べ替え・形式違い・長さ制限', () => {
  const r = normalizeBank({ version: 1, title: 'T', questions: [{ q: 'あ', a: 'x' }, { no: 5, q: 'い', a: 'y' }, { no: 5, q: 'う', a: 'z' }, { q: '', a: 'w' }, { no: 2, q: 'え', a: 'v' }] });
  assert.deepEqual(r.questions.map(q => q.no), [1, 2, 5]);
  assert.equal(r.title, 'T');
  assert.equal(r.errors.length, 2);
  assert.match(r.errors.join(' '), /重複/);
  assert.match(normalizeBank('{bad').errors[0], /JSON/);
  assert.match(normalizeBank({ foo: 1 }).errors[0], /questions/);
  assert.equal(normalizeBank([{ q: 'あ', a: 'x' }]).questions.length, 1, '配列そのものも受ける');
  assert.match(normalizeBank({ version: 99, questions: [] }).warnings[0], /新しい形式/);
  const many = normalizeBank({ questions: Array.from({ length: MAX_QUESTIONS + 20 }, (_, i) => ({ q: 'あ' + i, a: 'x' })) });
  assert.equal(many.questions.length, MAX_QUESTIONS);
  assert.ok(many.warnings.length);
  const long = normalizeQuestion({ q: 'あ'.repeat(1000), a: 'x'.repeat(200), alt: Array(20).fill('a') }, 1).q;
  assert.equal(long.q.length, 400); assert.equal(long.a.length, 60); assert.equal(long.alt.length, 8);
});

test('1行1問の取り込みと、JSONとの自動判別。書き出して読み直すと同じ', () => {
  const r = importText('日本で/一番高い/山は  ||  富士山  ||  7\n光が/一年に進む距離は\t光年\n\n壊れた行');
  assert.equal(r.questions.length, 2);
  assert.deepEqual(r.questions[0].cuts, [3, 7]); assert.equal(r.questions[0].sure, 7);
  assert.equal(r.questions[1].a, '光年');
  assert.equal(r.errors.length, 1);
  assert.deepEqual(parseLines('a/b||c')[0], { q: 'ab', cuts: [1], a: 'c', sure: null });
  assert.match(importText('  ').errors[0], /空/);
  const json = exportBank('題', SAMPLE_BANK.questions);
  const back = importText(json);
  assert.deepEqual(back.questions, normalizeBank(SAMPLE_BANK).questions);
  assert.equal(back.title, '題');
  assert.equal(normalizeBank(SAMPLE_BANK).errors.length, 0);
  assert.equal(normalizeBank(SAMPLE_BANK).warnings.length, 0, 'サンプルは警告なしで読める');
});

test('塊・読み済みの文字数・押した時刻からの塊の数', () => {
  const q = normalizeQuestion(Q, 1).q;
  assert.equal(chunksOf(q).join(''), q.q);
  assert.equal(chunksOf(q).length, 4);
  assert.equal(chunksOf({ q: 'あいう', cuts: [] }).length, 1);
  assert.deepEqual(chunksOf({ q: 'あいうえ', cuts: [1, 3] }), ['あ', 'いう', 'え']);
  assert.equal(readChars({ q: 'あいうえ', cuts: [1, 3] }, 0), 0);
  assert.equal(readChars({ q: 'あいうえ', cuts: [1, 3] }, 2), 3);
  assert.equal(readChars({ q: 'あいうえ', cuts: [1, 3] }, 99), 4);
  const times = [100, 200, 300];
  assert.deepEqual([50, 100, 150, 299, 300, 999].map(t => chunksAt(times, t)), [0, 1, 1, 2, 3, 3]);
  assert.equal(chunksAt([], 5), 0);
});

test('CPUの押し方: 確定ポイント基準・強さで変わる・押さないことがある', () => {
  const q = normalizeQuestion({ q: 'あ'.repeat(30), a: 'x', sure: 20, wrong: ['a', 'b'] }, 1).q;
  assert.equal(cpuPlan(normalizeQuestion({ q: 'あいう', a: 'x' }, 1).q, 'strong'), null, '確定ポイントが無ければ押さない');
  assert.equal(cpuPlan(q, 'strong', () => 0), null, 'never の確率に入ると押さない');
  for (const lv of ['weak', 'normal', 'strong']) {
    const p = cpuPlan(q, lv, () => 0.5);
    const [lo, hi] = CPU_SKILL[lv].lag;
    assert.equal(p.ok, true); assert.ok(p.at >= 20 + lo && p.at <= 20 + hi, lv);
  }
  const seq = [0.9, 0.0, 0.5]; let i = 0;
  const early = cpuPlan(q, 'weak', () => seq[i++ % 3]);          // never を避け、当てずっぽうに入る
  assert.equal(early.ok, false); assert.ok(early.at >= 1 && early.at < 20);
  const stat = lv => { let n = 0, ok = 0; for (let k = 0; k < 4000; k++) { const p = cpuPlan(q, lv); if (!p) continue; n++; ok += p.ok ? 1 : 0; assert.ok(p.at >= 1 && p.at <= q.q.length); } return { n, rate: ok / n }; };
  const w = stat('weak'), s = stat('strong');
  assert.ok(s.n > w.n, '強いほど押す');
  assert.ok(s.rate > w.rate, '強いほど正解する');
  assert.ok(cpuPlan(normalizeQuestion({ q: 'あ'.repeat(5), a: 'x', sure: 5 }, 1).q, 'weak', () => 0.99).at <= 5, '問題文の長さを超えない');
  assert.equal(cpuWrongAnswer(q, () => 0.99), 'b'); assert.equal(cpuWrongAnswer({ wrong: [] }), null);
});
