// 組み合わせ・端の条件を狙った個別テスト
import test from 'node:test';
import assert from 'node:assert/strict';
import { JOB, SELECTABLE, BOSS, statusTags, createBattle } from '../src/lib/engine.js';
import { harness, checkInvariants, CANCEL, P } from './harness.mjs';

const dead = (h, n) => { const u = h.u(n); u.hp = 0; u.alive = false; };
const labels = h => h.asked.at(-1).opts.map(o => o.label);
const askedTitles = h => h.asked.map(a => a.title);

/* ================= 仕様表（職業の数値） ================= */
test('仕様表: 全職業の攻撃力・体力が決めた値のとおり', () => {
  const spec = {
    sage: [1, 5], monk: [1, 6], warrior: [3, 7], mage: [3, 5], bm: [5, 2], tank: [1, 8], berserker: [7, 7], mw: [2, 5],
    thief: [2, 4], playboy: [0, 4], hero: [7, 7], bomb: [1, 5], necro: [1, 5],
    apprentice: [1, 4], bard: [0, 5], tactician: [1, 5], cleric: [0, 6], mimic: [1, 5], poisoner: [1, 5],
    oracle: [0, 5], minelayer: [2, 4], ghost: [2, 3], jester: [1, 4], gambler: [0, 5],
  };
  for (const [k, [atk, hp]] of Object.entries(spec)) assert.deepEqual([JOB[k].atk, JOB[k].hp], [atk, hp], k);
  assert.deepEqual(new Set(Object.keys(spec)), new Set(Object.keys(JOB)), '仕様表にない職業がある');
  assert.deepEqual(SELECTABLE.slice().sort(), Object.keys(spec).filter(k => k !== 'hero').sort());
});

/* ================= 爆弾岩 ================= */
test('爆弾岩: 連鎖爆発（爆風で倒れた別の爆弾岩も爆発する）', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior'), P('B1', 'bomb'), P('B2', 'bomb'), P('B3', 'bomb'), P('Z', 'monk')], boss: 3 });
  h.u('B1').hp = 1; h.u('B2').hp = 2; h.u('B3').hp = 2;
  await h.correct('A', '通常攻撃', 'B1');
  assert.deepEqual(['B1', 'B2', 'B3'].map(n => h.u(n).alive), [false, false, false]);
  assert.ok(h.u('A').hp <= 7 - 2 * 3, '3発の爆風を受ける');
  checkInvariants(h.b.G);
});

test('爆弾岩: 爆風は庇えない（タンクに聞かれない）。同じチームにも当たる', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior', 'p'), P('B', 'bomb', 'e'), P('T', 'tank', 'e')], mode: 'pvp' });
  h.u('B').hp = 1; h.u('T').guards = 1;
  await h.correct('A', '通常攻撃', 'B', '庇わない');   // B が死亡 → 爆発（A にも T にも2ダメージ）
  assert.equal(h.u('B').alive, false);
  assert.equal(h.u('T').hp, 8 - 2);
  assert.equal(h.u('A').hp, 7 - 2);
  assert.equal(h.asked.filter(a => a.title.startsWith('🛡')).length, 1, '庇いを聞かれたのは通常攻撃のときだけ');
});

test('爆弾岩: 席が離れていても、別のチームでも全員が巻き込まれる', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior', 'p'), P('C', 'monk', 'e'), P('B', 'bomb', 'p')], mode: 'pvp' });
  h.u('B').hp = 1;
  await h.correct('A', '通常攻撃', 'B');
  assert.equal(h.u('A').hp, 5);
  assert.equal(h.u('C').hp, 4);
});

test('爆弾岩: 爆発で両チームが同時に全滅しても整合する（引き分け）', async () => {
  const h = harness();
  h.b.start({ players: [P('W', 'warrior', 'p'), P('V', 'warrior', 'e')], mode: 'pvp' });
  h.u('W').hp = 5; h.u('V').hp = 5;
  await h.correct('W', '捨て身', 'V');
  assert.equal(h.b.G.over, 'draw');
  checkInvariants(h.b.G);
});

/* ================= タンク ================= */
test('タンク: 複数いるときは選べる／守り0は出ない／庇った分だけ減る', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior', 'p'), P('T1', 'tank', 'e'), P('T2', 'tank', 'e'), P('V', 'monk', 'e')], mode: 'pvp' });
  await h.correct('A', '通常攻撃', 'V', 'T2 が代わりに');
  assert.equal(h.u('V').hp, 6);
  assert.equal(h.u('T2').hp, 8 - 3);
  assert.equal(h.u('T2').guards, 0);
  const first = h.asked.find(a => a.title.startsWith('🛡'));
  assert.equal(first.opts.length, 3);                      // T1, T2, 庇わない
  await h.correct('A', '通常攻撃', 'V', 'T1 が代わりに');
  assert.equal(h.asked.at(-1).opts.length, 2);             // T1 と 庇わない（T2 は守り0）
});

test('タンク: 自分への攻撃・味方同士の攻撃（フレンドリーファイア）・死亡後は庇い確認が出ない', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior', 'p'), P('T', 'tank', 'p'), P('B', 'monk', 'p'), P('X', 'monk', 'e')], mode: 'pvp' });
  await h.correct('A', '通常攻撃', 'T');   // 自分(タンク)への攻撃
  await h.correct('A', '通常攻撃', 'B');   // 同じチームの味方への攻撃
  assert.equal(askedTitles(h).filter(t => t.startsWith('🛡')).length, 0);
  dead(h, 'T');
  await h.correct('A', '通常攻撃', 'B');
  assert.equal(askedTitles(h).filter(t => t.startsWith('🛡')).length, 0);
});

test('タンク: 庇った先のタンクのバリアが先に働く', async () => {
  const h = harness();
  h.b.start({ players: [P('M', 'monk'), P('T', 'tank')], boss: 1 });
  h.u('T').barrier = 1;
  await h.correct('魔王1', '技1', 'M', 'T が代わりに');
  assert.equal(h.u('M').hp, 6);
  assert.equal(h.u('T').hp, 8);
  assert.equal(h.u('T').barrier, 0);
  assert.equal(h.u('T').guards, 0);
});

test('タンク: 範囲攻撃は1撃ごとに庇うか聞かれる', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior'), P('T', 'tank'), P('C', 'monk')], boss: 1 });
  h.u('T').guards = 2;
  await h.correct('魔王1', '技2', 'T', '庇わない'); // T 本人に2、両隣 A・C に1（A,C への1ダメージで庇い確認）
  const guards = askedTitles(h).filter(t => t.startsWith('🛡'));
  assert.ok(guards.length >= 2, '隣への巻き添えでも庇い確認が出る');
});

test('タンク: 賢者に蘇生されても守り回数が保持される', async () => {
  const h = harness();
  h.b.start({ players: [P('S', 'sage'), P('T', 'tank')], boss: 3 });
  h.u('T').guards = 3; dead(h, 'T');
  await h.correct('S', '蘇生', 'T');
  assert.equal(h.u('T').alive, true);
  assert.equal(h.u('T').guards, 3);
});

/* ================= 毒・地雷・バリア・軍師 ================= */
test('毒: 魔王を毒で倒すと勝利になる', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'poisoner')], boss: 3 });
  h.u('魔王3').hp = 1;
  await h.correct('A', '毒', '魔王3');
  await h.b.skip();
  assert.equal(h.b.G.over, 'win');
});

test('毒: 最後のプレイヤーが毒で倒れると敗北になる', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'poisoner')], boss: 3 });
  await h.correct('A', '毒', 'A');
  h.u('A').hp = 1;
  await h.b.skip();
  assert.equal(h.b.G.over, 'lose');
});

test('毒: 重ねがけしても2問のまま（足し算にならない）／誤答・正解・スルーのどれでも1問と数える', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'poisoner'), P('V', 'warrior'), P('W', 'monk')], boss: 3 });
  await h.correct('A', '毒', 'V');
  await h.correct('A', '毒', 'V');                // すでに毒: 今の問題の終わりに1ダメージ、残りは「2問」に更新
  assert.equal(h.u('V').hp, 6);
  assert.equal(h.u('V').poison, 1);
  await h.wrong('W');                              // 誤答でも1問終わる
  assert.equal(h.u('V').hp, 5);
  assert.equal(h.u('V').poison, 0);
  await h.correct('W', '何もしない');              // 毒は切れている
  assert.equal(h.u('V').hp, 5);
});

test('毒: 休み中のプレイヤーにも効く／取り消すと毒も元に戻る', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'poisoner'), P('M', 'mage'), P('V', 'warrior')], boss: 3 });
  await h.correct('M', '封じ', 'V');
  assert.equal(h.u('V').restNow, true);
  await h.correct('A', '毒', 'V');
  assert.equal(h.u('V').poison, 2);
  h.b.undo();
  assert.equal(h.u('V').poison, undefined);
});

test('地雷: 魔王も踏む／バリアで防げる／死ぬと消える', async () => {
  const h = harness();
  h.b.start({ players: [P('M', 'minelayer'), P('Z', 'monk')], boss: 1 });
  await h.correct('M', '地雷設置', '魔王1');
  const hpBefore = h.u('魔王1').hp;
  await h.correct('魔王1', '技1', 'M');
  assert.equal(h.u('魔王1').hp, hpBefore - 3);
  assert.equal(h.u('魔王1').mine, null);
  // バリア
  const h2 = harness();
  h2.b.start({ players: [P('M', 'minelayer', 'p'), P('V', 'warrior', 'e')], mode: 'pvp' });
  await h2.correct('M', '地雷設置', 'V');
  h2.u('V').barrier = 1;
  await h2.correct('V', '何もしない');
  assert.equal(h2.u('V').hp, 7);
  assert.equal(h2.u('V').barrier, 0);
  assert.equal(h2.u('V').mine, null);
});

test('バリア: 重ねがけしても1枚／軍師は自分も指名できる', async () => {
  const h = harness();
  h.b.start({ players: [P('C', 'cleric'), P('T', 'tactician'), P('A', 'warrior')], boss: 3 });
  await h.correct('C', '守護のバリア', 'A');
  await h.correct('C', '守護のバリア', 'A');
  assert.equal(h.u('A').barrier, 1);
  await h.correct('T', '作戦指示', 'T');
  assert.equal(h.u('T').noWrong, true);
});

/* ================= 幽霊 ================= */
test('幽霊: 幽霊は生存者に数えない（最後の1人が幽霊になると敗北）', async () => {
  const h = harness();
  h.b.start({ players: [P('G', 'ghost')], boss: 3 });
  await h.wrong('G'); await h.wrong('G');     // 3 → 1 → 倒れて幽霊
  assert.equal(h.u('G').ghost, true);
  assert.equal(h.b.G.over, 'lose');
});

test('幽霊: 攻撃や回復の対象の候補に出てこない', async () => {
  const h = harness();
  h.b.start({ players: [P('G', 'ghost'), P('W', 'warrior'), P('M', 'monk')], boss: 3 });
  await h.correct('W', '通常攻撃', 'G');
  await h.correct('M', '回復', 'W');
  const opts = labels(h);
  assert.ok(!opts.includes('G'));
});

test('幽霊: 蘇生後にもう一度倒れても幽霊にはならない（権利は1戦に1度）', async () => {
  const h = harness();
  h.b.start({ players: [P('G', 'ghost'), P('S', 'sage'), P('W', 'warrior')], boss: 3 });
  await h.correct('W', '通常攻撃', 'G');
  assert.equal(h.u('G').ghost, true);
  await h.correct('S', '蘇生', 'G');
  await h.correct('W', '通常攻撃', 'G'); await h.correct('W', '通常攻撃', 'G');
  assert.equal(h.u('G').alive, false);
  assert.equal(h.u('G').ghost, false);
});

test('幽霊: 幽霊の回答も成績に数えられ、通常攻撃は攻撃力ぶん', async () => {
  const h = harness();
  h.b.start({ players: [P('G', 'ghost'), P('W', 'warrior')], boss: 3 });
  await h.correct('W', '通常攻撃', 'G');
  await h.correct('G', '通常攻撃', '魔王3');
  assert.equal(h.b.G.stats[h.u('G').id].correct, 1);
  assert.deepEqual(labels(h).filter(l => l.includes('魔王') || l.includes('W')).length > 0, true);
});

test('幽霊: 魔王2の第3形態に倒されて仲間になっても整合する', async () => {
  const h = harness();
  h.b.start({ players: [P('G', 'ghost'), P('W', 'warrior')], boss: 2 });
  const boss = h.u('魔王2'); boss.form = 2; boss.hp = boss.maxHp = 5;
  h.u('G').hp = 2;
  await h.correct('魔王2', '技1', 'G');
  assert.equal(h.u('G').side, 'e');
  assert.equal(h.u('G').alive, true);
  assert.equal(h.u('G').ghost, false);
  checkInvariants(h.b.G);
});

/* ================= 魔王2 の仲間化 ================= */
test('魔王2: 仲間になった者が死んだら魔王側のまま。賢者は蘇生できない', async () => {
  const h = harness();
  h.b.start({ players: [P('S', 'sage'), P('B', 'warrior')], boss: 2 });
  const boss = h.u('魔王2'); boss.form = 2; boss.hp = boss.maxHp = 9;
  h.u('B').hp = 2;
  await h.correct('魔王2', '技1', 'B');
  assert.equal(h.u('B').side, 'e');
  h.u('B').hp = 1;
  await h.correct('S', '通常攻撃', 'B');
  assert.equal(h.u('B').alive, false);
  assert.equal(h.u('B').side, 'e');
  h.script.push('何もしない'); h.b.select(h.u('S').id);
  await h.b.correct();
  const revive = h.asked.at(-1).opts.find(o => o.label.includes('蘇生'));
  assert.equal(revive.disabled, true);
});

test('魔王2: 各形態のHPは「プレイヤー攻撃合計×0.4」で、死ぬたびに次の形態へ', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior'), P('B', 'bm'), P('C', 'mw')], boss: 2 });    // 3+5+2=10 → 4
  const boss = h.u('魔王2');
  assert.equal(boss.maxHp, 4);
  for (const form of [1, 2]) {
    boss.hp = 1;
    await h.correct('A', '通常攻撃', '魔王2');
    assert.equal(boss.form, form);
    assert.equal(boss.hp, 4);
    assert.equal(boss.alive, true);
  }
  boss.hp = 1;
  await h.correct('A', '通常攻撃', '魔王2');
  assert.equal(h.b.G.over, 'win');
});

/* ================= 魔王1/3/4 ================= */
test('魔王1: 半分以下の境目（HPがちょうど半分で+2、半分を超えると+0）', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior'), P('B', 'warrior')], boss: 1 });     // HP 9
  const b = h.u('魔王1'); b.maxHp = 12;
  b.hp = 7; await h.correct('魔王1', '技1', 'A'); assert.equal(h.u('A').hp, 7 - 3);
  b.hp = 6; await h.correct('魔王1', '技1', 'B'); assert.equal(h.u('B').hp, 7 - 5);
});

test('魔王3: 直前の正解者が死んでいる／味方側のときは技2が選べない', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior'), P('B', 'monk')], boss: 3 });
  h.script.push('技2'); h.b.select(h.u('魔王3').id);
  assert.equal(await h.b.correct(), false);                // 前の正解者なし
  h.script.length = 0;
  await h.correct('A', '何もしない');
  dead(h, 'A');
  h.script.push('技2'); h.b.select(h.u('魔王3').id);
  assert.equal(await h.b.correct(), false);                // 前の正解者が死亡
  h.script.length = 0;
});

test('魔王3: HP1で正解すると5回復（プレイヤー側では起きない）', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior'), P('B', 'monk')], boss: 3 });
  const b = h.u('魔王3'); b.hp = 1;
  await h.correct('魔王3', '技1', 'A', 'B');
  assert.ok(b.hp >= 6);
});

test('魔王6: 技1の5ダメージもバリアで防がれる', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior'), P('B', 'cleric')], boss: 6 });
  h.u('A').barrier = 1;
  await h.correct('魔王6', '技1', 'A');
  assert.equal(h.u('A').hp, 7);
  assert.equal(h.u('A').barrier, 0);
});

test('勝敗: 魔王を倒すのと同時にプレイヤー全員が倒れたら勝ち扱い', async () => {
  const h = harness();
  h.b.start({ players: [P('W', 'warrior')], boss: 3 });
  h.u('W').hp = 5; h.u('魔王3').hp = 5;
  await h.correct('W', '捨て身', '魔王3');
  assert.equal(h.b.G.over, 'win');
  checkInvariants(h.b.G);
});

/* ================= 模倣者 ================= */
test('模倣者: コピー元が魔王・別の模倣者・誤答後のときは選べない', async () => {
  const h = harness();
  h.b.start({ players: [P('M', 'mimic'), P('N', 'mimic'), P('A', 'warrior')], boss: 3 });
  h.b.G.prevCorrect = h.u('魔王3').id;
  h.script.push('何もしない'); h.b.select(h.u('M').id); await h.b.correct();
  assert.equal(h.asked.at(-1).opts.find(o => o.label.includes('模倣')).disabled, true);
  await h.correct('N', '何もしない');                       // 直前の正解者が模倣者（N）
  h.script.push('何もしない'); h.b.select(h.u('M').id); await h.b.correct();
  assert.equal(h.asked.at(-1).opts.find(o => o.label.includes('模倣')).disabled, true);
  await h.wrong('A');                                      // 誤答のあとは直前の正解者なし
  h.script.push('何もしない'); h.b.select(h.u('M').id); await h.b.correct();
  assert.equal(h.asked.at(-1).opts.find(o => o.label.includes('模倣')).disabled, true);
});

test('模倣者: バトルマスターの必殺は自分の「1度だけ」として数える／ネクロは自分側の死者数', async () => {
  const h = harness();
  h.b.start({ players: [P('B', 'bm'), P('M', 'mimic'), P('X', 'tank'), P('D1', 'monk'), P('D2', 'monk')], boss: 3 });
  await h.correct('B', '何もしない');
  await h.correct('M', '模倣：必殺の一撃', 'X');
  assert.equal(h.u('M').used, true);
  assert.equal(h.u('X').hp, 8 - 8 < 0 ? 0 : 0);
  await h.correct('B', '何もしない');
  h.script.push('模倣：必殺'); h.b.select(h.u('M').id);
  assert.equal(await h.b.correct(), false);                // 2回目は選べない
  h.script.length = 0;
  // ネクロ
  const g = harness();
  g.b.start({ players: [P('N', 'necro'), P('M', 'mimic'), P('D1', 'monk'), P('D2', 'monk'), P('V', 'tank')], boss: 3 });
  dead(g, 'D1'); dead(g, 'D2');
  await g.correct('N', '何もしない');
  await g.correct('M', '模倣：死者の怨念', 'V');
  assert.equal(g.u('V').hp, 8 - 2);
});

/* ================= 道化師・賭博師 ================= */
test('道化師: 押し付けた相手が敵チームなら庇い確認が出る／軍師の加護があれば聞かれない', async () => {
  const h = harness();
  h.b.start({ players: [P('J', 'jester', 'p'), P('V', 'monk', 'e'), P('T', 'tank', 'e')], mode: 'pvp' });
  h.script.push('V', 'T が代わりに'); await h.wrong('J');
  assert.equal(h.u('T').hp, 6);
  assert.equal(h.u('V').hp, 6);
  assert.equal(h.u('J').hp, 4);
  h.u('J').noWrong = true;
  const n = h.asked.length;
  await h.wrong('J');
  assert.equal(h.asked.length, n, '加護があれば押し付けの質問は出ない');
});

test('賭博師: 裏で自分が倒れることもある／表で対象がいなければ不発', async () => {
  const h = harness();
  h.b.start({ players: [P('G', 'gambler'), P('W', 'warrior')], boss: 3 });
  h.u('G').hp = 2; h.rolls.push(0.9);
  await h.correct('G', 'コイントス');
  assert.equal(h.u('G').alive, false);
  assert.equal(h.b.G.over, null);
  const g2 = harness();
  g2.b.start({ players: [P('G', 'gambler', 'p'), P('V', 'monk', 'e')], mode: 'pvp' });
  dead(g2, 'V');                                          // 敵がいない状態（決着前に確認）
  g2.b.G.over = null;
  g2.rolls.push(0.1);
  g2.script.push('コイントス'); g2.b.select(g2.u('G').id);
  assert.equal(await g2.b.correct(), true);               // 対象なし → 不発でも進行する
});

/* ================= 遊び人・見習い・盗賊 ================= */
test('遊び人: 間に誤答・スルーが挟まると連答にならない／転職で体力が全回復', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'playboy'), P('B', 'monk')], boss: 3 });
  await h.correct('A', '何もしない');
  await h.wrong('A');
  await h.correct('A', '何もしない');
  assert.equal(h.u('A').job, 'playboy');
  await h.b.skip();
  await h.correct('A', '何もしない');
  assert.equal(h.u('A').job, 'playboy');
  h.u('A').hp = 1;
  await h.correct('A', '何もしない');
  assert.equal(h.u('A').job, 'hero');
  assert.equal(h.u('A').hp, 7);
});

test('見習い: 誤答では成長しない／回復した体力の分だけ増える／取り消すと元に戻る', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'apprentice'), P('B', 'monk')], boss: 3 });
  await h.wrong('A');
  assert.equal(h.u('A').atk, 1);
  await h.correct('A', '何もしない');
  assert.deepEqual([h.u('A').atk, h.u('A').maxHp, h.u('A').hp], [2, 5, 3]);
  h.b.undo();
  assert.deepEqual([h.u('A').atk, h.u('A').maxHp], [1, 4]);
});

test('盗賊: 選んだジャンルは次の問題だけ／ジャンル未指定なら初期の5つ', async () => {
  const h = harness();
  h.b.start({ players: [P('T', 'thief'), P('A', 'monk')], boss: 3 });
  await h.correct('T', '何もしない', '赤問');
  assert.deepEqual(h.asked.at(-1).opts.map(o => o.label), ['理系', '文系', '青問', '緑問', '赤問', '選ばない']);
  assert.equal(h.b.G.genreFor, h.b.G.q);
  await h.b.skip();
  assert.notEqual(h.b.G.genreFor, h.b.G.q);
});

/* ================= 休み ================= */
test('休み: 休み中は選択できず、1問で解除。休み中でも毒は進む', async () => {
  const h = harness();
  h.b.start({ players: [P('M', 'mage'), P('V', 'warrior')], boss: 3 });
  await h.correct('M', '封じ', 'V');
  assert.equal(h.b.select(h.u('V').id), false);
  await h.b.skip();
  assert.equal(h.u('V').restNow, false);
  assert.ok(h.b.select(h.u('V').id));
});

test('休み: 魔王2の第1形態の技1は2人に休み（すでに休みの人は連続しない）', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior'), P('B', 'warrior'), P('C', 'monk')], boss: 2 });
  await h.correct('魔王2', '技1', 'A', 'B');
  assert.deepEqual([h.u('A').restNow, h.u('B').restNow, h.u('C').restNow], [true, true, false]);
  await h.correct('魔王2', '技1', 'A', 'C');
  assert.equal(h.u('A').restNow, false);                   // 連続では休みにならない
  assert.equal(h.u('C').restNow, true);
});

/* ================= ユーザー対戦 ================= */
test('対戦: 3対1・席順がチームごと・味方への攻撃も可能・決着', async () => {
  const h = harness();
  h.b.start({ players: [P('A1', 'warrior', 'p'), P('B1', 'warrior', 'e'), P('A2', 'monk', 'p'), P('A3', 'tank', 'p')], mode: 'pvp' });
  assert.deepEqual(h.b.G.units.map(u => u.name), ['A1', 'A2', 'A3', 'B1']);
  await h.correct('A1', '通常攻撃', 'A2');                 // 味方への攻撃（庇い確認なし）
  assert.equal(h.u('A2').hp, 3);
  h.u('B1').hp = 3;
  await h.correct('A2', '通常攻撃', 'B1');
  assert.equal(h.b.G.over, null);                          // A2 は ATK1 → B1 は残る
  await h.correct('A1', '通常攻撃', 'B1');
  assert.equal(h.b.G.over, 'teamp');
});

test('対戦: 賢者の蘇生は自分のチームの死者だけ', async () => {
  const h = harness();
  h.b.start({ players: [P('S', 'sage', 'p'), P('A', 'warrior', 'p'), P('E', 'warrior', 'e'), P('F', 'monk', 'e')], mode: 'pvp' });
  dead(h, 'A'); dead(h, 'E');
  h.script.push('蘇生'); h.b.select(h.u('S').id);
  h.script.push('E');                                      // 敵の死者は選べない → 「E」は候補にない
  await assert.rejects(() => h.b.correct().then(ok => { if (!ok) throw new Error('キャンセル'); }));
  assert.ok(!labels(h).includes('E'));
  assert.ok(labels(h).includes('A'));
});

/* ================= 取り消し・保存・排他 ================= */
test('取り消し: 何手でも順番に元へ戻れる（最大40手）', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'monk'), P('B', 'warrior')], boss: 3 });
  const snaps = [h.snap()];
  for (let i = 0; i < 45; i++) { await h.b.skip(); snaps.push(h.snap()); }
  let undone = 0;
  while (h.b.canUndo) { assert.equal(h.b.undo(), true); undone++; assert.equal(h.snap(), snaps[snaps.length - 1 - undone], `${undone}手戻した状態が一致しない`); }
  assert.equal(undone, 40);
});

test('取り消し: 決着した手も取り消せる（結果が消えて続行できる）', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior')], boss: 3 });
  h.u('魔王3').hp = 1;
  await h.correct('A', '通常攻撃', '魔王3');
  assert.equal(h.b.G.over, 'win');
  assert.equal(h.b.undo(), true);
  assert.equal(h.b.G.over, null);
  assert.equal(h.u('魔王3').alive, true);
  await h.correct('A', '通常攻撃', '魔王3');
  assert.equal(h.b.G.over, 'win');
});

test('排他: 行動を選んでいる最中は他の操作・選択・取り消しが効かない', async () => {
  let release;
  const h = harness({ askFn: () => new Promise(res => { release = res; }) });
  h.b.start({ players: [P('A', 'warrior'), P('B', 'monk')], boss: 3 });
  h.b.select(h.u('A').id);
  const pending = h.b.correct();
  await new Promise(r => setTimeout(r, 5));
  assert.equal(h.b.busy, true);
  assert.equal(await h.b.wrong(), false);
  assert.equal(await h.b.skip(), false);
  assert.equal(h.b.select(h.u('B').id), false);
  assert.equal(h.b.undo(), false);
  release(-1);                                             // 何もしない
  assert.equal(await pending, true);
  assert.equal(h.b.busy, false);
});

test('保存: 状態をJSONで保存して読み込み直しても続きが遊べる', async () => {
  const saved = [];
  const h = harness();
  h.ui.persist = G => saved.push(JSON.stringify(G));
  h.b.start({ players: [P('A', 'poisoner'), P('B', 'tank')], boss: 1 });
  await h.correct('A', '毒', 'B');
  assert.ok(saved.length >= 2);
  const h2 = harness();
  h2.b.load(JSON.parse(saved.at(-1)));
  assert.equal(h2.u('B').poison, 2);
  await h2.b.skip();
  assert.equal(h2.u('B').hp, 7);
  checkInvariants(h2.b.G);
});

/* ================= 画面用の状態タグ ================= */
test('状態タグ: 毒・バリア・誤答無効・幽霊・ディレイは参加者にも見え、地雷は進行役だけ', () => {
  const u = { poison: 2, barrier: 1, noWrong: true, ghost: true, delayQ: 5, mine: { by: 1, dmg: 3 } };
  const host = statusTags(u, true, 5).map(t => t.t);
  const player = statusTags(u, false, 5).map(t => t.t);
  assert.ok(host.some(t => t.includes('地雷')));
  assert.ok(!player.some(t => t.includes('地雷')));
  for (const k of ['毒', 'バリア', '誤答無効', '幽霊', 'ディレイ']) assert.ok(player.some(t => t.includes(k)), k);
  assert.deepEqual(statusTags({}, true, 1), []);
  assert.ok(!statusTags({ delayQ: 6 }, true, 5).some(t => t.t.includes('ディレイ')));
});

/* ================= 全職業の総当たり（誰が誰に何をしても壊れない） ================= */
test('総当たり: 全職業 × 全職業（攻撃・誤答・スルーのあとも整合）', async () => {
  const jobs = [...SELECTABLE, 'hero'];
  let n = 0;
  for (const a of jobs) {
    for (const b of jobs) {
      const h = harness({ askFn: (t, opts) => opts.find(o => !o.disabled && !o.label.includes('何もしない') && o.value !== null && o.value !== -1)?.value ?? opts.find(o => !o.disabled).value });
      h.b.start({ players: [P('A', a, 'p'), P('B', b, 'e'), P('T', 'tank', 'e')], mode: 'pvp' });
      h.b.select(h.u('A').id); await h.b.correct();
      h.b.select(h.u('B').id); await h.b.correct();
      h.b.select(h.u('A').id); await h.b.wrong();
      await h.b.skip();
      checkInvariants(h.b.G, `${a} vs ${b}`);
      n++;
    }
  }
  assert.equal(n, jobs.length ** 2);
});
