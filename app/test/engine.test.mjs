import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, CANCEL, JOB } from '../src/lib/engine.js';

/** 台本式の ask: 文字列=ラベルに含まれる選択肢を選ぶ / 関数=自由に / CANCEL=キャンセル */
function harness() {
  const script = [];
  const asked = [];
  const ui = {
    async ask(title, opts) {
      asked.push({ title, opts });
      const s = script.shift();
      if (s === undefined) throw new Error('想定外の質問: ' + title + ' / ' + opts.map(o => o.label).join('|'));
      if (s === CANCEL) throw CANCEL;
      if (typeof s === 'function') return s(opts);
      const o = opts.find(x => x.label.includes(s));
      if (!o) throw new Error(`選択肢「${s}」がありません: ${opts.map(x => x.label).join(' | ')}`);
      if (o.disabled) throw new Error(`選択肢「${s}」は無効です`);
      return o.value;
    },
    toast() {}, changed() {}, persist() {},
  };
  const b = createBattle(ui);
  const u = name => b.G.units.find(x => x.name === name);
  /** name が正解して、台本どおりに選ぶ */
  const correct = async (name, ...answers) => {
    script.push(...answers);
    assert.ok(b.select(u(name).id), `${name} を選択できない`);
    const ok = await b.correct();
    assert.equal(script.length, 0, '台本が余っている: ' + script.join(','));
    return ok;
  };
  const wrong = async name => { b.select(u(name).id); return b.wrong(); };
  return { b, u, script, asked, correct, wrong, ui };
}
const P = (name, job, team = 'p') => ({ name, job, team });

test('CPU戦: 魔王HPは攻撃合計×倍率（魔王1=×1.05）', () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior'), P('B', 'monk')], mode: 'cpu', boss: 1 }); // 3+1=4 → 4.2 → 5
  assert.equal(h.u('魔王1').maxHp, 5);
  assert.equal(h.b.G.units.length, 3);
});

test('通常攻撃: 1人に攻撃力ぶん', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior'), P('B', 'tank')], boss: 3 });
  await h.correct('A', '通常攻撃', 'B', /*タンクは味方への攻撃ではないので庇い無し*/);
  assert.equal(h.u('B').hp, 8 - 3);
  assert.equal(h.b.G.q, 2);
});

test('戦士: 自身と他1人に5ダメージ（自滅も可）', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior'), P('B', 'monk')], boss: 3 });
  await h.correct('A', '捨て身', 'B');
  assert.equal(h.u('A').hp, 2);
  assert.equal(h.u('B').hp, 1);
});

test('僧侶: 3回復（最大HPを超えない）', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'monk'), P('B', 'warrior')], boss: 3 });
  h.u('B').hp = 5;
  await h.correct('A', '回復', 'B');
  assert.equal(h.u('B').hp, 7);
});

test('賢者: 死者を体力1で蘇生', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'sage'), P('B', 'warrior')], boss: 3 });
  h.u('B').hp = 0; h.u('B').alive = false;
  await h.correct('A', '蘇生', 'B');
  assert.equal(h.u('B').alive, true);
  assert.equal(h.u('B').hp, 1);
});

test('賢者: 死者がいないと蘇生は選べない', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'sage'), P('B', 'warrior')], boss: 3 });
  h.script.push('蘇生');
  h.b.select(h.u('A').id);
  const ok = await h.b.correct(); // 蘇生は disabled なので台本がエラーを投げ、取り消される
  assert.equal(ok, false);
  assert.equal(h.b.G.q, 1);
  h.script.length = 0;
});

test('魔法使い: 1ダメージ＋次の問題休み。休みは連続しない', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'mage'), P('B', 'warrior')], boss: 3 });
  await h.correct('A', '封じ', 'B');
  assert.equal(h.u('B').hp, 6);
  assert.equal(h.u('B').restNow, true);          // 次の問題(第2問)は休み
  assert.equal(h.b.select(h.u('B').id), false);  // 押せない
  await h.correct('A', '封じ', 'B');             // 休み中の相手には重ねがけしても連続休みにならない
  assert.equal(h.u('B').restNow, false);         // 第3問は休みではない
  assert.equal(h.u('B').hp, 5);
});

test('バトルマスター: 8ダメージは1度だけ', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'bm'), P('B', 'tank')], boss: 3 });
  await h.correct('A', '必殺', 'B');
  assert.equal(h.u('B').hp, 0);
  h.script.push('必殺');
  h.b.select(h.u('A').id);
  assert.equal(await h.b.correct(), false);      // 2回目は無効
  h.script.length = 0;
});

test('勇者: 自身を3回復し他1人に4ダメージ', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'playboy'), P('B', 'tank')], boss: 3 });
  // 連答で勇者に転職してから使う
  await h.correct('A', '何もしない');
  await h.correct('A', '何もしない');
  assert.equal(h.u('A').job, 'hero');
  assert.equal(h.u('A').hp, 7); assert.equal(h.u('A').maxHp, 7);
  h.u('A').hp = 2;
  await h.correct('A', '勇者の剣', 'B');
  assert.equal(h.u('A').hp, 5);
  assert.equal(h.u('B').hp, 4);
});

test('遊び人: 連答でなければ転職しない', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'playboy'), P('B', 'monk')], boss: 3 });
  await h.correct('A', '何もしない');
  await h.correct('B', '何もしない');
  await h.correct('A', '何もしない');
  assert.equal(h.u('A').job, 'playboy');
});

test('魔法戦士: 通常攻撃が敵全体', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'mw'), P('B', 'monk', 'p'), P('C', 'warrior', 'e'), P('D', 'tank', 'e')], mode: 'pvp' });
  // 敵全体への攻撃 → 敵チームのタンク D が C を庇うか聞かれる
  await h.correct('A', '通常攻撃', '庇わない');
  assert.equal(h.u('C').hp, 5);
  assert.equal(h.u('D').hp, 6);
  assert.equal(h.u('B').hp, 6);
  assert.equal(h.u('D').guards, 1);
});

test('ネクロマンサー: 死んでいる仲間の人数×1', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'necro'), P('B', 'monk'), P('C', 'warrior'), P('D', 'tank')], boss: 3 });
  h.u('B').alive = false; h.u('B').hp = 0; h.u('C').alive = false; h.u('C').hp = 0;
  await h.correct('A', '死者の怨念', 'D');
  assert.equal(h.u('D').hp, 6);
});

test('盗賊: 正解でジャンルを選べる', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'thief'), P('B', 'monk')], boss: 3 });
  await h.correct('A', '何もしない', '青問');
  assert.equal(h.b.G.genre, '青問');
  assert.equal(h.b.G.genreFor, 2);
});

test('バーサーカーのディレイ設定が定義されている', () => {
  assert.ok(JOB.berserker.d.includes('ディレイ'));
});

test('誤答: 役職に関係なく2ダメージ。魔王は設定で免除', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'tank'), P('B', 'monk')], boss: 3, bossPenalty: false });
  await h.wrong('A');
  assert.equal(h.u('A').hp, 6);
  await h.wrong('魔王3');
  assert.equal(h.u('魔王3').hp, h.u('魔王3').maxHp);
  const h2 = harness();
  h2.b.start({ players: [P('A', 'tank'), P('B', 'monk')], boss: 3, bossPenalty: true });
  await h2.wrong('魔王3');
  assert.equal(h2.u('魔王3').hp, h2.u('魔王3').maxHp - 2);
});

test('タンク: 味方への敵の攻撃を庇う。守り回数が減り、正解で増える', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'monk'), P('T', 'tank')], boss: 1 });
  await h.correct('魔王1', '技1', 'A' /*対象*/, 'T が代わりに');
  assert.equal(h.u('A').hp, 6);
  assert.equal(h.u('T').hp, 8 - 3);
  assert.equal(h.u('T').guards, 0);
  await h.correct('T', '何もしない');
  assert.equal(h.u('T').guards, 1);
});

test('タンク: 庇わない選択も可能', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'monk'), P('T', 'tank')], boss: 1 });
  await h.correct('魔王1', '技1', 'A', '庇わない');
  assert.equal(h.u('A').hp, 3);
  assert.equal(h.u('T').guards, 1);
});

test('タンク: 自分が範囲攻撃で死ぬ場合も庇える（守り回数は死んでも継続）', async () => {
  const h = harness();
  // 席順 A, T。魔王1の技2は A に2、両隣(T)に1。T が A を庇うと T は 2+1 を受けて死ぬ
  h.b.start({ players: [P('A', 'monk'), P('T', 'tank')], boss: 1 });
  h.u('T').hp = 3;
  await h.correct('魔王1', '技2', 'A', 'T が代わりに');
  assert.equal(h.u('A').hp, 6);
  assert.equal(h.u('T').alive, false);
  assert.equal(h.u('T').guards, 0);
});

test('タンク: 死んでも守り回数は保持される', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'monk'), P('T', 'tank')], boss: 1 });
  h.u('T').alive = false; h.u('T').hp = 0; h.u('T').guards = 2;
  await h.correct('A', '何もしない');
  assert.equal(h.u('T').guards, 2);
});

test('ばくだんいわ: 死ぬと自分以外の全員（敵も味方も）に2ダメージ', async () => {
  const h = harness();
  h.b.start({ players: [P('L', 'warrior'), P('B', 'bomb'), P('R', 'monk')], boss: 1 });
  h.u('B').hp = 1;
  const boss = h.u('魔王1').hp;
  await h.correct('L', '通常攻撃', 'B');
  assert.equal(h.u('B').alive, false);
  assert.equal(h.u('L').hp, 7 - 2);
  assert.equal(h.u('R').hp, 6 - 2);
  assert.equal(h.u('魔王1').hp, boss - 2);
});

test('魔王1: 残りHP半分以下で与ダメージ+2', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior'), P('B', 'warrior')], boss: 1 });
  h.u('魔王1').maxHp = 9; h.u('魔王1').hp = 4;      // 半分以下（9の半分は4.5）
  await h.correct('魔王1', '技1', 'A');
  assert.equal(h.u('A').hp, 7 - 5);
});

test('魔王1: 技2 は指定1人に2、両隣に1', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior'), P('B', 'warrior'), P('C', 'warrior')], boss: 1 });
  await h.correct('魔王1', '技2', 'B');
  assert.deepEqual([h.u('A').hp, h.u('B').hp, h.u('C').hp], [6, 5, 6]);
});

test('魔王2: 形態変化と、第3形態の仲間化・全体1ダメージ・スルー回復', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior'), P('B', 'warrior'), P('C', 'monk')], boss: 2 });
  const boss = h.u('魔王2');
  assert.equal(boss.form, 0);
  boss.hp = 1;
  await h.correct('A', '通常攻撃', '魔王2');
  assert.equal(boss.form, 1);
  assert.equal(boss.alive, true);
  boss.hp = 1;
  await h.correct('A', '通常攻撃', '魔王2');
  assert.equal(boss.form, 2);
  boss.hp = 2;
  await h.b.skip();
  assert.equal(boss.hp, 3); // スルーで1回復
  // 第3形態が B を倒す → B は魔王側の仲間として体力1で復活し、残りの敵全体に1ダメージ
  h.u('B').hp = 2;
  await h.correct('魔王2', '技1', 'B');
  assert.equal(h.u('B').side, 'e');
  assert.equal(h.u('B').hp, 1);
  assert.equal(h.u('B').alive, true);
  assert.equal(h.u('A').hp, 6);
  assert.equal(h.u('C').hp, 5);
});

test('魔王2: 第1形態の技1 は2人に1ダメージ＋休み', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior'), P('B', 'warrior'), P('C', 'monk')], boss: 2 });
  await h.correct('魔王2', '技1', 'A', 'B');
  assert.equal(h.u('A').restNow, true);
  assert.equal(h.u('B').restNow, true);
  assert.equal(h.u('C').restNow, false);
});

test('魔王3: 技1は与ダメの半分（切り上げ）回復、技2は直前の正解者、HP1で正解すると5回復', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior'), P('B', 'warrior')], boss: 3 });
  const boss = h.u('魔王3');
  boss.hp = 3;
  await h.correct('魔王3', '技1', 'A', 'B');
  assert.equal(boss.hp, 4);
  await h.correct('A', '何もしない');
  await h.correct('魔王3', '技2');
  assert.equal(h.u('A').hp, 7 - 1 - 4);
  boss.hp = 1;
  await h.correct('魔王3', '技1', 'A', 'B');
  assert.equal(boss.hp, Math.min(boss.maxHp, 1 + 5 + 1));
});

test('魔王4: 技1は毒（2問のまま）、技2は敵全体に1', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior'), P('B', 'monk'), P('C', 'bard'), P('D', 'mage')], boss: 4 });
  await h.correct('魔王4', '技1', 'A');
  assert.equal(h.u('A').poison, 2);
  await h.correct('魔王4', '技1', 'A');
  assert.equal(h.u('A').poison, 1);   // 重ねがけは2にリセット。その問題の終わりで1つ進む
  const hpB = h.u('B').hp;
  await h.correct('魔王4', '技2');
  assert.ok(hpB - h.u('B').hp >= 1);
});

test('魔王5: 直前の正解者の技をコピーし、反射で2ダメージ', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'monk'), P('B', 'warrior')], boss: 5 });
  await h.correct('A', '回復', 'A');
  await h.correct('魔王5', '模倣：回復', '魔王5');
  h.b.G.prevCorrect = h.u('B').id;
  const hp = h.u('B').hp;
  await h.correct('魔王5', '反射');
  assert.equal(h.u('B').hp, hp - 2);
});

test('魔王6: 技1は5ダメージ、技2は敵全体2＋自分1（体力1なら反動なし）', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior'), P('B', 'monk')], boss: 6 });
  await h.correct('魔王6', '技1', 'A');
  assert.equal(h.u('A').hp, 2);
  const bhp = h.u('魔王6').hp;
  await h.correct('魔王6', '技2');
  assert.equal(h.u('B').hp, 4);
  assert.equal(h.u('魔王6').hp, bhp - 1);
  h.u('魔王6').hp = 1;
  await h.correct('魔王6', '技2');
  assert.equal(h.u('魔王6').hp, 1);
});

test('勝敗: 魔王撃破で勝ち／全滅で負け', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior')], boss: 3 });
  h.u('魔王3').hp = 1;
  await h.correct('A', '通常攻撃', '魔王3');
  assert.equal(h.b.G.over, 'win');
  const h2 = harness();
  h2.b.start({ players: [P('A', 'bm')], boss: 3 });
  await h2.wrong('A');
  assert.equal(h2.b.G.over, 'lose');
});

test('ユーザー対戦: 片方が全滅したら決着。両隣はチーム内', async () => {
  const h = harness();
  h.b.start({ players: [P('A1', 'warrior', 'p'), P('A2', 'warrior', 'p'), P('B1', 'monk', 'e')], mode: 'pvp' });
  h.u('B1').hp = 1;
  await h.correct('A1', '通常攻撃', 'B1');
  assert.equal(h.b.G.over, 'teamp');
});

test('取り消し: undo で状態が戻る／ask のキャンセルで処理全体が戻る', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior'), P('B', 'monk')], boss: 3 });
  await h.correct('A', '通常攻撃', 'B');
  assert.equal(h.u('B').hp, 3);
  assert.equal(h.b.canUndo, true);
  h.b.undo();
  assert.equal(h.u('B').hp, 6);
  assert.equal(h.b.G.q, 1);
  // キャンセル
  h.script.push('通常攻撃', CANCEL);
  h.b.select(h.u('A').id);
  assert.equal(await h.b.correct(), false);
  assert.equal(h.u('B').hp, 6);
  assert.equal(h.b.G.q, 1);
  assert.equal(h.b.canUndo, false);
});

test('スルー: 誰も答えない', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior')], boss: 3 });
  await h.b.skip();
  assert.equal(h.b.G.q, 2);
  assert.equal(h.b.G.prevCorrect, null);
});

test('死者・休み中は選択できない／結果が決まったら操作不可', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior')], boss: 3 });
  h.u('A').alive = false;
  assert.equal(h.b.select(h.u('A').id), false);
  h.b.G.over = 'win';
  assert.equal(await h.b.skip(), false);
});

test('集計: 正解数と誤答数が記録される（取り消すと元に戻る）', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior'), P('B', 'monk')], boss: 3 });
  await h.correct('A', '何もしない');
  await h.wrong('A');
  await h.correct('B', '何もしない');
  const st = h.b.G.stats;
  assert.deepEqual(st[h.u('A').id], { correct: 1, wrong: 1 });
  assert.deepEqual(st[h.u('B').id], { correct: 1, wrong: 0 });
  h.b.undo();
  assert.equal(h.b.G.stats[h.u('B').id], undefined);
});
