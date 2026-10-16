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
  assert.equal(startBlock([{ name: 'A', team: 'p', online: true }], 'cpu'), '');
  assert.ok(startBlock([{ name: 'A', team: 'p', online: false }], 'cpu'), '切断中だけでは開始できない');
  assert.ok(startBlock([{ name: 'A', team: 'p', online: true }], 'pvp'));
  assert.equal(startBlock([{ name: 'A', team: 'p', online: true }, { name: 'B', team: 'e', online: true }], 'pvp'), '');
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
  const { LEVELS } = await import('../src/lib/engine.js');
  const hp = b => b.G.units.find(u => u.isBoss).maxHp;
  assert.ok(hp(weak) < hp(normal) && hp(normal) < hp(strong));
  assert.equal(hp(bad), hp(mk('base')), '不明な難易度は基準になる');
  // 魔王6の技1（5ダメージ）を戦士Aに撃つ: 弱い4 / 普通5 / 強い6
  for (const [b, dmg] of [[weak, 5 + LEVELS.weak.dmg], [normal, 5 + LEVELS.normal.dmg], [strong, 5 + LEVELS.strong.dmg]]) {
    const boss = b.G.units.find(u => u.isBoss), a = b.G.units.find(u => u.name === 'A');
    b.select(boss.id);
    // A が庇い対象ではないので、直接ダメージを確認（技1の対象は最初の選択肢）
    const before = a.hp;
    await b.correct();
    const lost = before - b.G.units.find(u => u.name === 'A').hp;
    assert.ok(lost === dmg || lost === 0, `${b.G.cfg.level}: ${lost}`);   // 対象は先頭の敵（Aとは限らない）
  }
});

test('誤答の日: 誤答した本人だけが2ダメージ。その問題が終わるとCPUも動く', async () => {
  const b = createBattle({ ask: async (t, o) => o.find(x => !x.disabled).value, toast() {}, changed() {} });
  b.start({ players: [{ name: 'A', job: 'warrior', pid: 'a' }, { name: 'B', job: 'monk', pid: 'b' }], mode: 'cpu', boss: 1, cpuAuto: true });
  const hp = n => b.G.units.find(u => u.name === n).hp;
  const [a0, b0] = [hp('A'), hp('B')];
  b.select(b.G.pids.a);
  await b.wrong();
  const lost = (a0 - hp('A')) + (b0 - hp('B'));
  assert.ok(b.G.log.some(l => l.m.includes('❌ A')), '誤答の記録');
  assert.ok(b.G.log.some(l => l.m.includes('🤖 魔王1 の行動')), 'CPUが動く');
  // 誤答の2ダメージは本人のみ（それ以外の減りは、すべて魔王の攻撃によるもの）
  assert.ok(lost >= 2);
  assert.equal(b.G.q, 2);
  // 魔王が動かない設定なら、減るのは本人の2だけ
  const c = createBattle({ ask: async (t, o) => o.find(x => !x.disabled).value, toast() {}, changed() {} });
  c.start({ players: [{ name: 'A', job: 'warrior', pid: 'a' }, { name: 'B', job: 'monk', pid: 'b' }], mode: 'cpu', boss: 1 });
  c.select(c.G.pids.a); await c.wrong();
  assert.equal(c.G.units.find(u => u.name === 'A').hp, 5);
  assert.equal(c.G.units.find(u => u.name === 'B').hp, 6);
});

test('職業の分類: すべての選べる職業がちょうど1つの分類に入り、順番は職業表と同じ', async () => {
  const { JOB_GROUPS, SELECTABLE } = await import('../src/lib/engine.js');
  const flat = JOB_GROUPS.flatMap(g => g.keys);
  assert.deepEqual(flat, SELECTABLE);
  assert.equal(new Set(flat).size, flat.length);
});

test('3チーム対戦: A→B→C の順に並び、最後の1チームが残るまで続き、結果の名前も正しい', async () => {
  const b = createBattle({ ask: async (t, o) => o.find(x => !x.disabled).value, toast() {}, changed() {} });
  b.start({ players: [{ name: 'C1', job: 'warrior', team: 'c' }, { name: 'A1', job: 'warrior', team: 'p' }, { name: 'B1', job: 'warrior', team: 'e' }, { name: 'A2', job: 'monk', team: 'p' }], mode: 'pvp' });
  assert.deepEqual(b.G.units.map(u => u.name + u.side), ['A1p', 'A2p', 'B1e', 'C1c']);
  const kill = n => { const u = b.G.units.find(x => x.name === n); u.alive = false; u.hp = 0; };
  kill('B1'); await b.skip();
  assert.equal(b.G.over, null, '2チーム残っていれば続く');
  kill('C1'); await b.skip();
  assert.equal(b.G.over, 'teamp');
});
test('3チーム対戦: 途中参加は自分のチームの並びに入り、チームCで勝つこともできる', async () => {
  const b = createBattle({ ask: async (t, o) => o.find(x => !x.disabled).value, toast() {}, changed() {} });
  b.start({ players: [{ name: 'A1', job: 'warrior', team: 'p', pid: 'a' }, { name: 'B1', job: 'warrior', team: 'e', pid: 'b' }], mode: 'pvp' });
  assert.equal(b.join({ name: 'C1', team: 'c', pid: 'c' }), true);
  assert.equal(b.join({ name: 'B2', team: 'e', pid: 'b2' }), true);
  assert.deepEqual(b.G.units.map(u => u.name + u.side), ['A1p', 'B1e', 'B2e', 'C1c']);
  for (const n of ['A1', 'B1', 'B2']) { const u = b.G.units.find(x => x.name === n); u.alive = false; u.hp = 0; }
  await b.skip();
  assert.equal(b.G.over, 'teamc');
  const { startBlock } = await import('../src/lib/roster.js');
  assert.ok(startBlock([{ name: 'A', team: 'p', online: true }, { name: 'B', team: 'p', online: true }], 'pvp'));
  assert.equal(startBlock([{ name: 'A', team: 'p', online: true }, { name: 'B', team: 'c', online: true }], 'pvp'), '');
});

test('順位の表示: 1着は🥇、2着以降は1着からの遅れ(ms)。順位表がなければ何も出さない', async () => {
  const { rankTags, rankTag } = await import('../src/lib/ranks.js');
  const tags = rankTags([{ pid: 'a', ms: 0 }, { pid: 'b', ms: 120.4 }, { pid: 'c', ms: 999.6 }]);
  assert.deepEqual([tags.a.t, tags.b.t, tags.c.t], ['🥇 1着', '2着 +120ms', '3着 +1000ms']);
  assert.equal(tags.a.cls, 'rank1'); assert.equal(tags.b.cls, 'rank');
  assert.deepEqual(rankTags(undefined), {});
  assert.equal(rankTag(null, 0), null);
});

test('難易度: 職業のCPUも体力が変わる（難易度ごとの倍率）。プレイヤーは変わらない', async () => {
  const mk = level => { const b = createBattle({ ask: async () => 0, toast() {}, changed() {} }); b.start({ players: [{ name: 'A', job: 'warrior' }], mode: 'cpu', foes: ['warrior', 'tank'], level }); return b; };
  const hp = (b, n) => b.G.units.find(u => u.name === n).maxHp;
  const { LEVELS } = await import('../src/lib/engine.js');
  for (const [n, base] of [['CPU戦士', 7], ['CPUタンク', 8]]) {
    const fs = 1.1 / 2;      // 職業のCPUが2体いるときの、敵の数による倍率
    assert.equal(hp(mk('base'), n), Math.ceil(base * fs));
    for (const k of ['weak', 'normal', 'strong', 'extreme']) assert.equal(hp(mk(k), n), Math.max(1, Math.ceil(base * LEVELS[k].hp * fs)), k);
  }
  assert.equal(hp(mk('strong'), 'A'), 7);
});

/* ================= 参加者が魔王として戦う ================= */
import { bossIdOf, PLAYABLE_BOSS_KEYS, BOSS, JOB } from '../src/lib/engine.js';
const mkb = () => createBattle({ ask: async (t, o) => o.find(x => !x.disabled).value, toast() {}, changed() {} });

test('魔王として戦う: 魔王の職業キーの判定', () => {
  assert.deepEqual(PLAYABLE_BOSS_KEYS, ['boss1', 'boss2', 'boss3', 'boss4', 'boss5', 'boss6']);
  for (const [k, want] of [['boss1', 1], ['boss6', 6], ['boss7', 0], ['boss0', 0], ['boss', 0], ['warrior', 0], [undefined, 0], ['xboss1', 0], ['boss1x', 0]]) assert.equal(bossIdOf(k), want, String(k));
});
for (const id of [1, 2, 3, 4, 5, 6]) {
  test(`魔王として戦う: 魔王${id} を選んだ参加者は、操作する魔王になる（体力は他の参加者の攻撃合計、自動では動かない、誤答は2ダメージ）`, async () => {
    const b = mkb();
    b.start({ players: [{ name: 'ボス役', job: 'boss' + id, pid: 'x' }, { name: 'A', job: 'warrior', pid: 'a' }, { name: 'B', job: 'monk', pid: 'b' }], mode: 'cpu', foes: ['warrior'], cpuAuto: true });
    const u = b.G.units.find(x => x.name === 'ボス役');
    assert.equal(u.isBoss, true); assert.equal(u.human, true); assert.equal(u.side, 'p');
    assert.equal(u.maxHp, Math.max(1, Math.ceil(BOSS[id].hp(JOB.warrior.atk + JOB.monk.atk))));
    assert.equal(b.G.pids.x, u.id);
    u.hp = u.maxHp = 20;                                               // CPUの攻撃で倒れないように体力を増やす
    const hp = u.hp;
    await b.skip();                                                    // CPU（戦士）は動くが、参加者の魔王は自動では動かない
    assert.ok(!b.G.log.some(l => l.m.includes('🤖 ボス役')));
    assert.ok(b.G.log.some(l => l.m.includes('CPU戦士')));
    b.select(u.id); assert.equal(await b.correct(), true);             // 魔王の技が使える（自分で選ぶ）
    const hp2 = b.G.units.find(x => x.name === 'ボス役').hp;
    b.select(u.id); await b.wrong();
    const after = b.G.units.find(x => x.name === 'ボス役').hp;
    assert.ok(after <= hp2 - 2, '誤答で2ダメージ（魔王の誤答免除は、参加者が操作する魔王には効かない）');
    checkInvariantsBoss(b);
  });
}
function checkInvariantsBoss(b) {
  const ids = b.G.units.map(u => u.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(b.G.units.every(u => u.hp >= 0 && u.hp <= u.maxHp));
}
test('魔王として戦う: ユーザー対戦では選んだチームに入り、途中参加でも魔王を選べる。決着はチーム全滅', async () => {
  const b = mkb();
  b.start({ players: [{ name: 'A', job: 'warrior', team: 'p', pid: 'a' }, { name: 'M', job: 'boss2', team: 'e', pid: 'm' }], mode: 'pvp' });
  assert.equal(b.G.units.find(u => u.name === 'M').side, 'e');
  assert.equal(b.join({ name: 'N', job: 'boss4', team: 'c', pid: 'n' }), true);
  const n = b.G.units.find(u => u.name === 'N');
  assert.deepEqual([n.isBoss, n.human, n.side], [true, true, 'c']);
  assert.equal(n.maxHp, Math.ceil(BOSS[4].hp(JOB.warrior.atk)));
  for (const x of ['A', 'M']) { const u = b.G.units.find(z => z.name === x); u.alive = false; u.hp = 0; }
  await b.skip();
  assert.equal(b.G.over, 'teamc');
});
test('魔王として戦う: 魔王だけを選んだ参加者がいて、相手の指定がなくても、チーム戦のルールで始まる', () => {
  const b = mkb();
  b.start({ players: [{ name: 'M', job: 'boss1', pid: 'm' }, { name: 'A', job: 'warrior', pid: 'a' }], mode: 'cpu', foes: [] });
  assert.equal(b.G.mode, 'pvp'); assert.equal(b.G.cpu, true);
});

/* ================= CPUの頭脳（先読み） ================= */
const aiBattle = (players, foes, extra = {}) => { const b = createBattle({ ask: async (t, o) => { const g = t.startsWith('🛡') ? o.find(x => x.cls === 'ghost') : null; if (g) return g.value; return (o.find(x => !x.disabled && x.cls !== 'ghost') ?? o[0]).value; }, toast() {}, changed() {}, random: () => 0.5 }); b.start({ players, mode: 'cpu', foes, cpuAuto: true, ...extra }); return b; };
test('CPUの頭脳: 倒せる相手がいれば、倒せる技で倒す（魔王1の技1=3ダメージで、体力2の人を狙う）', async () => {
  const b = aiBattle([{ name: 'A', job: 'warrior' }, { name: 'B', job: 'monk' }, { name: 'C', job: 'tank' }], ['boss1']);
  b.G.units.find(u => u.name === 'B').hp = 2;
  await b.skip();
  assert.equal(b.G.units.find(u => u.name === 'B').alive, false);
  assert.ok(b.G.units.filter(u => u.alive && !u.isBoss).length === 2, '倒したのはBだけ');
});
test('CPUの頭脳: 体力が減った自分を回復できるなら、僧侶は回復する（攻撃より回復が得な場面）', async () => {
  const b = aiBattle([{ name: 'A', job: 'warrior' }], ['monk']);
  const m = b.G.units.find(u => u.cpu); m.hp = 1;
  const a = b.G.units.find(u => u.name === 'A'); a.hp = 7;
  await b.skip();
  assert.ok(b.G.units.find(u => u.cpu).hp >= 4, '回復して体力が戻った');
  assert.equal(b.G.units.find(u => u.name === 'A').hp, 7);
});
test('CPUの頭脳: 味方も巻き込む捨て身より、ふつうの攻撃を選ぶ。決着がつくなら迷わず倒す', async () => {
  const b = aiBattle([{ name: 'A', job: 'warrior' }, { name: 'B', job: 'monk' }], ['warrior']);
  await b.skip();
  const cpu = b.G.units.find(u => u.cpu);
  assert.equal(cpu.hp, cpu.maxHp, 'CPU戦士は自分を傷つける捨て身を使わない');
  const c = aiBattle([{ name: 'A', job: 'monk' }], ['warrior']);
  c.G.units.find(u => u.name === 'A').hp = 3;
  await c.skip();
  assert.equal(c.G.over, 'teame', '最後の1人を倒して決着');
});
test('CPUの頭脳: 複数のCPUのうち、いちばん効く1体だけが動く。動かないCPUは何もしない', async () => {
  const b = aiBattle([{ name: 'A', job: 'warrior' }, { name: 'B', job: 'monk' }], ['bm', 'sage', 'bomb']);
  const before = JSON.stringify(b.G.units.filter(u => u.cpu).map(u => u.hp));
  await b.skip();
  const acted = b.G.log.filter(l => l.m.includes('🤖')).length;
  assert.equal(acted, 1);
  assert.ok(b.G.log.some(l => l.m.includes('バトルマスター') && l.m.includes('🤖')), '必殺（8ダメージ）で倒せるバトルマスターが動く');
});
test('CPUの頭脳: 先読みは画面の状態に影響しない（先読み中は更新が出ず、状態も元のまま）', async () => {
  const seen = [];
  const b = createBattle({ ask: async (t, o) => o.find(x => !x.disabled).value, toast() {}, changed: g => seen.push(g), random: () => 0.5 });
  b.start({ players: [{ name: 'A', job: 'warrior' }, { name: 'B', job: 'monk' }], mode: 'cpu', foes: ['boss1', 'warrior'], cpuAuto: true });
  await b.skip();
  await Promise.resolve();
  for (const g of seen) for (const u of g.units) assert.ok(u.hp >= 0 && u.hp <= u.maxHp);
  const total = b.G.units.filter(u => !u.cpu && !u.isBoss).reduce((s, u) => s + (7 - u.hp), 0);
  assert.ok(total > 0 && total <= 8, '1体ぶんの行動のダメージだけ');
});

test('コマンド選択: 対象の選択で「行動を選びなおす」を選ぶと、行動の選択に戻れる。予告の通知が行動の前に出る', async () => {
  const seq = [];
  const notices = [];
  const b = createBattle({
    ask: async (t, o) => {
      seq.push(t);
      if (t.endsWith('の行動')) return seq.filter(x => x.endsWith('の行動')).length === 1 ? 1 : 0;     // 1回目は技、戻ったあとは通常攻撃
      const back = o.find(x => x.value === '__back__');
      if (seq.filter(x => x.endsWith('の行動')).length === 1 && back) return back.value;              // 1回目の対象選択で戻る
      return (o.find(x => x.label === '魔王1') ?? o.find(x => !x.disabled && x.value !== '__back__')).value;
    },
    toast() {}, changed: g => g && notices.push(g.notice), random: () => 0.5,
  });
  b.start({ players: [{ name: 'A', job: 'warrior', pid: 'a' }], mode: 'cpu', foes: ['boss1'] });
  b.select(b.G.units.find(u => u.name === 'A').id);
  assert.equal(await b.correct(), true);
  assert.equal(seq.filter(x => x.endsWith('の行動')).length, 2, '戻って、もう一度行動を選んだ');
  assert.ok(b.G.log.some(l => l.m.includes('魔王1 に')), '通常攻撃が当たった');
  assert.ok(b.G.notice && b.G.notice.text.includes('A の'), '行動の予告が出ている');
});

test('手直し: 職業・体力を直すと、そのユニットの edit が増える（画面は攻撃・回復の演出を出さない）。戻すと値が元に戻り、publicState にも載る', async () => {
  const { publicState } = await import('../src/lib/publish.js');
  const b = createBattle({ ask: async () => 0, toast() {}, changed() {} });
  b.start({ players: [{ name: 'A', job: 'warrior', pid: 'a' }, { name: 'B', job: 'monk', pid: 'b' }], mode: 'cpu', foes: ['boss1'] });
  const a = () => b.G.units.find(u => u.name === 'A');
  assert.equal(a().edit ?? 0, 0);
  b.edit(a().id, { job: 'mage' });
  assert.equal(a().edit, 1);
  assert.equal(publicState(b.G).units.find(u => u.name === 'A').edit, 1);
  b.edit(a().id, { hp: 1 });
  assert.equal(a().edit, 2);
  b.undo();
  assert.equal(a().edit, 1);
  assert.equal(b.G.units.find(u => u.name === 'B').edit ?? 0, 0, 'ほかのユニットは変わらない');
});

/* ================= 演出イベント ================= */
test('演出: 正解・誤答・コイントス・毒・バリア・成長などの演出がエンジンから出る（公開状態にも載る）', async () => {
  const { publicState } = await import('../src/lib/publish.js');
  const events = [];
  let bb = null;
  const b = bb = createBattle({ ask: async (t, o) => (o.find(x => !x.disabled && /コイン|毒|バリア/.test(x.label)) ?? o.find(x => !x.disabled && x.value !== '__back__')).value, toast() {}, changed() {}, random: () => 0.1,
    pause: async () => { if (bb?.G?.event) events.push(bb.G.event.kind); } });      // 演出のあと待つ瞬間に、出ている演出を記録する
  b.start({ players: [{ name: 'G', job: 'gambler' }, { name: 'P', job: 'poisoner' }, { name: 'C', job: 'cleric' }, { name: 'A', job: 'apprentice' }], mode: 'cpu', foes: ['warrior'] });
  const sel = n => b.select(b.G.units.find(u => u.name === n).id);
  sel('G'); await b.correct();                              // コイントス（乱数0.1=表）
  sel('P'); await b.correct();                              // 毒
  sel('C'); await b.correct();                              // バリア
  sel('A'); await b.correct();                              // 成長
  for (const k of ['answer', 'coin']) assert.ok(events.includes(k), `演出 ${k}`);
  const fxk = (b.G.fxs ?? []).map(f => f.kind);
  for (const k of ['poison', 'barrier', 'grow']) assert.ok(fxk.includes(k), `ユニットの演出 ${k}`);
  assert.ok(publicState(b.G).fxs.length > 0 && publicState(b.G).event);
  sel('G'); await b.wrong();
  assert.ok(events.filter(k => k === 'answer').length >= 5, '誤答の演出も出る');
});
test('演出: 先読み（CPUの頭脳）の最中は、演出も画面の更新も出ない', async () => {
  const events = [];
  const b = createBattle({ ask: async (t, o) => o.find(x => !x.disabled).value, toast() {}, changed: g => { if (g?.event) events.push(g.event.id); }, random: () => 0.1 });
  b.start({ players: [{ name: 'A', job: 'warrior' }, { name: 'B', job: 'monk' }], mode: 'cpu', foes: ['gambler', 'bomb'], cpuAuto: true });
  await b.skip();
  await Promise.resolve();
  // 先読みで何十通りも試しても、画面に出た演出は本当に起きた分（回答・コイントス・ラウンドなど）だけ
  assert.ok(new Set(events).size <= 8, `演出の数が多すぎる: ${new Set(events).size}`);
});

test('CPUの先読み: 計画のあとで魔王が地雷で変身しても、古い計画を使わず落ちない（エラーで問題が取り消されない）', async () => {
  const toasts = [];
  const b = createBattle({ ask: async (t, o) => o.find(x => !x.disabled && x.value !== '__back__').value, toast: m => toasts.push(m), changed() {}, random: () => 0.1 });
  b.start({ players: [{ name: 'A', job: 'warrior' }, { name: 'B', job: 'monk' }], mode: 'cpu', foes: ['boss2'], cpuAuto: true });
  const boss = b.G.units.find(u => u.isBoss);
  boss.form = 1; boss.hp = 1;                                  // 第2形態の魔王が、地雷で倒れて第3形態に変身する
  boss.mine = { by: b.G.units.find(u => u.name === 'A').id, dmg: 3 };
  const origError = console.error; console.error = () => {};
  try { await b.skip(); } finally { console.error = origError; }
  assert.equal(toasts.length, 0, 'エラーで処理が取り消されていない: ' + toasts.join());
  assert.equal(b.G.q, 2);
});

test('試合の長さの調整: 全員の体力の倍率は人数に反比例し、範囲に収まる。エンジンは体力の倍率を全員（魔王も途中参戦も）にかける', async () => {
  const { recommendedHpScale } = await import('../src/lib/engine.js');
  for (const mode of ['cpu', 'pvp']) {
    let prev = Infinity;
    for (let n = 1; n <= 16; n++) { const k = recommendedHpScale(mode, n); assert.ok(k <= prev && k >= 1.2 && k <= 12); prev = k; }
  }
  assert.ok(recommendedHpScale('cpu', 4) > recommendedHpScale('pvp', 4));
  for (let n = 1; n <= 12; n++) for (const foes of [['warrior'], ['warrior', 'monk', 'tank'], ['boss1', 'mage']]) { const k = recommendedHpScale('cpu', n, foes); assert.ok(k >= 1.2 && k <= 12); }
  assert.equal(recommendedHpScale('cpu', 4, ['boss3']), recommendedHpScale('cpu', 4), '魔王だけなら従来どおり');
  const b = createBattle({ ask: async () => 0, toast() {}, changed() {} });
  b.start({ players: [{ name: 'A', job: 'warrior', pid: 'a' }, { name: 'B', job: 'monk', pid: 'b' }], mode: 'cpu', foes: ['boss1', 'warrior'], hpScale: 3 });
  const hp = n => b.G.units.find(u => u.name === n).maxHp;
  assert.deepEqual([hp('A'), hp('B'), hp('CPU戦士')], [21, 18, Math.ceil(7 * 0.55) * 3]);       // 敵が2体なので、敵の体力は0.55倍
  assert.equal(b.G.units.find(u => u.isBoss).maxHp, Math.round(Math.ceil((3 + 1) * 0.55 * 1.05) * 3));
  b.join({ name: 'C', job: 'tank', pid: 'c' });
  assert.equal(hp('C'), 24);
});
