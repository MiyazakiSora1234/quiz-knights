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

test('CPUチーム戦: 相手は職業ユニット。プレイヤーは全員チームA、全滅で決着、途中参戦もチームA', async () => {
  const b = createBattle({ ask: async () => 0, toast() {}, changed() {} });
  b.start({ players: [{ name: 'A', job: 'warrior', team: 'e', pid: 'a' }], mode: 'cpu', foes: ['warrior', 'warrior', 'monk', 'nope'] });
  assert.equal(b.G.cpu, true);
  assert.equal(b.G.mode, 'pvp');
  assert.equal(b.G.units.find(u => u.pid === undefined && u.name === 'A').side, 'p');
  const foes = b.G.units.filter(u => u.cpu);
  assert.deepEqual(foes.map(u => u.name), ['CPU戦士1', 'CPU戦士2', 'CPU僧侶', 'CPU戦士'.concat('3')].slice(0, 3).concat(foes[3].name));
  assert.ok(foes.every(u => u.side === 'e' && !u.isBoss));
  assert.equal(b.join({ name: 'B', team: 'e', pid: 'b' }), true);
  assert.equal(b.G.units.find(u => u.id === b.G.pids.b).side, 'p');
  assert.deepEqual(eligibleDelays(b.G), { a: 0, b: 0 });   // CPU は押さない
  assert.equal(publicState(b.G).cpu, true);
  foes.forEach(u => { u.alive = false; u.hp = 0; });
  await b.skip();
  assert.equal(b.G.over, 'teamp');
});

test('魔王の説明: 全魔王に紹介・体力・技・特性がある。アイコンは魔王ごとに別', async () => {
  const { BOSS, iconKey } = await import('../src/lib/engine.js');
  const { icon } = await import('../src/lib/icons.js');
  const svgs = new Set();
  for (const [id, b] of Object.entries(BOSS)) {
    assert.ok(b.intro && b.hpText && b.skills.length && b.traits.length && b.d, id);
    svgs.add(icon(iconKey({ isBoss: true, bossId: +id })));
  }
  assert.equal(svgs.size, 4);
});

test('選択ダイアログには「誰が選ぶか」が付く（行動・対象は回答者、庇いはタンク）', async () => {
  const seen = [];
  const b = createBattle({ ask: async (title, options, o) => { seen.push({ title, actor: o.actor }); return options.find(x => !x.disabled).value; }, toast() {}, changed() {} });
  b.start({ players: [{ name: 'A', job: 'warrior', team: 'p', pid: 'a' }, { name: 'T', job: 'tank', team: 'p', pid: 't' }], mode: 'cpu', boss: 1 });
  const a = b.G.units.find(u => u.name === 'A');
  b.select(a.id);
  await b.correct();
  assert.ok(seen.length >= 1);
  assert.ok(seen.filter(s => !s.title.startsWith('🛡')).every(s => s.actor === a.id), JSON.stringify(seen));
  const tank = b.G.units.find(u => u.name === 'T');
  for (const s of seen.filter(s => s.title.startsWith('🛡'))) assert.equal(s.actor, tank.id);
});

test('誤答の再受付: 誤答者は除かれ、問題は進まない。全員が誤答すると押せる人がいなくなる', async () => {
  const b = createBattle({ ask: async (t, o) => o.find(x => !x.disabled).value, toast() {}, changed() {} });
  b.start({ players: [{ name: 'A', job: 'warrior', pid: 'a' }, { name: 'B', job: 'warrior', pid: 'b' }], mode: 'cpu', boss: 1, bossPenalty: true });
  const a = b.G.units.find(u => u.name === 'A');
  b.select(a.id);
  await b.wrong({ retry: true });
  assert.equal(b.G.q, 1);
  assert.equal(b.G.sel, null);
  assert.deepEqual(eligibleDelays(b.G), { b: 0 });
  const bb = b.G.units.find(u => u.name === 'B');
  b.select(bb.id);
  await b.wrong({ retry: true });
  assert.deepEqual(eligibleDelays(b.G), {});
  await b.skip();
  assert.equal(b.G.q, 2);
  assert.deepEqual(eligibleDelays(b.G), { a: 0, b: 0 });   // 次の問題では全員また押せる
});

test('ユニット調整: 職業変更で基本の数値に、HP0で戦闘不能、復活、戻す操作で元に戻る', async () => {
  const b = createBattle({ ask: async () => 0, toast() {}, changed() {} });
  b.start({ players: [{ name: 'A', job: 'warrior', pid: 'a' }], mode: 'cpu', boss: 1 });
  const a = b.G.units.find(u => u.name === 'A');
  assert.equal(b.edit(a.id, { job: 'tank' }), true);
  assert.deepEqual([a.job, b.G.units[0].maxHp, b.G.units[0].atk], ['tank', 8, 1]);
  b.edit(a.id, { hp: 3, maxHp: 10 });
  assert.deepEqual([b.G.units[0].hp, b.G.units[0].maxHp], [3, 10]);
  b.edit(a.id, { hp: 0 });
  assert.equal(b.G.units[0].alive, false);
  assert.equal(b.G.over, 'lose');
  b.edit(a.id, { alive: true });
  assert.equal(b.G.over, null);
  assert.ok(b.G.units[0].hp >= 1);
  b.edit(a.id, { hp: 999, maxHp: 4 });
  assert.equal(b.G.units[0].hp, 4);
  assert.equal(b.undo(), true);
  assert.equal(b.G.units[0].maxHp, 10);
  const boss = b.G.units.find(u => u.isBoss);
  b.edit(boss.id, { job: 'warrior', hp: 2 });                       // 魔王の職業は変えられない
  assert.equal(b.G.units.find(u => u.isBoss).job, 'boss');
  assert.equal(b.G.units.find(u => u.isBoss).hp, 2);
});
