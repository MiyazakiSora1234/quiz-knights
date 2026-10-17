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
