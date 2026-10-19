// 問題集の検査・変換・CPUの押し方（純粋な関数）
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBank, normalizeQuestion, parseSlashed, toSlashed, parseLines, importText, chunksOf, readChars, chunksAt, cpuPlan, cpuWrongAnswer, personaFor, PERSONAS, exportBank, SAMPLE_BANK, CPU_SKILL, CPU_RATE, MAX_QUESTIONS } from '../../app/src/lib/questions.js';

const Q = { no: 1, q: '日本で一番高い山は何でしょう？', a: '富士山', cuts: [3, 7, 10], sure: 7 };

test('スラッシュ: 文 ⇄ 位置の変換。端・連続・全角も扱う', () => {
  assert.deepEqual(parseSlashed('日本で/一番高い/山は'), { q: '日本で一番高い山は', cuts: [3, 7] });
  assert.deepEqual(parseSlashed('/日本で//一番／高い/'), { q: '日本で一番高い', cuts: [3, 5] });
  assert.equal(toSlashed('日本で一番高い山は', [3, 7]), '日本で/一番高い/山は');
  for (const s of ['あ/いう/えお', 'a/b/c/d']) { const p = parseSlashed(s); assert.equal(toSlashed(p.q, p.cuts), s); }
  assert.deepEqual(parseSlashed(''), { q: '', cuts: [] });
  // 「｜」は確定ポイントの印
  assert.deepEqual(parseSlashed('日本で/一番高い｜/山は'), { q: '日本で一番高い山は', cuts: [3, 7], sure: 7 });
  assert.deepEqual(parseSlashed('｜あい'), { q: 'あい', cuts: [] }, '先頭の印は無視');
  const m = normalizeQuestion({ q: 'あい/うえ｜/お', a: 'x', sure: 1 }, 1).q;
  assert.deepEqual([m.q, m.cuts, m.sure], ['あいうえお', [2, 4], 4], '問題文の印が、sure の指定より優先される');
  assert.equal(normalizeQuestion({ q: 'あいう/えお', a: 'x', sure: 3 }, 1).q.sure, 3, '印が無ければ sure の指定を使う');
  assert.equal(importText('あい/うえ｜/お || 答え').questions[0].sure, 4, '1行1問でも印が使える');
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
  assert.equal(cpuPlan(q, 'strong', () => 0), null, 'スルーの割合に入ると押さない');
  for (const lv of ['weak', 'normal', 'strong']) {
    const p = cpuPlan(q, lv, () => 0.9);          // どの強さでも、正解の割合に入る
    const [lo, hi] = CPU_SKILL[lv].lag;
    assert.equal(p.ok, true); assert.ok(p.at >= 20 + lo && p.at <= 20 + hi, lv);
  }
  const seq = [0.3, 0.0, 0.5]; let i = 0;
  const early = cpuPlan(q, 'weak', () => seq[i++ % 3]);          // 誤答の割合に入り、先走る
  assert.equal(early.ok, false); assert.ok(early.at >= 1 && early.at < 20);
  // 結果の割合は、強さごとに決まっていて、性格には関係ない
  for (const lv of ['weak', 'normal', 'strong']) for (const ps of Object.keys(PERSONAS)) {
    const N = 20000; let skip = 0, wrong = 0, right = 0;
    for (let k = 0; k < N; k++) { const p = cpuPlan(q, lv, Math.random, ps); if (!p) skip++; else if (p.ok) right++; else wrong++; assert.ok(!p || (p.at >= 1 && p.at <= q.q.length)); }
    const R = CPU_RATE[lv];
    assert.ok(Math.abs(skip / N - R.skip) < 0.015 && Math.abs(wrong / N - R.wrong) < 0.015 && Math.abs(right / N - R.right) < 0.015, `${lv}/${ps}: ${skip / N} ${wrong / N} ${right / N}`);
  }
  assert.ok(cpuPlan(normalizeQuestion({ q: 'あ'.repeat(5), a: 'x', sure: 5 }, 1).q, 'weak', () => 0.99).at <= 5, '問題文の長さを超えない');
  assert.equal(cpuWrongAnswer(q, () => 0.99), 'b'); assert.equal(cpuWrongAnswer({ wrong: [] }), null);
});

test('1問の検査: 人間らしいCPU用の情報（genre・diff・guess・traps）。範囲外は直して知らせる', () => {
  const r = normalizeQuestion({ q: 'あいう/えお/かき', a: 'x', genre: '歴史', diff: 4, guess: 2, traps: [{ chunk: 1, a: '誤1' }, { chunk: 3, a: '誤2' }] }, 1);
  assert.deepEqual([r.q.genre, r.q.diff, r.q.guess, r.q.traps], ['歴史', 4, 2, [{ chunk: 1, a: '誤1' }, { chunk: 3, a: '誤2' }]]);
  assert.equal(r.warn.length, 0);
  const bad = normalizeQuestion({ q: 'あいう/えお', a: 'x', diff: 9, guess: 5, traps: [{ chunk: 5, a: 'y' }, { chunk: 1 }, 'z', { chunk: 2, a: '有効' }] }, 1);
  assert.deepEqual([bad.q.diff, bad.q.guess, bad.q.traps], [null, null, [{ chunk: 2, a: '有効' }]]);
  assert.ok(bad.warn.length >= 3);
  const none = normalizeQuestion({ q: 'あいう', a: 'x' }, 1).q;
  assert.deepEqual([none.genre, none.diff, none.guess, none.traps], [null, null, null, []]);
  assert.equal(normalizeQuestion({ q: 'あ', a: 'x', traps: Array(9).fill({ chunk: 1, a: 'y' }) }, 1).q.traps.length, 4, '引っかけは4つまで');
});

test('CPUの性格: 名前で決まり（いつも同じ）、4種類にばらける。性格で押し方が変わる', () => {
  assert.equal(personaFor('魔王1'), personaFor('魔王1'));
  const kinds = new Set(['魔王1', '魔王2', '魔王3', '魔王4', '魔王5', '魔王6', '戦士', '僧侶', 'A', 'B', 'C', 'D'].map(personaFor));
  assert.ok(kinds.size >= 3, [...kinds].join());
  const q = normalizeQuestion({ q: 'あ'.repeat(30), a: 'x', sure: 20, wrong: ['a', 'b'] }, 1).q;
  const avg = (persona, f) => { let n = 0, sum = 0; for (let i = 0; i < 4000; i++) { const p = cpuPlan(q, 'normal', Math.random, persona); if (p) { n++; sum += f(p); } } return sum / n; };
  assert.ok(avg('hasty', p => p.at) < avg('careful', p => p.at), 'せっかちは早く押し、慎重は遅く押す');
  assert.ok(avg('hasty', p => p.react) < avg('careful', p => p.react), 'せっかちは反応が速い');
  for (const k of Object.keys(PERSONAS)) assert.ok(PERSONAS[k].label);
});

test('CPUの押し方の種類: わかって押す・先走り（当たることも）・引っかけ・知ったかぶり。反応の遅れがある', () => {
  const q = normalizeQuestion({ q: 'あいうえお/かきくけこ/さしすせそ/たちつてと', a: '正解', sure: 15, wrong: ['誤A', '誤B'], traps: [{ chunk: 1, a: '罠' }], guess: 2 }, 1).q;
  const seen = {};
  for (let i = 0; i < 6000; i++) {
    const p = cpuPlan(q, 'weak', Math.random, ['hasty', 'careful', 'scholar', 'moody'][i % 4]);
    if (!p) { seen.none = (seen.none ?? 0) + 1; continue; }
    (seen[p.kind] ??= []).push(p);
    assert.ok(p.at >= 1 && p.at <= q.q.length); assert.ok(p.react >= 50 && p.react <= 1500, `${p.react}`);
    if (p.ok) assert.ok(p.answer == null || p.kind === 'know', '正解のときに誤答の文言がない');
    else assert.ok(p.answer, '誤答には答えがある');
  }
  for (const k of ['none', 'know', 'guess', 'trap', 'bluff']) assert.ok(seen[k]?.length ?? seen[k], `${k} が出ない`);
  assert.ok(seen.guess.some(p => p.ok) && seen.guess.some(p => !p.ok), '先走りは、当たることも外れることもある');
  assert.ok(seen.trap.every(p => p.answer === '罠' && p.at === 5 && !p.ok), '引っかけは、その塊の終わりで、その答えを言う');
  assert.ok(seen.guess.filter(p => p.at === 10 || p.at < 15).length === seen.guess.length, '先走りは確定ポイントの前');
  assert.ok(seen.know.every(p => p.at >= 15 && p.ok), 'わかって押すのは確定ポイント以降');
  assert.ok(seen.bluff.every(p => p.at >= 15 && !p.ok), '知ったかぶりも、見かけは確定ポイント以降');
});

test('CPUの気分: 誤答の直後は慎重（先走り・知ったかぶりが減り、反応が遅くなる）', () => {
  const q = normalizeQuestion({ q: 'あ'.repeat(30), a: 'x', sure: 20, wrong: ['a'] }, 1).q;
  const rate = (mood, qq = q, f = p => p.ok === false) => { let n = 0, hit = 0; for (let i = 0; i < 6000; i++) { n++; const p = cpuPlan(qq, 'normal', Math.random, 'moody', mood); if (p && f(p)) hit++; } return hit / n; };
  assert.ok(rate({ cautious: 2 }) < rate({}) * 0.5, '慎重なときは、誤答が少ない');
  assert.ok(rate({ cautious: 2 }, q, p => false) === 0);
  let rt = (mood) => { let s = 0, n = 0; for (let i = 0; i < 3000; i++) { const p = cpuPlan(q, 'normal', Math.random, 'moody', mood); if (p) { s += p.react; n++; } } return s / n; };
  assert.ok(rt({ cautious: 1 }) > rt({}) + 60, '慎重なときは反応が遅い');
});
