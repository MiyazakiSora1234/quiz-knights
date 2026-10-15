// ランダム戦闘: 数千回の戦闘を再現可能な乱数で進め、毎手ごとに整合性・取り消し・キャンセルを検査する
import test from 'node:test';
import assert from 'node:assert/strict';
import { SELECTABLE, JOB, BOSS } from '../src/lib/engine.js';
import { harness, rng, checkInvariants, CANCEL } from './harness.mjs';

const JOBS = [...SELECTABLE, 'hero'];

async function playOne(seed, { mode, boss, nPlayers, maxSteps = 70 }) {
  const r = rng(seed);
  let cancelProb = 0.04;
  const h = harness({
    random: () => r(),
    askFn: async (title, opts) => {
      if (r() < cancelProb) throw CANCEL;
      const enabled = opts.filter(o => !o.disabled);
      assert.ok(enabled.length > 0, `選べる選択肢がない: ${title}`);
      return r.pick(enabled).value;
    },
  });
  const players = Array.from({ length: nPlayers }, (_, i) => ({
    name: `P${i + 1}`, job: r.pick(SELECTABLE), team: mode === 'pvp' ? (i % 2 ? 'e' : 'p') : 'p',
  }));
  h.b.start({ players, mode, boss, bossPenalty: r() < 0.7, genres: ['A', 'B', 'C'] });
  const ctx = (n, op) => `seed=${seed} mode=${mode} boss=${boss} step=${n} op=${op} jobs=${players.map(p => p.job).join(',')}`;
  checkInvariants(h.b.G, ctx(0, 'start'));
  let committed = 0, cancelled = 0, undone = 0;

  for (let n = 1; n <= maxSteps && !h.b.G.over; n++) {
    const before = h.snap();
    const roll = r();
    const G = h.b.G;
    let op;
    if (roll < 0.52) {
      const cands = G.units.filter(u => u.alive || u.ghost);
      if (!cands.length) break;
      const t = r.pick(cands);
      const sel = h.b.select(t.id);
      op = `correct(${t.name}:${t.job}) sel=${sel}`;
      if (sel) {
        const ok = await h.b.correct();
        if (ok) { committed++; assert.equal(h.b.G.q, JSON.parse(before).q + 1, ctx(n, op) + ' 問題番号が進んでいない'); }
        else { cancelled++; assert.equal(h.snap(), before.replace(/"sel":\d+|"sel":null/, `"sel":${t.id}`), ctx(n, op) + ' キャンセル後に状態が戻っていない'); }
      }
    } else if (roll < 0.74) {
      const cands = G.units.filter(u => (u.alive || u.ghost));
      const t = r.pick(cands);
      const sel = h.b.select(t.id);
      op = `wrong(${t.name}:${t.job}) sel=${sel}`;
      if (sel) {
        const ok = await h.b.wrong();
        if (ok) committed++; else cancelled++;
      }
    } else if (roll < 0.84) {
      op = 'skip';
      const ok = await h.b.skip();
      if (ok) committed++; else cancelled++;
    } else if (roll < 0.94) {
      op = 'undo';
      const hadUndo = h.b.canUndo;
      const ok = h.b.undo();
      assert.equal(ok, hadUndo, ctx(n, op));
      if (ok) undone++;
    } else {
      op = 'deselect';
      h.b.select(null);
    }
    checkInvariants(h.b.G, ctx(n, op));
  }
  return { committed, cancelled, undone, over: h.b.G.over };
}

function runSeeds(name, from, to, opts) {
  test(name, async () => {
    const stat = { battles: 0, committed: 0, cancelled: 0, undone: 0, ended: 0 };
    for (let seed = from; seed < to; seed++) {
      const o = typeof opts === 'function' ? opts(seed) : opts;
      const res = await playOne(seed, o);
      stat.battles++; stat.committed += res.committed; stat.cancelled += res.cancelled; stat.undone += res.undone; if (res.over) stat.ended++;
    }
    assert.ok(stat.committed > stat.battles, '操作がほとんど成立していない');
    console.log(`  ${name}: ${JSON.stringify(stat)}`);
  });
}

// CPU戦: 4種類の魔王 × 人数いろいろ
for (const boss of Object.keys(BOSS)) {
  runSeeds(`ランダム戦闘 CPU戦（魔王${boss}）`, 1000 * boss, 1000 * boss + 400, seed => ({ mode: 'cpu', boss: +boss, nPlayers: 2 + (seed % 6) }));
}
// ユーザー対戦
runSeeds('ランダム戦闘 ユーザー対戦', 9000, 9600, seed => ({ mode: 'pvp', boss: 1, nPlayers: 2 + (seed % 7) }));
// 少人数・長期戦（死亡が起きにくい場面を含む）
runSeeds('ランダム戦闘 2人だけの長期戦', 20000, 20300, seed => ({ mode: seed % 2 ? 'pvp' : 'cpu', boss: 1 + (seed % 4), nPlayers: 2, maxSteps: 120 }));

test('ランダム戦闘: 同じ種から同じ結果になる（再現性）', async () => {
  const a = await playOne(777, { mode: 'cpu', boss: 2, nPlayers: 5 });
  const b = await playOne(777, { mode: 'cpu', boss: 2, nPlayers: 5 });
  assert.deepEqual(a, b);
});

test('全職業が少なくとも1回はランダム戦闘に登場し、行動が成立する', async () => {
  const seen = new Set();
  for (let seed = 50000; seed < 50400; seed++) {
    const r = rng(seed);
    const players = Array.from({ length: 4 }, (_, i) => ({ name: `P${i}`, job: r.pick(JOBS), team: i % 2 ? 'e' : 'p' }));
    players.forEach(p => seen.add(p.job));
  }
  for (const j of JOBS) assert.ok(seen.has(j), `${j} が登場しない`);
  for (const j of JOBS) assert.ok(JOB[j] && JOB[j].atk >= 0 && JOB[j].hp >= 1, j);
});
