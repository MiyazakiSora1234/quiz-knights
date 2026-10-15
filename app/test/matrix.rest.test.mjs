// 網羅: 魔王 × 職業、CPUチーム、誤答ルール、調整、ランダム戦闘、保存と復元、途中参加、早押し、名簿
import test from 'node:test';
import assert from 'node:assert/strict';
import { BuzzRound } from '../../src/server/buzz.js';
import { TS_MAX_PAST_MS } from '../../src/server/config.js';
import { createBattle, bossHp } from '../src/lib/engine.js';
import { syncRoster } from '../src/lib/roster.js';
import { publicState, eligibleDelays } from '../src/lib/publish.js';
import { JOBS, JOB, LEVELS, LEVEL_KEYS, BOSS_IDS, pl, enabled, make, scriptedAsk, harness, rng, checkInvariants, CANCEL, UNIT_VARIANTS } from './gen.mjs';

/* ===== 魔王 × 職業 × 難易度 × 魔王の体力 × 技（23 × 6 × 3 × 3 × 2 = 2,484） ===== */
for (const job of JOBS) for (const id of BOSS_IDS) for (const level of LEVEL_KEYS) for (const hpMode of ['満タン', '半分', '瀕死']) for (const act of [0, 1]) {
  test(`[魔王] ${JOB[job].n} vs 魔王${id} ${LEVELS[level].n} 魔王HP${hpMode} 技${act}`, async () => {
    const h = make([pl('A', job), pl('B', 'monk')], { boss: id, level, askFn: scriptedAsk({ actIdx: act }), cpuAuto: true });
    const boss = h.b.G.units.find(u => u.isBoss);
    const S = JOB[job].atk + JOB.monk.atk;
    assert.equal(boss.maxHp, bossHp(S * LEVELS[level].hp, id));
    if (hpMode === '半分') boss.hp = Math.max(1, Math.floor(boss.maxHp / 2));
    if (hpMode === '瀕死') boss.hp = 1;
    h.b.select(h.u('A').id);
    assert.equal(await h.b.correct(), true);
    checkInvariants(h.b.G, `A=${job} 魔王${id}`);
    if (!h.b.G.over) { h.b.select(boss.id); assert.equal(await h.b.correct(), true); checkInvariants(h.b.G, '魔王の手動行動'); }
    if (!h.b.G.over) { await h.b.skip(); checkInvariants(h.b.G, 'スルー'); }
  });
}

/* ===== CPUチーム: 2体の職業の全組み合わせ × 自動行動（23 × 23 = 529）と、単体 × 人数 × 難易度（23 × 4 × 3 = 276） ===== */
for (const x of JOBS) for (const y of JOBS) {
  test(`[CPUチーム] ${JOB[x].n} + ${JOB[y].n} が自動で動く（4問）`, async () => {
    const h = make([pl('A', 'warrior'), pl('B', 'monk')], { foes: [x, y], askFn: scriptedAsk({ last: true }), cpuAuto: true });
    for (let i = 0; i < 4 && !h.b.G.over; i++) { await h.b.skip(); checkInvariants(h.b.G, `CPU ${x}+${y} 問${i}`); }
    assert.ok(h.b.G.units.filter(u => u.cpu).length === 2);
  });
}
for (const x of JOBS) for (const party of [['warrior'], ['warrior', 'monk'], ['tank', 'cleric', 'mage'], ['bm', 'thief', 'ghost', 'bard']]) for (const level of LEVEL_KEYS) {
  test(`[CPU単体] ${JOB[x].n} vs ${party.length}人 ${LEVELS[level].n}`, async () => {
    const h = make(party.map((j, i) => pl('P' + i, j)), { foes: [x], level, askFn: scriptedAsk({ last: true }), cpuAuto: true });
    for (let i = 0; i < 5 && !h.b.G.over; i++) await h.b.skip();
    checkInvariants(h.b.G, `CPU ${x} 人数${party.length}`);
    const cpu = h.b.G.units.find(u => u.cpu);
    assert.ok(cpu && cpu.side === 'e');
  });
}

/* ===== 誤答のルール: 職業 × 状態 × 再受付の有無（23 × 8 × 2 = 368） ===== */
for (const job of JOBS) for (const v of Object.keys(UNIT_VARIANTS)) for (const retry of [false, true]) {
  test(`[誤答] ${JOB[job].n}(${v}) retry=${retry}`, async () => {
    const h = make([pl('A', job), pl('B', 'monk'), pl('C', 'warrior')], { askFn: scriptedAsk({ last: true }) });
    const A = h.u('A');
    UNIT_VARIANTS[v](A, h);
    const sel = h.b.select(A.id);
    if (!sel) return;                                  // 死亡・休みは選べない
    const hp0 = A.hp, others = h.b.G.units.filter(u => u.name !== 'A').map(u => [u.name, u.hp]);
    assert.equal(await h.b.wrong({ retry }), true);
    const G = h.b.G;
    for (const [n, hp] of others) if (!['B', 'C'].includes(n) || job !== 'jester') assert.ok(G.units.find(u => u.name === n).hp <= hp, '他の人は誤答で回復しない');
    assert.ok(retry ? G.q === 1 : G.q === 2);
    if (retry) assert.ok(G.wrongOn.includes(A.id) && G.sel === null);
    checkInvariants(G, `誤答 ${job} ${v} retry=${retry}`);
    assert.ok(G.units.find(u => u.name === 'A').hp <= hp0 || job === 'ghost' || A.ghost);
  });
}

/* ===== 調整: 職業 × パッチ（23 × 30 = 690） ===== */
const PATCHES = [
  {}, { hp: 0 }, { hp: 1 }, { hp: 5 }, { hp: 99 }, { hp: -3 }, { maxHp: 1 }, { maxHp: 10 }, { maxHp: 99 }, { maxHp: 0 }, { maxHp: 200 },
  { atk: 0 }, { atk: 5 }, { atk: 99 }, { atk: -1 }, { hp: 3, maxHp: 3 }, { hp: 9, maxHp: 3 }, { hp: 0, maxHp: 1 }, { alive: false }, { alive: true },
  { name: '新しい名前' }, { name: '  ' }, { name: 'x'.repeat(30) }, { rest: true }, { rest: false },
  { job: 'tank' }, { job: 'ghost' }, { job: 'bm' }, { job: '???' }, { job: 'playboy', hp: 2 },
];
for (const job of JOBS) for (const [i, patch] of PATCHES.entries()) {
  test(`[調整] ${JOB[job].n} に ${JSON.stringify(patch)}`, () => {
    const h = make([pl('A', job), pl('B', 'monk')]);
    const A = h.u('A');
    A.poison = 2; A.barrier = 1; A.mine = { by: h.u('B').id, dmg: 3 };
    assert.equal(h.b.edit(A.id, patch), true);
    const u = h.b.G.units.find(x => x.id === A.id);
    checkInvariants(h.b.G, `調整 ${job} ${JSON.stringify(patch)}`);
    if (!u.alive) assert.ok(!(u.poison > 0) && !(u.barrier > 0) && !u.mine, '倒れたら状態異常は消える');
    if (patch.name && patch.name.trim()) assert.ok(u.name.length <= 12 && u.name === patch.name.trim().slice(0, 12));
    if (patch.hp === 0) assert.equal(u.alive, false);
    assert.equal(h.b.undo(), true);
    assert.equal(h.b.G.units.find(x => x.id === A.id).name, 'A');
  });
}

/* ===== ランダム戦闘 4,000 種 ===== */
const MODES = ['cpu', 'squad', 'pvp'];
for (let seed = 1000; seed < 5000; seed++) {
  test(`[乱戦] 種${seed}`, async () => {
    const r = rng(seed);
    const mode = r.pick(MODES), boss = r.pick(BOSS_IDS), level = r.pick(LEVEL_KEYS);
    const h = harness({ random: () => r(), askFn: async (t, o) => { if (r() < 0.03) throw CANCEL; return r.pick(enabled(o)).value; } });
    const n = 1 + r.int(7);
    const players = Array.from({ length: n }, (_, i) => ({ name: `P${i}`, job: r.pick(JOBS), team: mode === 'pvp' ? ['p', 'e', 'c'][i % 3] : 'p' }));
    if (mode === 'pvp' && n < 2) players.push({ name: 'Q', job: 'warrior', team: 'e' });
    const foes = mode === 'squad' ? Array.from({ length: 1 + r.int(5) }, () => r.pick(JOBS)) : [];
    h.b.start({ players, mode: mode === 'squad' ? 'cpu' : mode, boss, level, foes, cpuAuto: mode !== 'pvp' && r() < 0.6, bossPenalty: r() < 0.7, genres: ['A', 'B'] });
    for (let step = 0; step < 50 && !h.b.G.over; step++) {
      const G = h.b.G, x = r(), alive = G.units.filter(u => u.alive || u.ghost);
      if (x < 0.5) { if (alive.length && h.b.select(r.pick(alive).id)) await h.b.correct(); }
      else if (x < 0.72) { if (alive.length && h.b.select(r.pick(alive).id)) await h.b.wrong({ retry: r() < 0.4 }); }
      else if (x < 0.84) await h.b.skip();
      else if (x < 0.93) h.b.undo();
      else if (x < 0.96) h.b.join({ name: 'L' + step, job: r.pick(JOBS), team: r.pick(['p', 'e', 'c']), pid: 'late' + step });
      else { const pids = Object.keys(G.pids); if (pids.length) h.b.leave(r.pick(pids)); }
      checkInvariants(h.b.G, `乱戦${seed} 手${step}`);
    }
  });
}

/* ===== 保存と復元 1,000 種: 途中でJSONに保存して別の戦闘に読み込み、続きを遊ぶ ===== */
for (let seed = 1; seed <= 1000; seed++) {
  test(`[復元] 種${seed}: 保存→読み込み→続行しても整合し、読み込み直後は保存と同じ`, async () => {
    const r = rng(seed * 13);
    const ask = async (t, o) => r.pick(enabled(o)).value;
    const h = harness({ random: () => r(), askFn: ask });
    const players = Array.from({ length: 2 + r.int(4) }, (_, i) => pl('P' + i, r.pick(JOBS)));
    h.b.start({ players, mode: 'cpu', boss: r.pick(BOSS_IDS), level: r.pick(LEVEL_KEYS), cpuAuto: r() < 0.5, genres: ['A'] });
    for (let i = 0; i < 12 && !h.b.G.over; i++) {
      const alive = h.b.G.units.filter(u => u.alive || u.ghost);
      if (r() < 0.6 && alive.length && h.b.select(r.pick(alive).id)) await h.b.correct(); else await h.b.skip();
    }
    const saved = JSON.parse(JSON.stringify(h.b.G));
    const h2 = harness({ random: () => r(), askFn: ask });
    h2.b.start({ players: [pl('Z', 'warrior')], mode: 'cpu', boss: 1 });
    h2.b.load(saved);
    assert.deepEqual(JSON.parse(JSON.stringify(h2.b.G)), saved);
    checkInvariants(h2.b.G, `復元${seed}`);
    for (let i = 0; i < 8 && !h2.b.G.over; i++) {
      const alive = h2.b.G.units.filter(u => u.alive || u.ghost);
      if (r() < 0.6 && alive.length && h2.b.select(r.pick(alive).id)) await h2.b.correct(); else await h2.b.skip();
      checkInvariants(h2.b.G, `復元${seed} 続き${i}`);
    }
  });
}

/* ===== 途中参加・離脱 2,000 種（人数の出入りが激しい運用） ===== */
for (let seed = 1; seed <= 2000; seed++) {
  test(`[出入り] 種${seed}`, async () => {
    const r = rng(seed * 31);
    const h = harness({ random: () => r(), askFn: async (t, o) => r.pick(enabled(o)).value });
    const mode = r.pick(MODES);
    h.b.start({ players: [{ name: 'P0', job: r.pick(JOBS), pid: 'p0', team: 'p' }], mode: mode === 'squad' ? 'cpu' : mode, foes: mode === 'squad' ? [r.pick(JOBS)] : [], boss: r.pick(BOSS_IDS), cpuAuto: mode !== 'pvp' });
    if (mode === 'pvp') h.b.join({ name: 'P1', job: 'warrior', team: 'e', pid: 'p1' });
    let next = 2;
    for (let i = 0; i < 40 && !h.b.G.over; i++) {
      const x = r();
      if (x < 0.3) h.b.join({ name: 'N' + next, job: r.pick(JOBS), team: r() < 0.5 ? 'p' : 'e', pid: 'p' + next++ });
      else if (x < 0.55) { const pids = Object.keys(h.b.G.pids); if (pids.length) h.b.leave(r.pick(pids)); }
      else if (x < 0.8) { const c = h.b.G.units.filter(u => u.alive || u.ghost); if (c.length && h.b.select(r.pick(c).id)) await (r() < 0.6 ? h.b.correct() : h.b.wrong({ retry: r() < 0.5 })); }
      else if (x < 0.92) await h.b.skip();
      else h.b.undo();
      checkInvariants(h.b.G, `出入り${seed} 手${i}`);
      const el = eligibleDelays(h.b.G);
      for (const pid of Object.keys(el)) assert.ok(pid in h.b.G.pids);
      const ps = publicState(h.b.G);
      assert.ok(!JSON.stringify(ps).includes('"mine"'));
    }
  });
}

/* ===== 早押しの判定 3,000 + 連チャン 1,000 ===== */
const oracle = presses => presses.map((p, i) => ({ ...p, i, e: Math.min(p.arrival, Math.max(p.arrival - TS_MAX_PAST_MS, p.ts)) + p.delay })).sort((a, b) => a.e - b.e || a.i - b.i).map(x => x.pid);
for (let seed = 1; seed <= 3000; seed++) {
  test(`[早押し] 種${seed}: 順位・ms・二重押し拒否`, () => {
    const r = rng(seed * 7);
    const n = 1 + r.int(12), base = 5_000_000 + r.int(1000);
    const presses = Array.from({ length: n }, (_, i) => {
      const arrival = base + r.int(600);
      const ts = r() < 0.2 ? arrival + r.int(900) : arrival - r.int(r() < 0.15 ? 5000 : 400);
      return { pid: 'p' + i, ts, arrival, delay: r() < 0.3 ? 700 : 0 };
    }).sort((a, b) => a.arrival - b.arrival);
    const round = BuzzRound.start(1, Object.fromEntries(presses.map(p => [p.pid, p.delay])));
    for (const p of presses) { assert.equal(round.record(p.pid, p.ts, p.arrival), true); assert.equal(round.record(p.pid, p.ts, p.arrival), false); }
    assert.deepEqual(round.ranking().map(x => x.pid), oracle(presses));
    assert.equal(round.ranking()[0].ms, 0);
    assert.equal(round.record('ghost', base, base), false, '対象外の人は押せない');
  });
}
for (let seed = 1; seed <= 1000; seed++) {
  test(`[連チャン] 種${seed}: 勝者決定後の押下と除外の順序`, () => {
    const r = rng(seed * 17);
    const n = 2 + r.int(9), chain = r() < 0.8;
    const round = BuzzRound.start(1, Object.fromEntries(Array.from({ length: n }, (_, i) => ['p' + i, 0])), chain);
    const order = Array.from({ length: n }, (_, i) => 'p' + i).sort(() => r() - 0.5);
    const first = order[0];
    round.record(first, 1000, 1000); round.decided();
    let t = 1000;
    for (const pid of order.slice(1)) { t += 5 + r.int(30); const ok = round.record(pid, t, t); assert.equal(ok, chain); }
    const rank = round.ranking().map(x => x.pid);
    assert.equal(rank[0], first);
    assert.equal(rank.length, chain ? n : 1);
    const ex = [];
    for (let i = 0; i < n + 2; i++) { const nx = round.ranking(undefined, ex)[0]; if (!nx) break; ex.push(nx.pid); }
    assert.deepEqual(ex, rank);
    // 復元しても連チャンの設定が保たれる
    const back = BuzzRound.from(JSON.parse(JSON.stringify(round.toJSON())));
    assert.equal(back.chain, chain); assert.equal(back.backup, chain);
  });
}

/* ===== 名簿の同期 1,500 種 ===== */
for (let seed = 1; seed <= 1500; seed++) {
  test(`[名簿] 種${seed}: 一覧と名簿の一致・手動変更の保持・キーの一意性`, () => {
    const r = rng(seed * 101);
    let k = 0; const nk = () => ++k;
    const roster = [], lobby = []; let n = 0;
    for (let i = 0; i < 60; i++) {
      const x = r();
      if (x < 0.3 || !lobby.length) lobby.push({ pid: 'p' + n, name: '人' + n++, job: 'warrior', team: 'p', online: true, flavor: r() < 0.5 ? 'あ' : '', rtt: r() < 0.5 ? r.int(300) : null });
      else if (x < 0.5) lobby.splice(r.int(lobby.length), 1);
      else if (x < 0.75) { const l = r.pick(lobby); l.online = !l.online; }
      else if (x < 0.9) { const l = r.pick(lobby); l.job = r.pick(JOBS); l.team = r() < 0.5 ? 'p' : 'e'; l.name = 'R' + r.int(99); }
      else if (roster.length) { const row = r.pick(roster); row.job = 'bm'; row.touchedJob = true; row.team = 'e'; row.touchedTeam = true; row.name = '固定'; row.touchedName = true; }
      syncRoster(roster, JSON.parse(JSON.stringify(lobby)), nk);
      assert.deepEqual(roster.map(q => q.pid).sort(), lobby.map(l => l.pid).sort());
      assert.equal(new Set(roster.map(q => q.key)).size, roster.length);
      for (const row of roster) {
        const l = lobby.find(z => z.pid === row.pid);
        assert.equal(row.online, l.online);
        if (row.touchedJob) assert.equal(row.job, 'bm'); else assert.equal(row.job, JOBS.includes(l.job) ? l.job : 'warrior');
        if (row.touchedName) assert.equal(row.name, '固定'); else assert.equal(row.name, l.name);
      }
    }
  });
}
