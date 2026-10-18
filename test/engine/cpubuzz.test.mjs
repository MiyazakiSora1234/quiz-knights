// CPUの早押し（engine.cpuBuzz）: 正解なら誰も得をせず問題が終わり、誤答ならCPUが罰を受けて受付は続く
import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, checkInvariants, P } from './harness.mjs';

const start = (h, over = {}) => h.b.start({ players: [P('A', 'warrior'), P('B', 'monk')], boss: 1, foes: ['boss1'], cpuAuto: true, ...over });
const boss = h => h.b.G.units.find(u => u.isBoss);

test('CPUが正解: 問題が終わり、誰も行動できず、次の問題へ', async () => {
  const h = harness(); start(h);
  const before = h.b.G.q, hp = h.b.G.units.filter(u => !u.isBoss).map(u => u.hp);
  assert.equal(await h.b.cpuBuzz(boss(h).id, true), true);
  assert.equal(h.b.G.q, before + 1);
  assert.equal(h.b.G.stats[boss(h).id].correct, 1);
  assert.equal(h.b.G.sel, null);
  assert.ok(h.b.G.log.some(l => /先に押して正解/.test(l.m)));
  assert.equal(h.b.G.units.filter(u => !u.isBoss).some((u, i) => u.hp > hp[i]), false);
  checkInvariants(h.b.G);
});

test('CPUが誤答: CPUが2ダメージ。問題は終わらず、受付は続く', async () => {
  const h = harness(); start(h, { bossPenalty: true });
  const q = h.b.G.q, hp = boss(h).hp;
  assert.equal(await h.b.cpuBuzz(boss(h).id, false), true);
  assert.equal(h.b.G.q, q, '問題は続く');
  assert.equal(boss(h).hp, hp - 2);
  assert.equal(h.b.G.stats[boss(h).id].wrong, 1);
  assert.equal(h.b.G.sel, null);
  await h.correct('A', '通常攻撃', '魔王1');   // そのあと人間が答えられる
  assert.equal(h.b.G.q, q + 1);
  checkInvariants(h.b.G);
});

test('魔王は既定では誤答の罰を受けない', async () => {
  const h = harness(); start(h, { bossPenalty: false });
  const hp = boss(h).hp;
  await h.b.cpuBuzz(boss(h).id, false);
  assert.equal(boss(h).hp, hp);
});

test('CPUの誤答で自分が倒れたら決着がつく（CPUの職業）', async () => {
  const h = harness(); h.b.start({ players: [P('A', 'warrior')], foes: ['monk'], cpuAuto: true, hpScale: 1 });
  const cpu = h.b.G.units.find(u => u.cpu);
  cpu.hp = 2;
  await h.b.cpuBuzz(cpu.id, false);
  assert.equal(cpu.alive, false);
  assert.ok(h.b.G.over);
  checkInvariants(h.b.G);
});

test('押せない場面では何も起きない: 参加者・回答者が決まっている・休み・死亡・存在しないID・参加者が操作する魔王', async () => {
  const h = harness(); start(h);
  const a = h.u('A'), b = boss(h);
  assert.equal(await h.b.cpuBuzz(a.id, true), false, '人間は対象外');
  assert.equal(await h.b.cpuBuzz(9999, true), false);
  h.b.select(a.id);
  assert.equal(await h.b.cpuBuzz(b.id, true), false, '回答者が決まっている間は押せない');
  h.b.select(null);
  b.restNow = true; assert.equal(await h.b.cpuBuzz(b.id, true), false); b.restNow = false;
  b.alive = false; assert.equal(await h.b.cpuBuzz(b.id, true), false); b.alive = true;
  b.human = true; assert.equal(await h.b.cpuBuzz(b.id, true), false); b.human = false;
  assert.equal(h.b.G.q, 1);
});

test('CPUの早押しも取り消せる', async () => {
  const h = harness(); start(h);
  const snap = JSON.stringify(h.b.G);
  await h.b.cpuBuzz(boss(h).id, true);
  assert.ok(h.b.canUndo);
  h.b.undo();
  assert.equal(JSON.stringify(h.b.G), snap);
});

test('CPUの答えが、演出とログに出る（正解・誤答とも）', async () => {
  const h = harness(); start(h, { bossPenalty: true });
  await h.b.cpuBuzz(boss(h).id, false, '北岳');
  assert.equal(h.b.G.event.kind, 'answer'); assert.equal(h.b.G.event.text, '北岳'); assert.equal(h.b.G.event.ok, false);
  assert.ok(h.b.G.log.some(l => /「北岳」と答え、誤答/.test(l.m)));
  await h.b.cpuBuzz(boss(h).id, true, '富士山');
  assert.ok(h.b.G.log.some(l => /「富士山」と答え、正解/.test(l.m)));
  await h.b.cpuBuzz(boss(h).id, true);
  assert.ok(h.b.G.log.some(l => /先に押して正解$/.test(l.m)), '答えの文言なしでも動く');
  checkInvariants(h.b.G);
});

const acted = h => h.b.G.log.filter(l => /の行動$/.test(l.m) && l.m.startsWith('🤖')).length;

test('CPUが早押しで競うとき（cpuBuzz）: 参加者が答えても、スルーでも、CPUは行動しない', async () => {
  const h = harness(); start(h);
  h.b.setCpuBuzz(true);
  await h.correct('A', '通常攻撃', '魔王1');
  assert.equal(acted(h), 0, '参加者が正解して行動したあと、CPUは動かない');
  assert.equal(h.b.G.q, 2);
  await h.b.skip();
  assert.equal(acted(h), 0, 'スルーでもCPUは動かない'); assert.equal(h.b.G.q, 3);
  await h.wrong('B');
  assert.equal(acted(h), 0, '参加者が誤答しても、CPUは動かない'); assert.equal(h.b.G.q, 4);
  checkInvariants(h.b.G);
});

test('CPUが早押しで競うとき: 勝ったCPUだけが行動する。誤答（押し負けではなく自滅）では動かない', async () => {
  const h = harness(); start(h, { bossPenalty: true });
  h.b.setCpuBuzz(true);
  await h.b.cpuBuzz(boss(h).id, false, '誤答');
  assert.equal(acted(h), 0, 'CPUが誤答したときは、行動しない（問題は続く）'); assert.equal(h.b.G.q, 1);
  await h.b.cpuBuzz(boss(h).id, true, '正解');
  assert.equal(acted(h), 1, '早押しに勝って正解したCPUが、1回行動する'); assert.equal(h.b.G.q, 2);
  checkInvariants(h.b.G);
});

test('複数のCPU: 早押しに勝ったCPUが自分で行動する（ほかのCPUではない）', async () => {
  const h = harness();
  h.b.start({ players: [P('A', 'warrior'), P('B', 'monk')], foes: ['mage', 'bm', 'warrior'], cpuAuto: true, hpScale: 1 });
  h.b.setCpuBuzz(true);
  const cpus = h.b.G.units.filter(u => u.cpu);
  for (const winner of [cpus[2], cpus[0], cpus[1]]) {
    const before = h.b.G.log.length;
    await h.b.cpuBuzz(winner.id, true, '正解');
    const mine = h.b.G.log.slice(0, h.b.G.log.length - before).filter(l => /の行動$/.test(l.m)).map(l => l.m);
    assert.equal(mine.length, 1, mine.join(','));
    assert.ok(mine[0].includes(winner.name), `${mine[0]} は ${winner.name} の行動のはず`);
  }
});

test('cpuBuzz がオフ（問題集を使わないとき）は、これまでどおり、1問ごとにCPUが動く', async () => {
  const h = harness(); start(h);
  await h.b.skip();
  assert.equal(acted(h), 1);
  h.b.setCpuBuzz(true); h.b.setCpuBuzz(false);
  await h.b.skip();
  assert.equal(acted(h), 2);
});

test('早押しに勝ったCPUが、休み・戦闘不能で動けないときは、誰も動かない', async () => {
  const h = harness(); start(h);
  h.b.setCpuBuzz(true);
  const b = boss(h);
  b.restNow = true;
  await h.b.skip();
  assert.equal(acted(h), 0);
  checkInvariants(h.b.G);
});
