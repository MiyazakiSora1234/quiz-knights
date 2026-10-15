import test from 'node:test';
import assert from 'node:assert/strict';
import { syncRoster, startBlock, validJob } from '../src/lib/roster.js';
import { publicState, eligibleDelays } from '../src/lib/publish.js';
import { createBattle } from '../src/lib/engine.js';

const keys = () => { let n = 0; return () => ++n; };

test('validJob: 不正な職業は戦士', () => {
  assert.equal(validJob('mage'), 'mage');
  assert.equal(validJob('hero'), 'warrior');
  assert.equal(validJob('???'), 'warrior');
});

test('syncRoster: 追加・更新・退室、手動変更は上書きしない', () => {
  const nk = keys(); const r = [];
  syncRoster(r, [{ pid: 'a', name: 'A', job: 'mage', team: 'p', online: true }], nk);
  assert.equal(r.length, 1); assert.equal(r[0].job, 'mage');
  r[0].touchedJob = true; r[0].job = 'tank';
  syncRoster(r, [{ pid: 'a', name: 'A', job: 'thief', team: 'e', online: false, rtt: 50 }], nk);
  assert.equal(r[0].job, 'tank'); assert.equal(r[0].team, 'e'); assert.equal(r[0].online, false); assert.equal(r[0].rtt, 50);
  syncRoster(r, [], nk);
  assert.equal(r.length, 0);   // 退室者は消える
});

test('startBlock', () => {
  assert.ok(startBlock([], 'cpu'));
  assert.equal(startBlock([{ name: 'A', team: 'p' }], 'cpu'), '');
  assert.ok(startBlock([{ name: 'A', team: 'p' }], 'pvp'));
  assert.equal(startBlock([{ name: 'A', team: 'p' }, { name: 'B', team: 'e' }], 'pvp'), '');
});

function battle(players) {
  const b = createBattle({ ask: async () => 0, toast() {}, changed() {} });
  b.start({ players, mode: 'cpu', boss: 1, bossPenalty: true, genres: ['理系'] });
  return b;
}

test('eligibleDelays: バーサーカーは700ms、他は0、押せない人は除外', () => {
  const b = battle([{ name: 'A', job: 'berserker', team: 'p', pid: 'a' }, { name: 'B', job: 'warrior', team: 'p', pid: 'b' }]);
  assert.deepEqual(eligibleDelays(b.G), { a: 700, b: 0 });
  const bu = b.G.units.find(u => u.name === 'B'); bu.alive = false;
  assert.deepEqual(eligibleDelays(b.G), { a: 700 });
  bu.alive = true; bu.restNow = true;
  assert.deepEqual(eligibleDelays(b.G), { a: 700 });
});

test('publicState: 秘密を含まず、必要な項目がある', () => {
  const b = battle([{ name: 'A', job: 'minelayer', team: 'p', pid: 'a' }, { name: 'B', job: 'warrior', team: 'p', pid: 'b' }]);
  const s = publicState(b.G);
  assert.equal(s.q, b.G.q);
  assert.ok(s.units.every(u => !('mine' in u)));
  assert.ok(s.units.some(u => u.isBoss));
  assert.ok(JSON.stringify(s).length < 20000);
});

test('途中参戦: CPU戦では魔王の前に加わり、魔王HPは変わらない。同じ pid は二重に入らない', () => {
  const b = battle([{ name: 'A', job: 'warrior', team: 'p', pid: 'a' }]);
  const hp = b.G.units.find(u => u.isBoss).hp;
  assert.equal(b.join({ name: 'B', job: 'mage', pid: 'b' }), true);
  assert.equal(b.join({ name: 'B', job: 'mage', pid: 'b' }), false);
  assert.equal(b.G.units.at(-1).isBoss, true);
  assert.equal(b.G.units.find(u => u.isBoss).hp, hp);
  assert.equal(b.G.units.find(u => u.id === b.G.pids.b).job, 'mage');
  assert.deepEqual(eligibleDelays(b.G), { a: 0, b: 0 });
});

test('途中参戦: 対戦では自分のチームの最後尾に入り、不正な職業は戦士、終了後は不可', () => {
  const b = createBattle({ ask: async () => 0, toast() {}, changed() {} });
  b.start({ players: [{ name: 'A', job: 'warrior', team: 'p', pid: 'a' }, { name: 'B', job: 'warrior', team: 'e', pid: 'b' }], mode: 'pvp' });
  assert.equal(b.join({ name: 'C', job: 'nope', team: 'p', pid: 'c' }), true);
  assert.deepEqual(b.G.units.map(u => u.name + u.side), ['Ap', 'Cp', 'Be']);
  assert.equal(b.G.units[1].job, 'warrior');
  b.G.over = 'teamp';
  assert.equal(b.join({ name: 'D', pid: 'd' }), false);
});
