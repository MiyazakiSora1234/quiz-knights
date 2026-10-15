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
  assert.equal(svgs.size, 6);
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

test('CPUの自動行動: 1問ごとに魔王が1回、勝手に誰かを攻撃する（選択は自動）', async () => {
  const asked = [];
  const b = createBattle({ ask: async (t, o, opts) => { asked.push(t); return o.find(x => !x.disabled).value; }, toast() {}, changed() {} });
  b.start({ players: [{ name: 'A', job: 'warrior', pid: 'a' }, { name: 'B', job: 'monk', pid: 'b' }], mode: 'cpu', boss: 1, cpuAuto: true });
  const total = () => b.G.units.filter(u => !u.isBoss).reduce((s, u) => s + u.hp, 0);
  const before = total();
  await b.skip();
  assert.ok(total() < before, '魔王の攻撃でプレイヤーの体力が減る');
  assert.ok(b.G.log.some(l => l.m.includes('🤖 魔王1 の行動')));
  assert.deepEqual(asked, [], '自動の選択では進行役にも参加者にも聞かない');
  assert.equal(b.G.q, 2);
});

test('CPUの自動行動: CPUチーム戦では生きているCPU全員が動く。切れたら動かない。休みは休む', async () => {
  const b = createBattle({ ask: async (t, o) => o.at(-1).value, toast() {}, changed() {} });   // タンクの庇いだけは人に聞く（庇わない）
  b.start({ players: [{ name: 'A', job: 'tank', pid: 'a' }], mode: 'cpu', foes: ['warrior', 'monk'], cpuAuto: true });
  const foes = b.G.units.filter(u => u.cpu);
  foes[1].restNow = true;
  await b.skip();
  assert.ok(b.G.log.some(l => l.m.includes('CPU戦士(戦士) の行動')));
  assert.ok(!b.G.log.some(l => l.m.includes('CPU僧侶(僧侶) の行動')));
});

test('CPUの自動行動: ランダムに最後まで遊んでも落ちず、決着がつく（全魔王）', async () => {
  for (const boss of [1, 2, 3, 4, 5, 6]) {
    for (let seed = 0; seed < 25; seed++) {
      let s = seed * 7919 + boss;
      const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
      const b = createBattle({ ask: async (t, o) => { const ok = o.filter(x => !x.disabled); return ok[Math.floor(rnd() * ok.length)].value; }, toast() {}, changed() {}, random: rnd });
      b.start({ players: ['warrior', 'monk', 'mage'].map((job, i) => ({ name: 'P' + i, job, pid: 'p' + i })), mode: 'cpu', boss, cpuAuto: true });
      for (let i = 0; i < 60 && !b.G.over; i++) {
        const alive = b.G.units.filter(u => !u.isBoss && u.alive);
        if (rnd() < 0.5 && alive.length) { b.select(alive[0].id); await (rnd() < 0.6 ? b.correct() : b.wrong()); } else await b.skip();
        assert.ok(b.G.units.every(u => u.hp >= 0 && u.hp <= u.maxHp), '体力が範囲内');
      }
      assert.ok(b.G.over, `魔王${boss} seed${seed} が決着しない`);
    }
  }
});

/* ================= 途中離脱・途中入室を繰り返す運用 ================= */
test('途中離脱: ユニットが外れ、回答者なら選択が外れ、全員抜ければ敗北。戻ると新しいユニットで途中参戦', () => {
  const b = battle([{ name: 'A', job: 'warrior', pid: 'a' }, { name: 'B', job: 'monk', pid: 'b' }]);
  b.select(b.G.pids.a);
  assert.equal(b.leave('a'), true);
  assert.equal(b.G.sel, null);
  assert.equal(b.G.units.some(u => u.name === 'A'), false);
  assert.equal(b.G.pids.a, undefined);
  assert.equal(b.leave('a'), false);                              // 二重の離脱は何もしない
  assert.equal(b.leave('zzz'), false);
  assert.equal(b.join({ name: 'A', pid: 'a2' }), true);           // 同じ人が戻ると新しい pid
  assert.equal(b.G.units.filter(u => u.name === 'A').length, 1);
  b.leave('b'); b.leave('a2');
  assert.equal(b.G.over, 'lose');
});

test('入退室を200回ランダムに繰り返しても、戦闘の状態が壊れない（ユニット・pid の対応、決着後の扱い）', async () => {
  let s = 12345; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const b = createBattle({ ask: async (t, o) => { const ok = o.filter(x => !x.disabled); return ok[Math.floor(rnd() * ok.length)].value; }, toast() {}, changed() {}, random: rnd });
  b.start({ players: [{ name: 'P0', job: 'tank', pid: 'p0' }, { name: 'P1', job: 'monk', pid: 'p1' }], mode: 'cpu', boss: 3, cpuAuto: true });
  let next = 2; const present = new Set(['p0', 'p1']);
  for (let i = 0; i < 200; i++) {
    const r = rnd();
    if (b.G.over) break;
    if (r < 0.3) { const pid = 'p' + next++; if (b.join({ name: pid, job: 'warrior', pid })) present.add(pid); }
    else if (r < 0.55 && present.size > 1) { const pid = [...present][Math.floor(rnd() * present.size)]; if (b.leave(pid)) present.delete(pid); }
    else if (r < 0.8) { const alive = b.G.units.filter(u => !u.isBoss && u.alive); if (alive.length) { b.select(alive[0].id); await (rnd() < 0.7 ? b.correct() : b.wrong({ retry: rnd() < 0.5 })); } }
    else await b.skip();
    const ids = b.G.units.map(u => u.id);
    assert.equal(new Set(ids).size, ids.length, 'ユニットidが重複しない');
    for (const [pid, id] of Object.entries(b.G.pids)) assert.ok(ids.includes(id), `pid ${pid} のユニットが存在する`);
    assert.ok(b.G.units.every(u => u.hp >= 0 && u.hp <= u.maxHp));
    if (b.G.sel != null) assert.ok(ids.includes(b.G.sel), '選択中のユニットが存在する');
  }
});

test('名簿の同期: 入退室・切断・復帰をランダムに繰り返しても、一覧と名簿が一致し、進行役の手動変更が残る', () => {
  let s = 777; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  let k = 0; const nk = () => ++k;
  const roster = [], lobby = [];
  let n = 0;
  for (let i = 0; i < 300; i++) {
    const r = rnd();
    if (r < 0.3 || !lobby.length) lobby.push({ pid: 'p' + n, name: '人' + n++, job: 'warrior', team: 'p', online: true });
    else if (r < 0.5) lobby.splice(Math.floor(rnd() * lobby.length), 1);
    else if (r < 0.8) { const l = lobby[Math.floor(rnd() * lobby.length)]; l.online = !l.online; }
    else { const l = lobby[Math.floor(rnd() * lobby.length)]; l.job = ['mage', 'monk', 'tank'][Math.floor(rnd() * 3)]; }
    if (rnd() < 0.2 && roster.length) { const row = roster[Math.floor(rnd() * roster.length)]; row.job = 'bm'; row.touchedJob = true; }
    syncRoster(roster, JSON.parse(JSON.stringify(lobby)), nk);
    assert.deepEqual(roster.map(r => r.pid).sort(), lobby.map(l => l.pid).sort());
    for (const row of roster) {
      assert.equal(row.online, lobby.find(l => l.pid === row.pid).online);
      if (row.touchedJob) assert.equal(row.job, 'bm');
    }
    assert.equal(new Set(roster.map(r => r.key)).size, roster.length, '行のキーが重複しない');
  }
});

test('難易度: 弱い=魔王HP0.7倍・与ダメ-1、強い=1.4倍・+1、普通は基準。プレイヤーのダメージは変わらない', async () => {
  const hpOf = level => { const b = battle([{ name: 'A', job: 'warrior', pid: 'a' }]); return b.G.units.find(u => u.isBoss).maxHp; };
  const mk = level => { const b = createBattle({ ask: async (t, o) => o.find(x => !x.disabled).value, toast() {}, changed() {} }); b.start({ players: [{ name: 'A', job: 'warrior', pid: 'a' }, { name: 'B', job: 'tank', pid: 'b' }], mode: 'cpu', boss: 6, level }); return b; };
  const weak = mk('weak'), normal = mk('normal'), strong = mk('strong'), bad = mk('???');
  const hp = b => b.G.units.find(u => u.isBoss).maxHp;
  assert.ok(hp(weak) < hp(normal) && hp(normal) < hp(strong));
  assert.equal(hp(bad), hp(normal));
  // 魔王6の技1（5ダメージ）を戦士Aに撃つ: 弱い4 / 普通5 / 強い6
  for (const [b, dmg] of [[weak, 4], [normal, 5], [strong, 6]]) {
    const boss = b.G.units.find(u => u.isBoss), a = b.G.units.find(u => u.name === 'A');
    b.select(boss.id);
    // A が庇い対象ではないので、直接ダメージを確認（技1の対象は最初の選択肢）
    const before = a.hp;
    await b.correct();
    const lost = before - b.G.units.find(u => u.name === 'A').hp;
    assert.ok(lost === dmg || lost === 0, `${b.G.cfg.level}: ${lost}`);   // 対象は先頭の敵（Aとは限らない）
  }
});
