// 組み合わせテスト（表形式）: 職業 × 場面、職業 × 職業、魔王 × 難易度 × 人数 × 体力、ランダム戦闘の種ごと
// 1ケース = 1テスト。落ちたときに「どの組み合わせか」が名前でわかるようにしてある
import test from 'node:test';
import assert from 'node:assert/strict';
import { SELECTABLE, JOB, BOSS, LEVELS, bossHp } from '../src/lib/engine.js';
import { harness, rng, checkInvariants, CANCEL } from './harness.mjs';

const JOBS = SELECTABLE;
const enabled = opts => opts.filter(o => !o.disabled);

/** 選択を自動で決める ask: 行動は先頭の有効な選択肢、対象は prefer(options) があればそれを優先 */
function autoAsk({ prefer = null, last = false, r = null } = {}) {
  return async (title, opts) => {
    const ok = enabled(opts);
    assert.ok(ok.length > 0, `選べる選択肢がない: ${title}`);
    if (prefer) { const p = prefer(title, ok); if (p) return p.value; }
    if (r) return r.pick(ok).value;
    return (last ? ok[ok.length - 1] : ok[0]).value;
  };
}
const mk = (players, { mode = 'cpu', boss = 3, askFn = autoAsk(), level, cpuAuto = false, foes, random } = {}) => {
  const h = harness({ askFn, random });
  h.b.start({ players, mode, boss, level, cpuAuto, foes, bossPenalty: true, genres: ['A', 'B'] });
  return h;
};
const pl = (name, job, team = 'p') => ({ name, job, team });

/* ============================ 職業 × 場面（23職 × 10場面） ============================ */
for (const job of JOBS) {
  const J = JOB[job];
  test(`[職業] ${J.n}: 初期の攻撃力・体力が表のとおり`, () => {
    const h = mk([pl('X', job), pl('Y', 'warrior')]);
    assert.equal(h.u('X').atk, J.atk); assert.equal(h.u('X').hp, J.hp); assert.equal(h.u('X').maxHp, J.hp);
    checkInvariants(h.b.G, job);
  });
  test(`[職業] ${J.n}: 誤答すると本人だけが2ダメージ（体力は0未満にならない）`, async () => {
    const h = mk([pl('X', job), pl('Y', 'warrior')], { askFn: autoAsk({ last: true }) });
    const y = h.u('Y').hp;
    await h.wrong('X');
    assert.equal(h.u('Y').hp, y);
    assert.equal(h.u('X').hp, Math.max(0, J.hp - 2));
    checkInvariants(h.b.G, job);
  });
  test(`[職業] ${J.n}: 正解して先頭の行動を選ぶと、問題が進み状態が壊れない`, async () => {
    const h = mk([pl('X', job), pl('Y', 'warrior'), pl('Z', 'monk')]);
    const q = h.b.G.q;
    h.b.select(h.u('X').id);
    assert.equal(await h.b.correct(), true);
    assert.equal(h.b.G.q, q + 1);
    checkInvariants(h.b.G, job);
  });
  test(`[職業] ${J.n}: 体力1で誤答すると倒れる。状態は整合したまま`, async () => {
    const h = mk([pl('X', job), pl('Y', 'warrior')], { askFn: autoAsk({ last: true }) });
    h.u('X').hp = 1;
    await h.wrong('X');
    checkInvariants(h.b.G, job);
    if (job === 'jester') assert.equal(h.u('X').alive, false);   // 自分で受ける選択
  });
  test(`[職業] ${J.n}: 正解したあと「1つ戻す」で完全に元に戻る`, async () => {
    const h = mk([pl('X', job), pl('Y', 'monk'), pl('Z', 'tank')]);
    h.b.select(h.u('X').id);
    const hpBefore = h.b.G.units.map(u => [u.id, u.hp, u.alive]);
    await h.b.correct();
    assert.equal(h.b.undo(), true);
    assert.deepEqual(h.b.G.units.map(u => [u.id, u.hp, u.alive]), hpBefore);
    assert.equal(h.b.G.q, 1);
    checkInvariants(h.b.G, job);
  });
  test(`[職業] ${J.n}: 途中の状態をJSONに保存して読み込み直しても続けられる`, async () => {
    const h = mk([pl('X', job), pl('Y', 'warrior')]);
    h.b.select(h.u('X').id); await h.b.correct();
    const saved = JSON.parse(JSON.stringify(h.b.G));
    const h2 = mk([pl('A', 'warrior'), pl('B', 'monk')]);
    h2.b.load(saved);
    checkInvariants(h2.b.G, job);
    const alive = h2.b.G.units.filter(u => !u.isBoss && (u.alive || u.ghost));
    if (alive.length) { h2.b.select(alive[0].id); assert.equal(await h2.b.correct(), true); }
    checkInvariants(h2.b.G, job);
  });
  test(`[職業] ${J.n}: バリア・毒・地雷が付いた状態で正解しても整合する`, async () => {
    const h = mk([pl('X', job), pl('Y', 'warrior'), pl('Z', 'monk')]);
    const x = h.u('X');
    x.barrier = 1; x.poison = 2; x.mine = { by: h.u('Y').id, dmg: 3 };
    h.b.select(x.id);
    await h.b.correct();
    checkInvariants(h.b.G, job);
  });
  test(`[職業] ${J.n}: ユーザー対戦（相手は戦士）でも正解・誤答・スルーが成立する`, async () => {
    const h = mk([pl('X', job, 'p'), pl('Y', 'warrior', 'e')], { mode: 'pvp' });
    h.b.select(h.u('X').id); await h.b.correct();
    if (!h.b.G.over) { h.b.select(h.u('Y').id); await h.b.wrong(); }
    if (!h.b.G.over) await h.b.skip();
    checkInvariants(h.b.G, job);
  });
  test(`[職業] ${J.n}: CPU（魔王）が自動で動く問題を3回続けても整合する`, async () => {
    const h = mk([pl('X', job), pl('Y', 'tank'), pl('Z', 'monk')], { cpuAuto: true, askFn: autoAsk({ last: true }) });
    for (let i = 0; i < 3 && !h.b.G.over; i++) await h.b.skip();
    checkInvariants(h.b.G, job);
  });
  test(`[職業] ${J.n}: 戦闘中に職業を変更・HP調整しても整合する`, () => {
    const h = mk([pl('X', 'warrior'), pl('Y', 'monk')]);
    const id = h.u('X').id;
    assert.equal(h.b.edit(id, { job }), true);
    assert.equal(h.u('X').job, job); assert.equal(h.u('X').maxHp, J.hp); assert.equal(h.u('X').atk, J.atk);
    h.b.edit(id, { hp: 1, maxHp: 3 });
    assert.deepEqual([h.u('X').hp, h.u('X').maxHp], [1, 3]);
    checkInvariants(h.b.G, job);
  });
}

/* ============================ 職業 × 職業（攻撃側 × 受け側 = 23 × 23） ============================ */
for (const a of JOBS) for (const d of JOBS) {
  test(`[対面] ${JOB[a].n} が正解して ${JOB[d].n} を狙う`, async () => {
    const prefer = (title, ok) => ok.find(o => o.unit && /\bD\b/.test(o.label)) || null;   // 受け側（名前 D）を優先して選ぶ
    const h = mk([pl('A', a), pl('D', d), pl('E', 'monk')], { askFn: autoAsk({ prefer }) });
    h.b.select(h.u('A').id);
    const ok = await h.b.correct();
    assert.equal(ok, true);
    assert.equal(h.b.G.q, 2);
    checkInvariants(h.b.G, `${a} -> ${d}`);
  });
}

/* ============================ 魔王 × 難易度 × 人数 × 体力 ============================ */
const BOSS_IDS = Object.keys(BOSS).map(Number);
for (const id of BOSS_IDS) for (const level of Object.keys(LEVELS)) for (const n of [1, 2, 3, 4, 5, 6]) for (const hpMode of ['満タン', '半分', '瀕死']) {
  test(`[魔王] 魔王${id} / ${LEVELS[level].n} / ${n}人 / 魔王HP${hpMode}: 体力式・全技・自動行動`, async () => {
    const jobs = ['warrior', 'monk', 'mage', 'tank', 'bard', 'thief'].slice(0, n);
    const players = jobs.map((j, i) => pl('P' + i, j));
    const h = mk(players, { boss: id, level, askFn: autoAsk({ last: false }), cpuAuto: true });
    const S = players.reduce((s, p) => s + JOB[p.job].atk, 0);
    const boss = h.b.G.units.find(u => u.isBoss);
    assert.equal(boss.maxHp, bossHp(S * LEVELS[level].hp, id), '魔王の体力式');
    if (hpMode === '半分') boss.hp = Math.max(1, Math.floor(boss.maxHp / 2));
    if (hpMode === '瀕死') boss.hp = 1;
    // 魔王が手動で行動（進行役が選んだ場合）
    h.b.select(boss.id);
    await h.b.correct();
    checkInvariants(h.b.G, `魔王${id}`);
    // その後、スルーを数回（CPUの自動行動）
    for (let i = 0; i < 3 && !h.b.G.over; i++) await h.b.skip();
    checkInvariants(h.b.G, `魔王${id}`);
    assert.ok(h.b.G.q >= 2);
  });
}

/* ============================ ランダム戦闘（種ごとに1テスト） ============================ */
const MODES = ['cpu', 'squad', 'pvp'];
for (let seed = 1; seed <= 420; seed++) {
  const r0 = rng(seed * 7919);
  const mode = MODES[seed % 3], boss = 1 + (seed % 6), level = Object.keys(LEVELS)[seed % 3], auto = seed % 2 === 0;
  test(`[ランダム] 種${seed} ${mode} 魔王${boss} ${LEVELS[level].n} 自動行動${auto ? 'あり' : 'なし'}`, async () => {
    const r = rng(seed);
    const h = harness({ random: () => r(), askFn: async (t, o) => { if (r() < 0.03) throw CANCEL; return r.pick(enabled(o)).value; } });
    const n = 2 + r.int(5);
    const players = Array.from({ length: n }, (_, i) => ({ name: `P${i}`, job: r.pick(JOBS), team: mode === 'pvp' ? (i % 2 ? 'e' : 'p') : 'p' }));
    const foes = mode === 'squad' ? Array.from({ length: 1 + r.int(4) }, () => r.pick(JOBS)) : [];
    h.b.start({ players, mode: mode === 'squad' ? 'cpu' : mode, boss, level, foes, cpuAuto: auto && mode !== 'pvp', bossPenalty: r() < 0.7, genres: ['A', 'B'] });
    for (let step = 0; step < 60 && !h.b.G.over; step++) {
      const G = h.b.G, x = r();
      if (x < 0.5) { const c = G.units.filter(u => u.alive || u.ghost); if (c.length && h.b.select(r.pick(c).id)) await h.b.correct(); }
      else if (x < 0.72) { const c = G.units.filter(u => u.alive || u.ghost); if (c.length && h.b.select(r.pick(c).id)) await h.b.wrong({ retry: r() < 0.4 }); }
      else if (x < 0.84) await h.b.skip();
      else if (x < 0.92) h.b.undo();
      else if (x < 0.96) h.b.join({ name: 'L' + step, job: r.pick(JOBS), team: r() < 0.5 ? 'p' : 'e', pid: 'late' + step });
      else { const pids = Object.keys(G.pids); if (pids.length) h.b.leave(r.pick(pids)); }
      checkInvariants(h.b.G, `種${seed} 手${step}`);
    }
  });
}
