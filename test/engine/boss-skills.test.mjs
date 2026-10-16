// 魔王の新しい技（各魔王の技の種類を増やした分）の効果を確かめる。参加者が魔王を操作する形で、技を選んで使う
import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, P, checkInvariants } from './harness.mjs';
import { BOSS } from '../../app/src/lib/engine.js';

/** 魔王 M（参加者が操作）と、敵チーム X・Y・Z を用意する */
function arena(bossKey, foes = ['X', 'Y', 'Z']) {
  const h = harness();
  h.b.start({ players: [P('M', bossKey, 'p'), ...foes.map(n => P(n, 'monk', 'e'))], mode: 'pvp' });
  for (const u of h.b.G.units) { u.maxHp = u.hp = 30; }
  return h;
}

test('[魔王の技] 魔王1 技3: 敵全体に1ダメージ（魔王の体力が半分以下なら+2）', async () => {
  const h = arena('boss1');
  await h.correct('M', '技3');
  for (const n of ['X', 'Y', 'Z']) assert.equal(h.u(n).hp, 29, n);
  const h2 = arena('boss1'); h2.u('M').hp = 10;                      // 半分以下
  await h2.correct('M', '技3');
  assert.equal(h2.u('X').hp, 27);
});
test('[魔王の技] 魔王2: 技3（第1形態）休み／技3（第2形態）吸収／技2（第3形態）全体', async () => {
  let h = arena('boss2');
  await h.correct('M', '技3', 'X');
  assert.equal(h.u('X').restNext || h.u('X').restNow, true);
  h = arena('boss2'); h.u('M').form = 1; h.u('M').hp = 10;
  await h.correct('M', '技3', 'X');
  assert.equal(h.u('X').hp, 29); assert.equal(h.u('M').hp, 11);
  h = arena('boss2'); h.u('M').form = 2;
  await h.correct('M', '技2');
  for (const n of ['X', 'Y', 'Z']) assert.equal(h.u(n).hp, 29, n);
});
test('[魔王の技] 魔王3 技3: 自分にバリア。すでにあるときは使えない。次のダメージを1回防ぐ', async () => {
  const h = arena('boss3');
  await h.correct('M', '技3');
  assert.equal(h.u('M').barrier, 1);
  // バリアがある状態では、技3は選べない（選ぼうとすると処理が取り消される）
  const hp = JSON.stringify(h.b.G.units);
  h.script.push('技3'); h.b.select(h.u('M').id);
  assert.equal(await h.b.correct(), false); h.script.length = 0;
  assert.equal(JSON.stringify(h.b.G.units), hp);
});
test('[魔王の技] 魔王4 技3: 敵2人に毒（別々の2人）', async () => {
  const h = arena('boss4');
  await h.correct('M', '技3', 'X', 'Y');
  assert.equal(h.u('X').poison, 2); assert.equal(h.u('Y').poison, 2); assert.ok(!(h.u('Z').poison > 0));
});
test('[魔王の技] 魔王5 封印: 直前に正解した敵を次の問題休みにする。正解者がいなければ使えない', async () => {
  const h = harness();
  h.b.start({ players: [P('M', 'boss5', 'p'), P('X', 'monk', 'e'), P('Y', 'monk', 'e')], mode: 'pvp' });
  await h.correct('X', '何もしない');                         // X が正解 → 次の問題
  await h.correct('M', '封印');
  assert.equal(h.u('X').restNext || h.u('X').restNow, true);
  const h2 = harness();
  h2.b.start({ players: [P('M', 'boss5', 'p'), P('X', 'monk', 'e')], mode: 'pvp' });
  h2.script.push('封印'); h2.b.select(h2.u('M').id);
  assert.equal(await h2.b.correct(), false); h2.script.length = 0;
});
test('[魔王の技] 魔王6 技3: 敵2人に2ダメージ（難易度の補正がかかる）', async () => {
  const h = arena('boss6');
  await h.correct('M', '技3', 'X', 'Y');
  assert.equal(h.u('X').hp, 28); assert.equal(h.u('Y').hp, 28); assert.equal(h.u('Z').hp, 30);
});
test('[魔王の技] 全魔王の技の一覧（画面の説明）に、新しい技が載っている', () => {
  const all = Object.values(BOSS).flatMap(b => b.skills.map(s => s.n + s.d)).join('|');
  for (const w of ['敵全体に1ダメージ', '次の問題休みにする', '自分にバリア', '敵2人に毒', '封印', '敵2人に2ダメージ']) assert.ok(all.includes(w), w);
});
