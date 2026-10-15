// 早押しの判定ロジックの単体テスト（サーバーを起動せず、純粋なクラスだけを検査する）
import test from 'node:test';
import assert from 'node:assert/strict';
import { BuzzRound, clampRtt } from '../../src/server/buzz.js';
import * as C from '../../src/server/config.js';

const round = (eligible = { a: 0, b: 0, c: 0 }) => BuzzRound.start(1, eligible);

test('受付: 押せるのは「受付中」かつ「押せる人」で、1人1回まで', () => {
  const r = round({ a: 0, b: 0 });
  assert.equal(r.canBuzz('a'), true);
  assert.equal(r.canBuzz('x'), false);                // 押せない人
  assert.equal(r.record('a', 1000, 1010), true);
  assert.equal(r.canBuzz('a'), false);                // 二重押し
  assert.equal(r.record('a', 900, 1020), false);
  r.close();
  assert.equal(r.canBuzz('b'), false);                // 受付終了後
  assert.equal(new BuzzRound().canBuzz('a'), false);  // 受付前
});

test('順位: 押した時刻が早い順。ms差は1ms単位まで正確', () => {
  for (const diff of [1, 2, 3, 5, 7, 10, 15, 25, 100]) {
    const r = round({ a: 0, b: 0 });
    r.record('b', 5000 + diff, 5100);   // 遅い人が先に届く
    r.record('a', 5000, 5105);
    const rank = r.ranking();
    assert.deepEqual(rank.map(x => x.pid), ['a', 'b']);
    assert.equal(rank[1].ms, diff);
  }
});

test('順位: 同時刻なら先に届いた人が勝つ（常に同じ結果）', () => {
  const r = round({ a: 0, b: 0 });
  r.record('b', 7000, 7050);
  r.record('a', 7000, 7051);
  assert.deepEqual(r.ranking().map(x => x.pid), ['b', 'a']);
});

test('ディレイ: 押した時刻にディレイが足されて比べられる', () => {
  const r = round({ a: 700, b: 0 });
  r.record('a', 1000, 1010);     // 実効 1700
  r.record('b', 1500, 1510);     // 実効 1500 → ディレイの人より早い
  assert.equal(r.ranking()[0].pid, 'b');
  const r2 = round({ a: 700, b: 0 });
  r2.record('a', 1000, 1010);
  r2.record('b', 1800, 1810);    // 1800 > 1700 → ディレイの人が勝つ
  assert.equal(r2.ranking()[0].pid, 'a');
});

test('時刻の偽装: 到着より未来にも、2秒より前にもできない', () => {
  const r = round({ a: 0, b: 0 });
  r.record('a', 99999, 1000);            // 未来 → 到着時刻に丸める
  r.record('b', -50000, 1000);           // 大昔 → 到着の2秒前まで
  const e = r.buzzes;
  assert.equal(e.a, 1000);
  assert.equal(e.b, 1000 - C.TS_MAX_PAST_MS);
  const r2 = round({ a: 0 });
  r2.record('a', 'abc', 4000);           // 数値でない申告は到着時刻
  assert.equal(r2.buzzes.a, 4000);
});

test('待ち時間: 最も遅い人の片道遅延＋余裕。下限・上限・未報告・オフラインを考慮する', () => {
  const r = round({ a: 0, b: 0, c: 0 });
  const rtts = { a: 20, b: 100, c: 300 };
  assert.equal(r.tolerance(p => rtts[p]), 300 / 2 + C.TOLERANCE_MARGIN_MS);
  // オフラインの人は待たない
  assert.equal(r.tolerance(p => rtts[p], p => p !== 'c'), 100 / 2 + C.TOLERANCE_MARGIN_MS);
  // 全員が速い回線でも下限より短くはならない
  assert.equal(r.tolerance(() => 4), C.TOLERANCE_MIN_MS);
  // 遅延が未報告の人は仮定値
  assert.equal(r.tolerance(() => undefined), C.DEFAULT_RTT_MS / 2 + C.TOLERANCE_MARGIN_MS);
  // 極端に遅い回線でも上限まで
  assert.equal(r.tolerance(() => 5000), C.TOLERANCE_MAX_MS);
  // 誰も押せる人がいなくても下限
  assert.equal(round({}).tolerance(() => 100), C.TOLERANCE_MIN_MS);
});

test('確定時刻: 最も早い押下 + 待ち時間。遅い回線の人の押下が間に合う', () => {
  const r = round({ fast: 0, slow: 0 });
  const rtts = { fast: 20, slow: 300 };
  const T0 = 10000;
  r.record('fast', T0 + 8, T0 + 18);          // 8ms 遅く押したが、早く届いた
  const deadline = r.deadline(p => rtts[p]);
  const slowArrival = T0 + 150;               // 遅い回線の押下は 150ms 後に届く
  assert.ok(deadline >= slowArrival, `確定が早すぎる: 確定 ${deadline - T0}ms / 到着 ${slowArrival - T0}ms`);
  r.record('slow', T0, slowArrival);
  assert.equal(r.ranking()[0].pid, 'slow');
});

test('結果: 誰も押していなければ空。名前の引き当て', () => {
  const r = round({ a: 0 });
  assert.deepEqual(r.ranking(), []);
  assert.equal(r.earliest, undefined);
  r.record('a', 1, 2);
  assert.equal(r.ranking(p => `名前-${p}`)[0].name, '名前-a');
});

test('保存・復元: 押下の記録は含めず、受付中かどうかと押せる人だけを持つ', () => {
  const r = round({ a: 0, b: 700 });
  r.record('a', 1, 2);
  const back = BuzzRound.from(JSON.parse(JSON.stringify(r)));
  assert.deepEqual([back.open, back.q, back.eligible], [true, 1, { a: 0, b: 700 }]);
  assert.deepEqual(back.buzzes, {});
  assert.equal(BuzzRound.from(null).open, false);
});

test('遅延の申告値は 1〜3000ms に収める', () => {
  assert.equal(clampRtt(0), 1);
  assert.equal(clampRtt(-5), 1);
  assert.equal(clampRtt('abc'), 1);
  assert.equal(clampRtt(99999), C.RTT_MAX_MS);
  assert.equal(clampRtt(45.4), 45.4);
});

test('連チャン: 勝者が決まったあとも押下を記録でき、順位表から誤答者を除いて次の人を選べる', () => {
  const r = BuzzRound.start(1, { a: 0, b: 0, c: 0 }, true);
  r.record('a', 1000, 1010);
  r.decided();
  assert.equal(r.open, false);
  assert.equal(r.backup, true);
  assert.equal(r.canBuzz('b'), true, '控えとして押せる');
  assert.equal(r.record('c', 1300, 1320), true);
  assert.equal(r.record('b', 1100, 1130), true);
  assert.equal(r.canBuzz('b'), false, '二重には押せない');
  assert.deepEqual(r.ranking().map(x => x.pid), ['a', 'b', 'c']);
  assert.deepEqual(r.ranking(undefined, ['a']).map(x => x.pid), ['b', 'c']);
  assert.deepEqual(r.ranking(undefined, ['a', 'b']).map(x => x.pid), ['c']);
  assert.deepEqual(r.ranking(undefined, ['a', 'b', 'c']), []);
  r.close();
  assert.equal(r.canBuzz('x'), false);
});

test('連チャンでない通常の受付は、勝者が決まったら押せなくなる。保存しても連チャンの設定は残る', () => {
  const r = BuzzRound.start(1, { a: 0, b: 0 });
  r.record('a', 1000, 1010);
  r.decided();
  assert.equal(r.canBuzz('b'), false);
  const c = BuzzRound.from(JSON.parse(JSON.stringify(BuzzRound.start(2, { a: 0 }, true).toJSON())));
  assert.equal(c.chain, true);
});
