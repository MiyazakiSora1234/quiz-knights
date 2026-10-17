// 問題情報生成ツール（tools/make-bank.mjs）
import test from 'node:test';
import assert from 'node:assert/strict';
import { autoCuts, autoSure, splitAnswer, buildBank, parenDepth } from '../../tools/make-bank.mjs';
import { normalizeBank, chunksOf } from '../../app/src/lib/questions.js';

const Q1 = '銀行が預金の受け入れと貸し出しを繰り返すことで、当初の預金の何倍もの預金通貨を生み出す仕組みを何というでしょう？';
const Q2 = '佐藤二朗（さとう・じろう）演じる「スズキタゴサク」のティザーも話題となった、呉勝浩（ご・かつひろ）原作・永井聡（ながい・あきら）監督の映画は何でしょう？';

test('区切り: 昇順・範囲内・読みの括弧の途中では切らない・塊の長さが程よい', () => {
  for (const q of [Q1, Q2]) {
    const cuts = autoCuts(q), depth = parenDepth(q);
    assert.ok(cuts.length >= 3);
    assert.deepEqual(cuts, [...cuts].sort((a, b) => a - b));
    for (const c of cuts) { assert.ok(c > 0 && c < q.length); assert.ok(!(depth[c - 1] > 0 && !'）)'.includes(q[c - 1])), `括弧の途中: ${c}`); }
    const lens = chunksOf({ q, cuts }).map(x => x.length);
    assert.ok(Math.max(...lens) <= 30 && lens.at(-1) >= 4, JSON.stringify(lens));
  }
  assert.deepEqual(autoCuts('短い'), []);
});

test('確定ポイント: 区切りの位置に合い、問いかけ（何というでしょう）より前', () => {
  for (const q of [Q1, Q2]) {
    const cuts = autoCuts(q), s = autoSure(q, cuts);
    assert.ok(cuts.includes(s) || s === q.length);
    assert.ok(s >= 1 && s < q.length && s <= q.lastIndexOf('何') + 3, `${s}`);
  }
  assert.ok(autoSure('SDGsにおける目標の数は17ですが、ターゲットの数はいくつでしょう？') > 15);
});

test('正解: （）の中は別表記・『』は外す', () => {
  assert.deepEqual(splitAnswer('『爆弾』（ばくだん）'), { a: '爆弾', alt: ['ばくだん'] });
  assert.deepEqual(splitAnswer('蒋介石（しょう・かいせき/ジアン・ジエシー)'), { a: '蒋介石', alt: ['しょう・かいせき', 'ジアン・ジエシー'] });
  assert.deepEqual(splitAnswer('パリ'), { a: 'パリ', alt: [] });
  assert.deepEqual(splitAnswer('（分子進化の）中立説'), { a: '中立説', alt: ['分子進化の'] });
});

test('問題集の作成: タブ区切り→検査を通る問題集。スラッシュ指定は尊重、不備の行は報告', () => {
  const r = buildBank(`${Q1}\t信用創造\n日本で/一番高い/山は何でしょう？\t富士山（ふじさん）\n壊れた行\n\n`, 'テスト');
  assert.equal(r.bank.title, 'テスト');
  assert.equal(r.bank.questions.length, 2);
  assert.equal(r.errors.length, 1);
  assert.deepEqual(r.bank.questions[1].cuts, [3, 7]);
  assert.deepEqual(r.bank.questions[1].alt, ['ふじさん']);
  assert.ok(r.bank.questions[0].sure > 0);
  const again = normalizeBank(r.bank);
  assert.equal(again.errors.length, 0); assert.equal(again.warnings.length, 0);
});
