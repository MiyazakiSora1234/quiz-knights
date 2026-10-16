// 組み合わせテスト（表形式）: 早押しの判定、公開状態、名簿、途中参戦・離脱・調整の連続操作
import test from 'node:test';
import assert from 'node:assert/strict';
import { BuzzRound, clampRtt } from '../../src/server/buzz.js';
import { TOLERANCE_MIN_MS, TOLERANCE_MAX_MS, TOLERANCE_MARGIN_MS, DEFAULT_RTT_MS, TS_MAX_PAST_MS, RTT_MAX_MS } from '../../src/server/config.js';
import { SELECTABLE, JOB, createBattle } from '../src/lib/engine.js';
import { publicState, eligibleDelays } from '../src/lib/publish.js';
import { syncRoster, startBlock, validJob } from '../src/lib/roster.js';
import { harness, rng, checkInvariants } from './harness.mjs';

/* ============================ 早押しの判定 ============================ */
/** 正解の判定（愚直な実装）: 実効時刻 = 申告時刻（到着の2秒前〜到着の範囲に収める）+ ディレイ。同時刻は先に届いた人 */
function oracle(presses) {
  const list = presses.map((p, i) => ({ ...p, i, e: Math.min(p.arrival, Math.max(p.arrival - TS_MAX_PAST_MS, p.ts)) + p.delay }));
  list.sort((a, b) => a.e - b.e || a.i - b.i);
  return list.map(x => x.pid);
}
for (let seed = 1; seed <= 300; seed++) {
  test(`[早押し] 無作為${seed}: 順位が愚直な計算と一致する`, () => {
    const r = rng(seed * 31);
    const n = 2 + r.int(8);
    const base = 1_000_000 + r.int(1000);
    const presses = Array.from({ length: n }, (_, i) => {
      const arrival = base + r.int(400);
      const ts = r() < 0.15 ? arrival + r.int(500) : arrival - r.int(r() < 0.1 ? 4000 : 300);   // 未来や大昔の申告も混ぜる
      return { pid: 'p' + i, ts, arrival, delay: r() < 0.3 ? 700 : 0 };
    });
    const round = BuzzRound.start(1, Object.fromEntries(presses.map(p => [p.pid, p.delay])));
    for (const p of presses) assert.equal(round.record(p.pid, p.ts, p.arrival), true);
    const got = round.ranking().map(x => x.pid);
    // 同じ実効時刻のときの順序は「登録順」なので、愚直な計算（到着の早い順に登録）と同じ登録順で比べる
    const byArrival = [...presses].sort((a, b) => a.arrival - b.arrival);
    const round2 = BuzzRound.start(1, Object.fromEntries(presses.map(p => [p.pid, p.delay])));
    for (const p of byArrival) round2.record(p.pid, p.ts, p.arrival);
    assert.deepEqual(round2.ranking().map(x => x.pid), oracle(byArrival));
    assert.equal(got.length, n);
    assert.equal(round.ranking()[0].ms, 0);
    assert.ok(round.ranking().every((x, i, a) => i === 0 || x.ms >= a[i - 1].ms), 'ms は昇順');
  });
}
const RTTS = [undefined, 0, 1, 5, 20, 40, 60, 80, 120, 200, 300, 600, 1000, 1200, 2000, 5000];
for (const rtt of RTTS) for (const online of [true, false]) {
  test(`[早押し] 待ち時間: rtt=${rtt} ${online ? 'オンライン' : 'オフライン'}の人だけの場合は範囲内`, () => {
    const round = BuzzRound.start(1, { a: 0 });
    const t = round.tolerance(() => rtt, () => online);
    assert.ok(t >= TOLERANCE_MIN_MS && t <= TOLERANCE_MAX_MS);
    if (online) {
      const expect = Math.min(TOLERANCE_MAX_MS, Math.max(TOLERANCE_MIN_MS, (rtt ?? DEFAULT_RTT_MS) / 2 + TOLERANCE_MARGIN_MS));
      assert.equal(t, expect);
    } else assert.equal(t, TOLERANCE_MIN_MS);
  });
}
for (const [v, want] of [[0, 1], [-5, 1], [1, 1], [50, 50], [RTT_MAX_MS, RTT_MAX_MS], [RTT_MAX_MS + 1, RTT_MAX_MS], [1e9, RTT_MAX_MS], ['abc', 1], [null, 1], [NaN, 1]]) {
  test(`[早押し] 往復遅延の申告 ${String(v)} は ${want} に収まる`, () => assert.equal(clampRtt(v), want));
}
for (const [ts, arrival, expectE] of [[1000, 1000, 1000], [999, 1000, 999], [1200, 1000, 1000], [-1e9, 5000, 5000 - TS_MAX_PAST_MS], [NaN, 1000, 1000], [undefined, 1000, 1000], ['x', 1000, 1000], [3000, 5000, 3000]]) {
  test(`[早押し] 申告時刻 ${String(ts)}（到着${arrival}）の扱い`, () => {
    const round = BuzzRound.start(1, { a: 0 });
    round.record('a', ts, arrival);
    assert.equal(round.earliest, expectE);
  });
}
for (const [n, chain] of [[1, false], [2, false], [3, true], [5, true], [8, true], [8, false]]) {
  test(`[早押し] 連チャン=${chain} ${n}人: 勝者決定後の押下と順位の除外`, () => {
    const round = BuzzRound.start(1, Object.fromEntries(Array.from({ length: n }, (_, i) => ['p' + i, 0])), chain);
    round.record('p0', 1000, 1000);
    round.decided();
    let accepted = 0;
    for (let i = 1; i < n; i++) if (round.record('p' + i, 1000 + i * 10, 1000 + i * 10)) accepted++;
    assert.equal(accepted, n - 1);
    const rest = round.ranking(undefined, ['p0']).map(x => x.pid);
    assert.deepEqual(rest, Array.from({ length: n - 1 }, (_, i) => 'p' + (i + 1)));
    // 順に除外していくと、最後は空になる
    const ex = [];
    for (let i = 0; i < n; i++) { const nx = round.ranking(undefined, ex)[0]; if (!nx) break; ex.push(nx.pid); }
    assert.equal(ex.length, n);
  });
}

/* ============================ 公開状態 ============================ */
for (const job of SELECTABLE) for (const variant of ['通常', '死亡', '休み', '毒とバリア', '地雷']) {
  test(`[公開] ${JOB[job].n} / ${variant}: 公開状態に秘密が含まれず、押せる人の判定が正しい`, () => {
    const h = harness();
    h.b.start({ players: [{ name: 'X', job, pid: 'x' }, { name: 'Y', job: 'warrior', pid: 'y' }], mode: 'cpu', boss: 1 });
    const x = h.u('X');
    if (variant === '死亡') { x.alive = false; x.hp = 0; }
    if (variant === '休み') x.restNow = true;
    if (variant === '毒とバリア') { x.poison = 2; x.barrier = 1; }
    if (variant === '地雷') x.mine = { by: h.u('Y').id, dmg: 3 };
    const s = publicState(h.b.G);
    const json = JSON.stringify(s);
    assert.ok(!json.includes('"mine"') && !json.includes('💣'), '地雷は参加者に見せない');
    assert.equal(s.units.length, 3);
    assert.ok(s.units.every(u => typeof u.hp === 'number' && typeof u.maxHp === 'number'));
    const el = eligibleDelays(h.b.G);
    assert.equal('y' in el, true);
    const xCan = !(variant === '死亡' || variant === '休み') || (job === 'ghost' && variant === '死亡' && false);
    assert.equal('x' in el, xCan);
    if (xCan) assert.equal(el.x, job === 'berserker' ? 700 : 0);
  });
}

/* ============================ 名簿・開始条件 ============================ */
for (const [mode, rows, want] of [
  ['cpu', [], '開始できない'], ['cpu', [{ name: 'A', online: true }], ''], ['cpu', [{ name: 'A', online: false }], '開始できない'],
  ['cpu', [{ name: ' ', online: true }], '開始できない'], ['cpu', [{ name: 'A', online: true }, { name: 'B', online: false }], ''],
  ['squad', [{ name: 'A', online: true }], ''], ['squad', [], '開始できない'],
  ['pvp', [{ name: 'A', team: 'p', online: true }], '開始できない'],
  ['pvp', [{ name: 'A', team: 'p', online: true }, { name: 'B', team: 'p', online: true }], '開始できない'],
  ['pvp', [{ name: 'A', team: 'p', online: true }, { name: 'B', team: 'e', online: true }], ''],
  ['pvp', [{ name: 'A', team: 'p', online: true }, { name: 'B', team: 'e', online: false }], '開始できない'],
]) {
  test(`[名簿] 開始条件 ${mode} ${JSON.stringify(rows)}`, () => assert.equal(!!startBlock(rows, mode), want !== ''));
}
for (const j of [...SELECTABLE, 'hero', '???', '', undefined, null, 'WARRIOR']) {
  test(`[名簿] 職業名の検査 ${String(j)}`, () => assert.equal(validJob(j), SELECTABLE.includes(j) ? j : 'warrior'));
}
for (let seed = 1; seed <= 80; seed++) {
  test(`[名簿] 入退室の連続${seed}: 一覧と名簿が常に一致し、進行役の手動変更が残る`, () => {
    const r = rng(seed * 101);
    let k = 0; const nk = () => ++k;
    const roster = [], lobby = []; let n = 0;
    for (let i = 0; i < 120; i++) {
      const x = r();
      if (x < 0.3 || !lobby.length) lobby.push({ pid: 'p' + n, name: '人' + n++, job: 'warrior', team: 'p', online: true });
      else if (x < 0.5) lobby.splice(r.int(lobby.length), 1);
      else if (x < 0.8) { const l = r.pick(lobby); l.online = !l.online; }
      else { const l = r.pick(lobby); l.job = r.pick(SELECTABLE); l.team = r() < 0.5 ? 'p' : 'e'; }
      if (r() < 0.2 && roster.length) { const row = r.pick(roster); row.job = 'bm'; row.touchedJob = true; row.team = 'e'; row.touchedTeam = true; }
      syncRoster(roster, JSON.parse(JSON.stringify(lobby)), nk);
      assert.deepEqual(roster.map(q => q.pid).sort(), lobby.map(l => l.pid).sort());
      for (const row of roster) { const l = lobby.find(z => z.pid === row.pid); assert.equal(row.online, l.online); if (row.touchedJob) assert.equal(row.job, 'bm'); if (row.touchedTeam) assert.equal(row.team, 'e'); }
    }
  });
}

/* ============================ 途中参戦・途中離脱・調整の連続操作 ============================ */
for (let seed = 1; seed <= 100; seed++) {
  const mode = ['cpu', 'pvp', 'squad'][seed % 3];
  test(`[途中参加] 連続操作${seed} (${mode}): 入室・離脱・調整・誤答再受付を混ぜても整合する`, async () => {
    const r = rng(seed * 977);
    const h = harness({ random: () => r(), askFn: async (t, o) => r.pick(o.filter(x => !x.disabled)).value });
    h.b.start({ players: [{ name: 'P0', job: r.pick(SELECTABLE), pid: 'p0', team: 'p' }, { name: 'P1', job: r.pick(SELECTABLE), pid: 'p1', team: 'e' }], mode: mode === 'squad' ? 'cpu' : mode, foes: mode === 'squad' ? ['warrior', 'monk'] : [], boss: 1 + (seed % 6), cpuAuto: mode !== 'pvp' });
    let next = 2; const present = new Set(['p0', 'p1']);
    for (let i = 0; i < 60 && !h.b.G.over; i++) {
      const x = r();
      if (x < 0.25) { const pid = 'p' + next++; if (h.b.join({ name: pid, job: r.pick(SELECTABLE), team: r() < 0.5 ? 'p' : 'e', pid })) present.add(pid); }
      else if (x < 0.45 && present.size) { const pid = r.pick([...present]); if (h.b.leave(pid)) present.delete(pid); }
      else if (x < 0.6) { const u = r.pick(h.b.G.units.filter(z => !z.isBoss)); if (u) h.b.edit(u.id, { job: r() < 0.5 ? r.pick(SELECTABLE) : undefined, hp: r.int(9), maxHp: 1 + r.int(9), atk: r.int(6) }); }
      else if (x < 0.8) { const c = h.b.G.units.filter(z => z.alive || z.ghost); if (c.length && h.b.select(r.pick(c).id)) await (r() < 0.6 ? h.b.correct() : h.b.wrong({ retry: r() < 0.5 })); }
      else if (x < 0.9) await h.b.skip();
      else h.b.undo();
      checkInvariants(h.b.G, `連続${seed} 手${i}`);
      for (const pid of Object.keys(h.b.G.pids)) assert.ok(present.has(pid) || h.b.G.units.some(u => u.id === h.b.G.pids[pid]));
    }
  });
}
