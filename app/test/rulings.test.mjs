// 裁定（ルール画面の文章）が、実際のエンジンの動きと合っているかを確かめる。文章を変えたら、ここも見直す
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, ITEMS } from '../src/lib/engine.js';
import { RULINGS } from '../src/lib/rulings.js';
import { rng } from './harness.mjs';

/** 台本つきの対戦場: script は行動メニューの選択、pick は対象選択（質問文に含まれる言葉 → 選ぶ名前） */
function arena(units, { script = [0], pick = {}, mode = 'pvp', start = {} } = {}) {
  const sc = [...script], asks = [];
  const b = createBattle({
    ask: async (t, o) => {
      asks.push({ t, o });
      const ok = o.filter(x => !x.disabled && x.value !== '__back__');
      if (t.endsWith('の行動')) return sc.length ? sc.shift() : -1;
      if (t.startsWith('🛡')) return ok.find(x => x.cls === 'ghost').value;
      const want = Object.entries(pick).find(([k]) => t.includes(k))?.[1];
      return (want && ok.find(x => x.label === want)?.value) ?? ok[0].value;
    },
    toast() {}, changed() {}, random: rng(4),
  });
  b.start({ players: units.map(u => ({ team: 'p', ...u })), mode, ...start });
  const by = n => b.G.units.find(u => u.name === n);
  return {
    b, by, asks,
    go: async name => { b.select(by(name).id); return b.correct(); },
    wrong: async name => { b.select(by(name).id); return b.wrong(); },
  };
}
const J = (name, job, team = 'p') => ({ name, job, team });

test('[裁定] バリアは自分で受けるダメージ（捨て身の一撃）も1回防ぐ。重ねがけは1回分のまま', async () => {
  const a = arena([J('A', 'warrior'), J('B', 'monk', 'e')], { script: [1], pick: { 'もう1人': 'B' } });
  a.by('A').barrier = 1;
  await a.go('A');
  assert.equal(a.by('A').barrier, 0);
  assert.equal(a.by('A').hp, a.by('A').maxHp, '自分への5ダメージは防がれた');
  const c = arena([J('A', 'cleric'), J('B', 'monk')], { script: [1], pick: { '守る': 'B' } });
  c.by('B').barrier = 1;
  await c.go('A');
  assert.equal(c.by('B').barrier, 1);
});
test('[裁定] 毒: 付けた問題の終わりは数えず次の2問。倒れたら消える', async () => {
  const a = arena([J('A', 'poisoner'), J('B', 'monk', 'e')], { script: [1], pick: { '対象': 'B' } });
  const m = a.by('B').maxHp;
  await a.go('A');
  assert.equal(a.by('B').poison, 2);
  assert.equal(a.by('B').hp, m, '付けた問題の終わりはダメージなし');
  await a.b.skip(); assert.equal(a.by('B').hp, m - 1);
  await a.b.skip(); assert.equal(a.by('B').hp, m - 2); assert.equal(a.by('B').poison, 0);
});
test('[裁定] 地雷: 正解したあと行動の前に踏む。誤答では踏まない', async () => {
  const a = arena([J('A', 'minelayer'), J('B', 'monk', 'e')], { script: [1, -1], pick: { '対象': 'B' } });
  await a.go('A');
  assert.ok(a.by('B').mine);
  await a.wrong('B');
  assert.ok(a.by('B').mine, '誤答では踏まない');
  const before = a.by('B').hp;
  await a.go('B');
  assert.ok(!a.by('B').mine);
  assert.ok(a.by('B').hp < before);
});
test('[裁定] 休み: 次の問題の1問だけ', async () => {
  const a = arena([J('A', 'mage'), J('B', 'monk', 'e')], { script: [1], pick: { '対象': 'B' } });
  await a.go('A');
  assert.equal(a.by('B').restNow, true);
  await a.b.skip();
  assert.equal(a.by('B').restNow, false);
});
test('[裁定] 魔法使い: 1ダメージで倒れたら休みにならない', async () => {
  const a = arena([J('A', 'mage'), J('B', 'monk', 'e'), J('C', 'warrior', 'e')], { script: [1], pick: { '対象': 'B' } });
  a.by('B').hp = 1;
  await a.go('A');
  assert.equal(a.by('B').alive, false);
  assert.ok(!a.by('B').restNext && !a.by('B').restNow);
});
test('[裁定] 幽霊: 通常攻撃だけで答えられ、アイテムは使える。答えたら成仏する', async () => {
  const a = arena([J('G', 'ghost'), J('B', 'warrior', 'e')], { script: [0] });
  const g = a.by('G');
  g.hp = 0; g.alive = false; g.ghost = true; g.ghostUsed = true; g.items = ['bandage'];
  assert.ok(await a.go('G'));
  const menu = a.asks.find(x => x.t.endsWith('の行動')).o;
  assert.ok(menu.some(o => o.cls === 'item'), '幽霊でもアイテムは並ぶ');
  assert.equal(menu.filter(o => o.cls !== 'item' && o.cls !== 'ghost').length, 1, '行動は通常攻撃だけ');
  assert.equal(a.by('G').ghost, false, '成仏した');
});
test('[裁定] 勇者への転職: 連続2問の正解で、体力は勇者の基本値（7）。倍率は適用されない', async () => {
  const a = arena([J('P', 'playboy'), J('B', 'monk', 'e')], { script: [-1, -1], start: { hpScale: 3 } });
  await a.go('P');
  assert.equal(a.by('P').job, 'playboy');
  await a.go('P');
  assert.equal(a.by('P').job, 'hero');
  assert.equal(a.by('P').maxHp, 7);
});
test('[裁定] 連答は、間に誰も正解しない問題が入ると途切れる', async () => {
  const a = arena([J('P', 'playboy'), J('B', 'monk', 'e')], { script: [-1, -1] });
  await a.go('P'); await a.b.skip(); await a.go('P');
  assert.equal(a.by('P').job, 'playboy');
});
test('[裁定] 最後の敵を倒したチームの勝ち。毒で最後の1人が倒れても、その場で決着', async () => {
  const w = arena([J('A', 'warrior'), J('B', 'monk', 'e')], { script: [0], pick: { '攻撃対象': 'B' } });
  w.by('B').hp = 1;
  await w.go('A');
  assert.equal(w.b.G.over, 'teamp');
  const p = arena([J('A', 'warrior'), J('B', 'monk', 'e')]);
  p.by('B').hp = 1; p.by('B').poison = 2;
  await p.b.skip();
  assert.equal(p.by('B').alive, false);
  assert.equal(p.b.G.over, 'teamp');
});
test('[裁定] 全チームが同時に全滅したら引き分け', async () => {
  const a = arena([J('A', 'bomb'), J('B', 'warrior', 'e')], { script: [0], pick: { '攻撃対象': 'A' } });
  a.by('A').hp = 1; a.by('B').hp = 2;
  await a.go('B');                  // B が A を攻撃 → A が倒れて爆発 → B も倒れる
  assert.equal(a.b.G.over, 'draw');
});
test('[裁定] 魔王戦: プレイヤーが幽霊として残っていても、全員が戦闘不能なら負け', () => {
  const a = arena([J('G', 'ghost')], { mode: 'cpu', start: { boss: 1 } });
  a.b.edit(a.by('G').id, { alive: false });
  a.by('G').ghost = true;
  assert.equal(a.b.G.over, 'lose');
});
test('[裁定] タンクの庇い: 敵からの攻撃に使える。味方からの攻撃・毒には使えない', async () => {
  const ally = arena([J('A', 'warrior'), J('T', 'tank'), J('X', 'monk', 'e')], { script: [0], pick: { '攻撃対象': 'T' } });
  await ally.go('A');
  assert.ok(!ally.asks.some(x => x.t.startsWith('🛡')), '味方からの攻撃は庇えない');
  const foe = arena([J('X', 'warrior', 'e'), J('A', 'monk'), J('T', 'tank')], { script: [0], pick: { '攻撃対象': 'A' } });
  await foe.go('X');
  assert.ok(foe.asks.some(x => x.t.startsWith('🛡')), '敵からの攻撃は庇える');
  const poison = arena([J('A', 'monk'), J('T', 'tank'), J('X', 'warrior', 'e')]);
  poison.by('A').poison = 2;
  await poison.b.skip(); await poison.b.skip();
  assert.ok(!poison.asks.some(x => x.t.startsWith('🛡')), '毒は庇えない');
});
test('[裁定] ばくだんいわの爆発: 敵味方全員に2ダメージ。バリアは防ぎ、庇えない', async () => {
  const a = arena([J('K', 'bomb'), J('A', 'monk'), J('T', 'tank'), J('X', 'warrior', 'e')], { script: [0], pick: { '攻撃対象': 'K' } });
  a.by('K').hp = 1; a.by('A').barrier = 1;
  const before = { T: a.by('T').hp, X: a.by('X').hp, A: a.by('A').hp };
  await a.go('X');                  // X が K を攻撃 → K が倒れて爆発
  assert.equal(a.by('K').alive, false);
  assert.equal(a.by('A').barrier, 0); assert.equal(a.by('A').hp, before.A);
  assert.equal(a.by('T').hp, before.T - 2);
  assert.equal(a.by('X').hp, before.X - 2);
  assert.ok(!a.asks.some(x => x.t.startsWith('🛡') && /\b2 ダメージ（K）/.test(x.t)), '爆発は庇えない');
});
test('[裁定] 蘇生: 体力1。同じチームの倒れている人だけが対象', async () => {
  const a = arena([J('S', 'sage'), J('D', 'monk'), J('X', 'warrior', 'e'), J('Y', 'monk', 'e')], { script: [1], pick: { '蘇生': 'D' } });
  a.by('D').alive = false; a.by('D').hp = 0; a.by('Y').alive = false; a.by('Y').hp = 0;
  await a.go('S');
  assert.equal(a.by('D').alive, true); assert.equal(a.by('D').hp, 1);
  const q = a.asks.find(x => x.t.includes('蘇生'));
  assert.deepEqual(q.o.filter(o => typeof o.value === 'number').map(o => o.label), ['D']);
});
test('[裁定] アイテムのダメージは難易度で変わらない', async () => {
  for (const level of ['weak', 'extreme']) {
    const a = arena([J('A', 'warrior'), J('X', 'monk', 'e')], { script: ['item:0', -1], pick: { '爆弾': 'X' }, start: { level } });
    a.by('A').items = ['bomb']; a.by('X').hp = a.by('X').maxHp = 10;
    await a.go('A');
    assert.equal(a.by('X').hp, 8, level);
  }
});
test('[裁定] 古い地図: 次の問題だけジャンルが出る', async () => {
  const a = arena([J('A', 'warrior'), J('X', 'monk', 'e')], { script: ['item:0', -1], start: { genres: ['理系', '文系'] } });
  a.by('A').items = ['map'];
  await a.go('A');
  assert.equal(a.b.G.genre, '理系');
  assert.equal(a.b.G.genreFor, a.b.G.q);
});
test('[裁定] 命綱・輸血パック・呪いの人形: 自分に返るダメージはバリアで防げる', async () => {
  const a = arena([J('A', 'warrior'), J('B', 'monk'), J('X', 'monk', 'e')], { script: ['item:0', -1], pick: { '命綱': 'B' } });
  a.by('A').items = ['rope']; a.by('A').barrier = 1;
  await a.go('A');
  assert.equal(a.by('A').hp, a.by('A').maxHp);
  assert.equal(a.by('A').barrier, 0);
  assert.equal(a.by('B').barrier, 1);
});

test('[裁定] 裁定に出てくる主なアイテム名は、すべて実在する', () => {
  const names = Object.values(ITEMS).map(i => i.n);
  const text = JSON.stringify(RULINGS);
  for (const n of ['蘇生の羽', '毒薬', '手裏剣', '呪いの人形', '輸血パック']) { assert.ok(names.includes(n), n); assert.ok(text.includes(n), n + ' が裁定にある'); }
});
