import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, CANCEL, JOB, SELECTABLE, statusTags } from '../../app/src/lib/engine.js';

/** 台本式の ask: 文字列=ラベルに含まれる選択肢を選ぶ / CANCEL=キャンセル。rolls=コイン等の乱数 */
function harness() {
  const script = [];
  const rolls = [];
  const asked = [];
  const ui = {
    async ask(title, opts) {
      asked.push({ title, opts });
      const s = script.shift();
      if (s === undefined) throw new Error('想定外の質問: ' + title + ' / ' + opts.map(o => o.label).join('|'));
      if (s === CANCEL) throw CANCEL;
      const o = opts.find(x => x.label.includes(s));
      if (!o) throw new Error(`選択肢「${s}」がありません: ${opts.map(x => x.label).join(' | ')}`);
      if (o.disabled) throw new Error(`選択肢「${s}」は無効です`);
      return o.value;
    },
    random: () => (rolls.length ? rolls.shift() : 0.9),
    toast() {}, changed() {}, persist() {},
  };
  const b = createBattle(ui);
  const u = name => b.G.units.find(x => x.name === name);
  const correct = async (name, ...answers) => {
    script.push(...answers);
    assert.ok(b.select(u(name).id), `${name} を選択できない`);
    const ok = await b.correct();
    assert.equal(script.length, 0, '台本が余っている: ' + script.join(','));
    return ok;
  };
  const wrong = async name => { b.select(u(name).id); return b.wrong(); };
  return { b, u, script, rolls, asked, correct, wrong };
}
const P = (name, job, team = 'p') => ({ name, job, team });

test('全職業にアイコン用のキーと説明がある／選べる職業に勇者は含まれない', () => {
  for (const k of SELECTABLE) { assert.ok(JOB[k], k); assert.ok(JOB[k].d.length > 5, k); }
  assert.ok(!SELECTABLE.includes('hero'));
  assert.equal(SELECTABLE.length, 25);
});

test('タンクのHPは8', () => { assert.equal(JOB.tank.hp, 8); });

test('見習い: 正解するたびに攻撃+1・最大体力+1（攻撃は最大5）', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'apprentice'), P('B', 'monk')], boss: 3 });
  await h.correct('A', '何もしない');
  assert.deepEqual([h.u('A').atk, h.u('A').maxHp, h.u('A').hp], [2, 5, 5]);
  for (let i = 0; i < 6; i++) await h.correct('A', '何もしない');
  assert.equal(h.u('A').atk, 5);
});

test('吟遊詩人: 味方全員を1回復（敵は回復しない）', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'bard', 'p'), P('B', 'warrior', 'p'), P('C', 'warrior', 'e')], mode: 'pvp' });
  h.u('A').hp = 2; h.u('B').hp = 3; h.u('C').hp = 3;
  await h.correct('A', '癒しの歌');
  assert.deepEqual([h.u('A').hp, h.u('B').hp, h.u('C').hp], [3, 4, 3]);
});

test('軍師: 指名した味方の次の誤答ダメージを1回だけ無効にする', async () => {
  const h = harness();
  h.b.start({ players: [P('T', 'tactician'), P('A', 'warrior')], boss: 3 });
  await h.correct('T', '作戦指示', 'A');
  await h.wrong('A');
  assert.equal(h.u('A').hp, 7);
  await h.wrong('A');
  assert.equal(h.u('A').hp, 5);
});

test('守護神官: バリアが次のダメージ1回を無効にする', async () => {
  const h = harness();
  h.b.start({ players: [P('C', 'cleric'), P('A', 'warrior')], boss: 1 });
  await h.correct('C', '守護のバリア', 'A');
  assert.equal(h.u('A').barrier, 1);
  await h.correct('魔王1', '技1', 'A');
  assert.equal(h.u('A').hp, 7);
  assert.equal(h.u('A').barrier, 0);
  await h.correct('魔王1', '技1', 'A');
  assert.equal(h.u('A').hp, 4);
});

test('模倣者: 直前に正解した人の能力をコピーできる／コピー元がないと選べない', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'monk'), P('M', 'mimic'), P('V', 'warrior')], boss: 3 });
  h.script.push('模倣'); h.b.select(h.u('M').id);
  assert.equal(await h.b.correct(), false);          // コピー元なし → 無効な選択肢
  h.script.length = 0;
  await h.correct('A', '何もしない');
  h.u('V').hp = 2;
  await h.correct('M', '模倣：回復', 'V');
  assert.equal(h.u('V').hp, 5);
});

test('模倣者: 直前の正解者が盗賊ならジャンルを選べる', async () => {
  const h = harness();
  h.b.start({ players: [P('T', 'thief'), P('M', 'mimic')], boss: 3 });
  await h.correct('T', '何もしない', '選ばない');
  await h.correct('M', '模倣：ジャンル', '緑問');
  assert.equal(h.b.G.genre, '緑問');
});

test('毒使い: 付けた問題の次から2問、終わるたびに1ダメージ', async () => {
  const h = harness();
  h.b.start({ players: [P('P', 'poisoner'), P('V', 'warrior')], boss: 3 });
  await h.correct('P', '毒', 'V');
  assert.equal(h.u('V').hp, 7);                      // 付けた問題の終わりは数えない
  await h.b.skip(); assert.equal(h.u('V').hp, 6);
  await h.b.skip(); assert.equal(h.u('V').hp, 5);
  await h.b.skip(); assert.equal(h.u('V').hp, 5);    // 2回で終わり
  assert.equal(h.u('V').poison, 0);
});

test('毒: 毒で倒れても連鎖処理が走る（爆弾岩が隣にいると爆発）', async () => {
  const h = harness();
  h.b.start({ players: [P('P', 'poisoner'), P('B', 'bomb'), P('N', 'monk')], boss: 3 });
  await h.correct('P', '毒', 'B');
  h.u('B').hp = 1;
  await h.b.skip();
  assert.equal(h.u('B').alive, false);
  assert.equal(h.u('P').hp, 5 - 2);
});

test('預言者: 敵1人の次の問題だけディレイがつく', async () => {
  const h = harness();
  h.b.start({ players: [P('O', 'oracle'), P('A', 'warrior', 'p'), P('B', 'warrior', 'e')], mode: 'pvp' });
  await h.correct('O', '予言のディレイ', 'B');
  assert.equal(h.u('B').delayQ, h.b.G.q);            // 次の問題＝今の問題番号
  assert.deepEqual(statusTags(h.u('B'), false, h.b.G.q).map(t => t.t), ['⏱ ディレイ中']);
  await h.b.skip();
  assert.notEqual(h.u('B').delayQ, h.b.G.q);
  assert.deepEqual(statusTags(h.u('B'), false, h.b.G.q).map(t => t.t), []);
});

test('地雷屋: 設置された人が次に正解したとき3ダメージ（本人は行動できる）', async () => {
  const h = harness();
  h.b.start({ players: [P('M', 'minelayer', 'p'), P('V', 'warrior', 'e')], mode: 'pvp' });
  await h.correct('M', '地雷設置', 'V');
  assert.ok(h.u('V').mine);
  assert.equal(statusTags(h.u('V'), false).some(t => t.t.includes('地雷')), false); // 参加者には見えない
  assert.equal(statusTags(h.u('V'), true).some(t => t.t.includes('地雷')), true);
  await h.correct('V', '何もしない');
  assert.equal(h.u('V').hp, 4);
  assert.equal(h.u('V').mine, null);
});

test('地雷屋: 地雷で死んだら行動なしで問題が進む', async () => {
  const h = harness();
  h.b.start({ players: [P('M', 'minelayer', 'p'), P('V', 'warrior', 'e')], mode: 'pvp' });
  await h.correct('M', '地雷設置', 'V');
  h.u('V').hp = 2;
  await h.correct('V');                              // 行動の質問は出ない
  assert.equal(h.u('V').alive, false);
  assert.equal(h.b.G.over, 'teamp');
});

test('幽霊: 死んだあと1回だけ通常攻撃で答えられる', async () => {
  const h = harness();
  h.b.start({ players: [P('G', 'ghost'), P('W', 'warrior')], boss: 3 });
  await h.correct('W', '通常攻撃', 'G');             // G(HP3) が倒れて幽霊になる
  assert.equal(h.u('G').alive, false);
  assert.equal(h.u('G').ghost, true);
  assert.ok(h.b.select(h.u('G').id));
  h.script.push('通常攻撃', '魔王3');                 // 幽霊は通常攻撃しか選べない
  assert.equal(await h.b.correct(), true);
  assert.equal(h.u('魔王3').hp, h.u('魔王3').maxHp - 2);
  assert.equal(h.u('G').ghost, false);
  assert.equal(h.b.select(h.u('G').id), false);      // もう答えられない
});

test('幽霊: 誤答してもダメージなし（成仏する）', async () => {
  const h = harness();
  h.b.start({ players: [P('G', 'ghost'), P('W', 'warrior')], boss: 3 });
  await h.correct('W', '通常攻撃', 'G');
  await h.wrong('G');
  assert.equal(h.u('G').ghost, false);
  assert.equal(h.b.G.over, null);
});

test('幽霊: 賢者に蘇生されたら幽霊は消える', async () => {
  const h = harness();
  h.b.start({ players: [P('G', 'ghost'), P('S', 'sage'), P('W', 'warrior')], boss: 3 });
  await h.correct('W', '通常攻撃', 'G');
  await h.correct('S', '蘇生', 'G');
  assert.equal(h.u('G').alive, true);
  assert.equal(h.u('G').ghost, false);
});

test('道化師: 誤答の2ダメージを他の1人に押し付けられる／自分で受けることも可', async () => {
  const h = harness();
  h.b.start({ players: [P('J', 'jester'), P('V', 'warrior')], boss: 3 });
  h.script.push('V'); await h.wrong('J');
  assert.equal(h.u('J').hp, 4); assert.equal(h.u('V').hp, 5);
  h.script.push('自分で受ける'); await h.wrong('J');
  assert.equal(h.u('J').hp, 2);
});

test('賭博師: 表なら敵に5ダメージ、裏なら自分が2ダメージ', async () => {
  const h = harness();
  h.b.start({ players: [P('G', 'gambler'), P('W', 'warrior')], boss: 3 });
  h.u('魔王3').hp = h.u('魔王3').maxHp = 30;          // 魔王の体力の倍率に左右されないように
  h.rolls.push(0.1);
  await h.correct('G', 'コイントス', '魔王3');
  assert.equal(h.u('魔王3').hp, h.u('魔王3').maxHp - 5);
  h.rolls.push(0.9);
  await h.correct('G', 'コイントス');
  assert.equal(h.u('G').hp, 3);
});

test('盗賊: 進行役が決めたジャンル一覧から選べる', async () => {
  const h = harness();
  h.b.start({ players: [P('T', 'thief'), P('A', 'monk')], boss: 3, genres: ['歴史', '地理'] });
  await h.correct('T', '何もしない', '地理');
  assert.equal(h.b.G.genre, '地理');
  assert.deepEqual(h.asked.at(-1).opts.map(o => o.label), ['歴史', '地理', '選ばない']);
});

test('バリアは誤答ダメージも防ぐ。死ぬとバリア・毒・地雷は消える', async () => {
  const h = harness();
  h.b.start({ players: [P('C', 'cleric'), P('A', 'warrior')], boss: 3 });
  await h.correct('C', '守護のバリア', 'A');
  await h.wrong('A');
  assert.equal(h.u('A').hp, 7);
  h.u('A').poison = 2; h.u('A').mine = { by: 1, dmg: 3 }; h.u('A').hp = 1; h.u('A').barrier = 0;
  await h.wrong('A');
  assert.equal(h.u('A').alive, false);
  assert.equal(h.u('A').poison, 0);
  assert.equal(h.u('A').mine, null);
});
