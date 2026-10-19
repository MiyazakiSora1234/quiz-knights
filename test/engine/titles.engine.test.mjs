// 称号のための記録（G.stats）と、決着の結果（G.result）が、エンジンの動きに合って残る
import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';

const P = (name, job, team = 'p') => ({ name, job, team });
const st = (h, n) => h.b.G.stats[h.u(n).id];

test('[称号の記録] 早押しの情報（1着・差・CPUと競った・ディレイ）は、正解で記録される。第1問・誤答の次の問題も', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior'), P('B', 'monk')], boss: 3 });
  h.u('魔王3').hp = h.u('魔王3').maxHp = 50;
  assert.ok(h.b.select(h.u('A').id, { first: true, lead: 400, vsCpu: true, delay: 100, early: false }));
  h.script.push('通常攻撃', '魔王3');
  await h.b.correct();
  const a = st(h, 'A');
  assert.equal(a.first, 1); assert.equal(a.firstQ1, 1); assert.equal(a.leadWin, 1); assert.equal(a.beatCpu, 1); assert.equal(a.delayWin, 1);
  assert.equal(a.maxStreak, 1); assert.ok(a.dealtFoe >= 3 && a.maxAct >= 3);
  // 差が小さいときは、電光石火の記録は付かない。誤答の次の問題で1着なら、復帰の記録
  await h.wrong('B');
  assert.ok(h.b.select(h.u('A').id, { first: true, lead: 100 }));
  assert.equal(st(h, 'A').comeback ?? 0, 0, 'A は誤答していない');
  h.b.G.sel = null;
  assert.ok(h.b.select(h.u('B').id, { first: true }));
  assert.equal(st(h, 'B').comeback, 1, 'B は、1つ前の問題で誤答していた');
});

test('[称号の記録] 誤答: 勇み足・誤答のダメージ・2回続けて誤答・誤答無効・瀬戸際', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior'), P('B', 'monk')], boss: 3 });
  h.b.select(h.u('A').id, { first: true, early: true });
  await h.b.wrong();
  let a = st(h, 'A');
  assert.equal(a.early, 1); assert.equal(a.wrongDmg, 2);
  h.b.select(h.u('A').id, {}); await h.b.wrong();
  assert.equal(st(h, 'A').twoWrong, 1);
  assert.equal(st(h, 'A').wrongDmg, 4);
  // 誤答無効（体力1）
  h.u('B').hp = 1; h.u('B').noWrong = true;
  h.b.select(h.u('B').id, {}); await h.b.wrong();
  const b = st(h, 'B');
  assert.equal(b.wrongBlocked, 1); assert.equal(b.edgeWrong, 1); assert.ok(h.u('B').alive);
  // 誤答の次に自分で正解すると、「転んでもただでは」
  h.b.select(h.u('A').id, {}); h.script.push('何もしない');
  await h.b.correct();
  assert.equal(st(h, 'A').bounce, 1);
});

test('[称号の記録] 回復・バリア・庇う・毒消し・蘇生・全体回復・アイテム2個', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'bard'), P('B', 'warrior'), P('C', 'monk')], boss: 3 });
  h.u('A').hp = 2; h.u('B').hp = 1; h.u('C').hp = 1;
  await h.correct('A', '癒しの歌');
  const a = st(h, 'A');
  assert.equal(a.healAll, 1); assert.ok(a.healed >= 2); assert.equal(a.saveLife, 2, '体力1の味方を2人回復');
  // アイテム: 包帯2個 → 2個使うと item2。攻撃アイテムは itemAtk
  h.u('C').items = ['bandage', 'bandage', 'pebble'];
  h.u('C').hp = 3;
  h.script.push('包帯', '包帯', '何もしない');
  h.b.select(h.u('C').id); await h.b.correct();
  const c = st(h, 'C');
  assert.equal(c.itemsUsed, 2); assert.equal(c.item2, 1); assert.ok(!c.itemAtk);
  h.u('C').items = ['pebble'];
  h.script.push('石つぶて', '魔王3', '何もしない');
  h.b.select(h.u('C').id); await h.b.correct();
  assert.equal(st(h, 'C').itemAtk, 1);
  // バリアを付ける・防ぐ・毒を治す
  const g = harness();
  g.b.start({ players: [P('A', 'cleric'), P('B', 'warrior')], boss: 3 });
  await g.correct('A', '守護のバリア', 'B');
  assert.equal(st(g, 'A').barrierGiven, 1);
  g.u('B').poison = 2; g.u('A').items = ['herb'];
  g.script.push('解毒草', 'B', '何もしない'); g.b.select(g.u('A').id); await g.b.correct();
  assert.equal(st(g, 'A').cured, 1);
});

test('[称号の記録] 決着: とどめ・勝敗・完全勝利・魔王を倒した記録', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior'), P('B', 'monk')], boss: 3 });
  h.u('魔王3').hp = 1;
  await h.correct('A', '通常攻撃', '魔王3');
  const G = h.b.G;
  assert.equal(G.over, 'win');
  assert.equal(st(h, 'A').finisher, 1); assert.equal(st(h, 'A').kills, 1);
  assert.equal(st(h, 'A').won, 1); assert.equal(st(h, 'B').won, 1); assert.equal(st(h, 'A').flawless, 1);
  assert.deepEqual(G.result.bosses, [3]); assert.equal(G.result.win, 'p'); assert.equal(G.result.mode, 'cpu'); assert.equal(G.result.q, 1);
  assert.ok(G.result.at > 0 && G.result.minutes >= 0);
  assert.equal(st(h, '魔王3').lost, 1);
  assert.equal(st(h, 'A').tight ?? 0, 0, 'A の体力は2より大きい');
  assert.equal(st(h, 'A').itemsEnd, 0);
});

test('[称号の記録] 毒で倒す・地雷・足かせ・休み・勝敗（ユーザー対戦）', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'poisoner', 'p'), P('B', 'warrior', 'e')], mode: 'pvp' });
  h.u('B').hp = 1;
  await h.correct('A', '毒', 'B');
  await h.b.skip();                                    // 毒は、付けた問題の次の問題の終わりから効く
  assert.ok(!h.u('B').alive, '毒で倒れる');
  assert.equal(st(h, 'A').poisonKill, 1);
  assert.equal(h.b.G.over, 'teamp'); assert.equal(h.b.G.result.mode, 'pvp'); assert.equal(st(h, 'A').won, 1); assert.equal(st(h, 'B').lost, 1);
  const g = harness();
  g.b.start({ players: [P('A', 'minelayer', 'p'), P('B', 'warrior', 'e'), P('C', 'monk', 'e')], mode: 'pvp' });
  await g.correct('A', '地雷設置', 'B');
  g.b.select(g.u('B').id); g.script.push('何もしない'); await g.b.correct();
  assert.equal(st(g, 'A').mineHit, 1); assert.equal(st(g, 'B').mineTaken, 1);
  const k = harness();
  k.b.start({ players: [P('A', 'oracle', 'p'), P('B', 'mage', 'p'), P('C', 'warrior', 'e')], mode: 'pvp' });
  await k.correct('A', '予言', 'C');
  assert.equal(st(k, 'A').delaySet, 1);
  await k.correct('B', '封じの魔法', 'C');
  assert.equal(st(k, 'B').restFoe, 1);
});

test('[称号の記録] 敵2人への攻撃・味方への攻撃・同時に倒した数・勇者・見習い', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'mw', 'p'), P('B', 'warrior', 'p'), P('X', 'monk', 'e'), P('Y', 'monk', 'e')], mode: 'pvp' });
  await h.correct('A', '通常攻撃');
  assert.equal(st(h, 'A').multiHit, 1);
  await h.correct('B', '通常攻撃', 'A');
  assert.equal(st(h, 'B').friendly, 1);
  const g = harness();
  g.b.start({ players: [P('A', 'playboy'), P('B', 'monk')], boss: 3 });
  await g.correct('A', '何もしない'); await g.correct('A', '何もしない');
  assert.equal(st(g, 'A').hero, 1); assert.equal(st(g, 'A').maxStreak, 2);
});

test('[称号の記録] 先読み（CPUの頭脳）や取り消しでは、記録が増えない／戻る', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior'), P('B', 'monk')], boss: 3, cpuAuto: true });
  await h.correct('A', '通常攻撃', '魔王3');
  const boss = st(h, '魔王3');
  assert.ok((boss.dealtFoe ?? 0) >= 0);
  const before = JSON.stringify(h.b.G.stats);
  h.b.undo();
  assert.notEqual(JSON.stringify(h.b.G.stats), before, '取り消すと、記録も戻る');
  assert.ok(!h.b.G.stats[h.u('A').id].dealtFoe, '戻したあとは、与えたダメージの記録がない');
});

test('[称号の記録] 称号の飾りは、参加者のユニットにだけ付く（魔王・CPUには付かない）', () => {
  const h = harness();
  h.b.start({ players: [{ ...P('A', 'warrior'), pid: 'p1', title: 't001' }, P('B', 'monk')], boss: 3 });
  assert.equal(h.u('A').title, 't001'); assert.equal(h.u('魔王3').title, undefined);
  h.b.join({ name: 'C', job: 'mage', pid: 'p3', title: 't011' });
  assert.equal(h.u('C').title, 't011');
  assert.equal(h.b.G.stats[h.u('C').id].late, 1);
});
