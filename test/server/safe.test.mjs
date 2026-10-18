// セキュリティ用の道具（server/safe.js）: 入力の掃除・比較・回数制限
import test from 'node:test';
import assert from 'node:assert/strict';
import { clean, safeEq, own, ipTag, Bucket, WindowLimiter, FailLock, sameOrigin } from '../../server/safe.js';

const cp = (...n) => String.fromCodePoint(...n);

test('clean: 制御文字・向きを変える文字・ゼロ幅文字を除き、空白を整え、長さを切る', () => {
  assert.equal(clean('  あ　い  う ', 20), 'あ い う');
  assert.equal(clean(`a${cp(0x202e)}b${cp(0)}c${cp(0x200b)}d${cp(0x2066)}e${cp(0xfeff)}f${cp(0x7f)}g`, 20), 'abcdefg');
  assert.equal(clean('改行\nあり\t(タブ)\r\nです', 30), '改行 あり (タブ) です');
  assert.equal(clean('x'.repeat(500), 12), 'x'.repeat(12));
  assert.equal(clean('😀絵文字', 3), '😀絵'); assert.equal(clean('😀😀', 3), '😀', '絵文字の途中では切らない（壊れた文字を残さない）');
  assert.equal(clean('<script>alert(1)</script>', 40), '<script>alert(1)</script>', 'タグは、画面側で文字として表示するので、そのまま');
  assert.equal(clean(null, 5), ''); assert.equal(clean(undefined, 5), ''); assert.equal(clean({ a: 1 }, 5), ''); assert.equal(clean(['x'], 5), '');
  assert.equal(clean(12345, 3), '123');
  assert.equal(clean('a'.repeat(10 ** 6), 10), 'a'.repeat(10), '巨大な入力でも、短い時間で終わる');
  for (const bad of [0x2028, 0x2029, 0x202a, 0x202b, 0x202c, 0x202d, 0x2060, 0x2061, 0x206f, 0xfff9, 0x80, 0x9f]) assert.equal(clean(`a${cp(bad)}b`, 9), 'ab', bad.toString(16));
});

test('safeEq: 同じ文字列だけ true。型が違う・長さが違う・空は false', () => {
  assert.equal(safeEq('abc', 'abc'), true);
  assert.equal(safeEq('abc', 'abd'), false); assert.equal(safeEq('abc', 'ab'), false); assert.equal(safeEq('ab', 'abc'), false);
  assert.equal(safeEq('', ''), true);
  assert.equal(safeEq(null, ''), false); assert.equal(safeEq(undefined, undefined), false); assert.equal(safeEq(1, 1), false);
  assert.equal(safeEq('あ', 'あ'), true); assert.equal(safeEq('あ', 'い'), false);
});

test('own: 自分自身のプロパティだけ。__proto__・constructor・toString では何も出ない', () => {
  const o = { a: 1, b: { x: 2 } };
  assert.equal(own(o, 'a'), 1); assert.deepEqual(own(o, 'b'), { x: 2 });
  for (const k of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', 'prototype', 'zzz', '', 5, null, undefined, {}, ['a']]) assert.equal(own(o, k), undefined, String(k));
  assert.equal(own(null, 'a'), undefined);
  const parsed = JSON.parse('{"__proto__": {"polluted": true}, "k": 1}');            // JSON から作ったオブジェクトでも
  assert.equal(own(parsed, 'k'), 1);
  assert.equal(({}).polluted, undefined);
});

test('ipTag: 同じ IP は同じ印・別の IP は別の印・空は空。IP そのものは含まない', async () => {
  const a = await ipTag('203.0.113.5'), b = await ipTag('203.0.113.6');
  assert.equal(a, await ipTag('203.0.113.5')); assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f]{12}$/); assert.ok(!a.includes('203'));
  assert.equal(await ipTag(''), ''); assert.equal(await ipTag(undefined), '');
});

test('Bucket: たまった分だけ使え、時間で回復する。使えなかった回数を数える', () => {
  let t = 0;
  const b = new Bucket(5, 2, () => t);
  for (let i = 0; i < 5; i++) assert.equal(b.allow(), true);
  assert.equal(b.allow(), false); assert.equal(b.strikes, 1);
  t += 500; assert.equal(b.allow(), true); assert.equal(b.allow(), false);       // 0.5秒で1つ回復
  t += 10_000; for (let i = 0; i < 5; i++) assert.equal(b.allow(), true);          // 上限を超えてはためない
  assert.equal(b.allow(), false);
  t += 1000; assert.equal(b.allow(2), true); assert.equal(b.allow(0.1), false);   // まとめて使う
});

test('WindowLimiter: 一定時間の回数制限。キーごとに別。古いキーは捨てる', () => {
  let t = 0;
  const l = new WindowLimiter(3, 1000, () => t, 10);
  assert.deepEqual([1, 2, 3, 4].map(() => l.hit('a')), [true, true, true, false]);
  assert.equal(l.hit('b'), true);
  t = 1000; assert.equal(l.hit('a'), true, '時間がたつと戻る');
  for (let i = 0; i < 100; i++) l.hit('k' + i);
  assert.ok(l.map.size <= 10, `キーの数に上限がある: ${l.map.size}`);
  t = 5000; l.hit('x');
  assert.ok(l.map.size <= 10);
});

test('FailLock: 失敗が続くとロック。成功で解除。時間でロックも解ける', () => {
  let t = 0;
  const f = new FailLock(3, 1000, () => t);
  f.fail('ip'); f.fail('ip'); assert.equal(f.locked('ip'), false);
  f.fail('ip'); assert.equal(f.locked('ip'), true); assert.equal(f.locked('other'), false);
  t = 999; assert.equal(f.locked('ip'), true);
  t = 1000; assert.equal(f.locked('ip'), false);
  const many = new FailLock(1, 1000, () => t, 5);
  for (let i = 0; i < 50; i++) many.fail('k' + i);
  assert.ok(many.map.size <= 5, 'キーの数に上限がある');
  f.fail('ip'); assert.equal(f.locked('ip'), false, 'ロックが解けたら、数え直し');
  f.fail('x'); f.fail('x'); f.ok('x'); f.fail('x'); f.fail('x'); assert.equal(f.locked('x'), false, '成功すると数がリセットされる');
});

test('sameOrigin: Origin が同じサイトか無ければ通す。別のサイト・壊れた値は断る', () => {
  const req = origin => ({ headers: { get: k => (k === 'Origin' ? origin : null) } });
  const url = new URL('https://quiz.example/ws?id=1');
  assert.equal(sameOrigin(req(null), url), true);
  assert.equal(sameOrigin(req('https://quiz.example'), url), true);
  assert.equal(sameOrigin(req('https://evil.example'), url), false);
  assert.equal(sameOrigin(req('https://quiz.example.evil.example'), url), false);
  assert.equal(sameOrigin(req('https://evilquiz.example'), url), false);
  assert.equal(sameOrigin(req('null'), url), false);
  assert.equal(sameOrigin(req('not a url'), url), false);
});
