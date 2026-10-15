import test from 'node:test';
import assert from 'node:assert/strict';
import { syncRoster, makeGuest, startBlock, parseGenres, validJob } from '../src/lib/roster.js';
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
  r.push(makeGuest(r, nk));
  syncRoster(r, [], nk);
  assert.equal(r.length, 1); assert.equal(r[0].pid, null);   // 退室者は消え、ゲストは残る
});

test('startBlock', () => {
  assert.ok(startBlock([], 'cpu'));
  assert.equal(startBlock([{ name: 'A', team: 'p' }], 'cpu'), '');
  assert.ok(startBlock([{ name: 'A', team: 'p' }], 'pvp'));
  assert.equal(startBlock([{ name: 'A', team: 'p' }, { name: 'B', team: 'e' }], 'pvp'), '');
});

test('parseGenres: 区切り・重複・上限・空', () => {
  assert.deepEqual(parseGenres('理系、文系, 理系 青問/緑問'), ['理系', '文系', '青問', '緑問']);
  assert.equal(parseGenres(Array.from({ length: 20 }, (_, i) => 'g' + i).join('、')).length, 12);
  assert.deepEqual(parseGenres('  ', ['x']), ['x']);
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
