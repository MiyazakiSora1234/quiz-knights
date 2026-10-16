// アイテムの入念なテスト: ランダム戦闘（取り消し・キャンセル・途中参戦・離脱込み）、全職業×全アイテム、他の効果との組み合わせ
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, SELECTABLE, ITEM_KEYS, BOSS, recommendedHpScale, statusTags } from '../src/lib/engine.js';
import { publicState, eligibleDelays } from '../src/lib/publish.js';
import { rng, checkInvariants, CANCEL } from './harness.mjs';

const count = G => G.units.reduce((t, u) => t + (u.items?.length || 0), 0);

/** ランダムに戦闘を進める。メニューではアイテムを高確率で選ぶ。毎手、整合性・取り消し・持ち物の増減を検査する */
async function fuzz(seed, { mode, n, foes = [], boss = 1, items = 2, steps = 60 }) {
  const r = rng(seed);
  let used = 0;
  const b = createBattle({
    ask: async (t, o) => {
      if (r() < 0.03) throw CANCEL;
      const ok = o.filter(x => !x.disabled && x.value !== '__back__');
      assert.ok(ok.length > 0, `選べる選択肢がない: ${t}`);
      if (t.endsWith('の行動')) {
        const its = ok.filter(x => x.cls === 'item');
        if (its.length && r() < 0.7) { used++; return r.pick(its).value; }
        const acts = ok.filter(x => x.cls !== 'ghost' && x.cls !== 'item');
        return (r() < 0.8 && acts.length ? r.pick(acts) : ok.at(-1)).value;
      }
      if (t.startsWith('🛡')) return r() < 0.5 ? o.find(x => x.cls === 'ghost').value : ok[0].value;
      return r.pick(ok).value;
    },
    toast() {}, changed() {}, random: r,
  });
  const teams = ['p', 'e', 'c'];
  const players = Array.from({ length: n }, (_, i) => ({ name: 'P' + i, job: r.pick(SELECTABLE), team: mode === 'pvp' ? teams[(i % 2) + (n > 5 && i === n - 1 ? 1 : 0)] : 'p', pid: 'x' + i }));
  b.start({ players, mode, boss, foes, level: r.pick(['weak', 'normal', 'strong', 'extreme']), cpuAuto: mode === 'cpu', bossPenalty: r() < 0.5, hpScale: recommendedHpScale(mode, n, foes), items });
  const where = (k, op) => `seed=${seed} mode=${mode} foes=${foes} step=${k} op=${op}`;
  checkInvariants(b.G, where(0, 'start'));
  let prev = count(b.G);
  for (let k = 1; k <= steps && !b.G.over; k++) {
    const x = r(), G = b.G;
    const alive = G.units.filter(u => (u.alive || u.ghost) && !u.restNow && !u.isBoss && !u.cpu);
    let op;
    if (!alive.length || x < 0.08) { op = 'skip'; await b.skip(); }
    else if (x < 0.14) { op = 'undo'; b.undo(); prev = count(b.G); }
    else if (x < 0.18) { op = 'join'; b.join({ name: 'L' + k, job: r.pick(SELECTABLE), team: r.pick(['p', 'e']), pid: 'l' + k }); prev = count(b.G); }
    else if (x < 0.21) { op = 'leave'; const pids = Object.keys(G.pids); if (pids.length > 2) b.leave(r.pick(pids)); prev = count(b.G); }
    else {
      const u = r.pick(alive); b.select(u.id);
      const before = JSON.stringify(b.G);
      op = 'answer';
      const ok = await (r() < 0.6 ? b.correct() : b.wrong({ retry: r() < 0.3 }));
      if (!ok) assert.equal(JSON.stringify(b.G).replace(/"sel":\d+/, ''), before.replace(/"sel":\d+/, ''), where(k, 'キャンセル後に戻っていない'));
    }
    checkInvariants(b.G, where(k, op));
    JSON.parse(JSON.stringify(b.G));
    const now = count(b.G);
    if (op === 'answer' || op === 'skip') assert.ok(now <= prev, where(k, `持ち物が増えた ${prev}->${now}`));
    prev = now;
  }
  return { used, over: b.G.over };
}

function suite(name, from, to, opt) {
  test(`[アイテム乱戦] ${name}`, async () => {
    let used = 0;
    for (let s = from; s < to; s++) { const o = typeof opt === 'function' ? opt(s) : opt; used += (await fuzz(s, o)).used; }
    assert.ok(used > (to - from), '一定数のアイテムが使われている');
  });
}
for (const bs of Object.keys(BOSS)) suite(`CPU戦 魔王${bs}`, 100 * bs, 100 * bs + 80, s => ({ mode: 'cpu', boss: +bs, foes: ['boss' + bs], n: 2 + (s % 5), items: 1 + (s % 3) }));
suite('職業のCPUが相手', 1000, 1300, s => ({ mode: 'cpu', foes: [['warrior'], ['monk', 'bm'], ['tank', 'cleric', 'bomb'], ['ghost', 'jester', 'mimic', 'gambler']][s % 4], n: 2 + (s % 5), items: 2 }));
suite('魔王と職業のCPU', 2000, 2150, s => ({ mode: 'cpu', foes: ['boss' + (1 + (s % 6)), 'warrior', 'monk'], n: 2 + (s % 4), items: 2 }));
suite('ユーザー対戦（2〜3チーム）', 3000, 3300, s => ({ mode: 'pvp', n: 3 + (s % 6), items: 1 + (s % 3) }));
suite('アイテムたくさん（10個）', 4000, 4100, s => ({ mode: s % 2 ? 'pvp' : 'cpu', boss: 1 + (s % 6), foes: s % 2 ? [] : ['boss' + (1 + (s % 6))], n: 3 + (s % 4), items: 10, steps: 80 }));
test('[アイテム乱戦] 同じ種なら同じ結果（配られる物も使われ方も）', async () => {
  const o = { mode: 'cpu', foes: ['boss4'], boss: 4, n: 4 };
  assert.deepEqual(await fuzz(31337, o), await fuzz(31337, o));
});

/* ===== 全職業 × 全アイテム ===== */
test('[アイテム網羅] 全職業 × 全アイテム: 使えて、持ち物が1個減り、整合性が保たれ、行動も続けて選べる', async () => {
  for (const job of [...SELECTABLE, 'hero']) for (const key of ITEM_KEYS) {
    const menus = [];
    const b = createBattle({
      ask: async (t, o) => {
        const ok = o.filter(x => !x.disabled && x.value !== '__back__');
        if (t.endsWith('の行動')) { menus.push(o.map(x => x.cls)); return menus.length === 1 ? ok.find(x => x.cls === 'item').value : (ok.find(x => x.cls !== 'item' && x.cls !== 'ghost')?.value ?? -1); }
        return ok[0].value;
      },
      toast() {}, changed() {}, random: rng(7),
    });
    b.start({ players: [{ name: 'A', job, team: 'p' }, { name: 'B', job: 'monk', team: 'p' }, { name: 'C', job: 'warrior', team: 'e' }, { name: 'D', job: 'tank', team: 'e' }], mode: 'pvp' });
    const A = b.G.units[0];
    A.items = [key]; A.hp = Math.max(2, A.maxHp - 2);
    if (key === 'feather') { b.G.units[1].alive = false; b.G.units[1].hp = 0; }
    if (key === 'herb') A.poison = 1;
    if (key === 'alarm') A.restNext = true;
    const label = `${job} × ${key}`;
    b.select(A.id);
    assert.ok(await b.correct(), label + ' が成立しない');
    assert.deepEqual(b.G.units[0].items, [], label + ' が減っていない');
    assert.ok(menus.length >= 2, label + ' アイテムのあとに行動が選べない');
    checkInvariants(b.G, label);
  }
});

/* ===== 他の効果との組み合わせ ===== */
function duel(setup, key, answer, pickFn) {
  const asks = [], script = [...answer];
  const b = createBattle({
    ask: async (t, o) => {
      asks.push(t);
      const ok = o.filter(x => !x.disabled && x.value !== '__back__');
      if (t.endsWith('の行動')) return script.length ? script.shift() : -1;
      const v = pickFn ? pickFn(t, ok) : undefined;
      return v !== undefined ? v : ok[0].value;
    },
    toast() {}, changed() {}, random: rng(3),
  });
  b.start({ players: [{ name: 'A', job: 'warrior', team: 'p' }, { name: 'B', job: 'monk', team: 'p' }, { name: 'T', job: 'tank', team: 'e' }, { name: 'X', job: 'bomb', team: 'e' }], mode: 'pvp' });
  const by = n => b.G.units.find(u => u.name === n);
  by('A').items = [key];
  setup(by, b);
  b.select(by('A').id);
  return { b, by, asks, run: () => b.correct() };
}
const label = n => (t, ok) => (t.startsWith('🛡') ? ok.find(x => x.cls === 'ghost').value : ok.find(x => x.label === n)?.value);      // タンクの庇いは断る

test('[アイテム×効果] 爆弾はタンクに庇われる（庇う権利を1つ使う）', async () => {
  const d = duel(() => {}, 'bomb', ['item:0', -1], (t, ok) => (t.startsWith('🛡') ? ok.find(x => x.cls === 'ok').value : label('X')(t, ok)));
  await d.run();
  assert.equal(d.by('X').hp, d.by('X').maxHp);
  assert.equal(d.by('T').hp, d.by('T').maxHp - 2);
  assert.equal(d.by('T').guards, 0);
});
test('[アイテム×効果] バリア持ちには石つぶてが無効。バリアは1回で消える', async () => {
  const d = duel(by => { by('X').barrier = 1; }, 'pebble', ['item:0', -1], label('X'));
  await d.run();
  assert.equal(d.by('X').hp, d.by('X').maxHp);
  assert.equal(d.by('X').barrier, 0);
});
test('[アイテム×効果] ばくだんいわを爆弾で倒すと爆発する。爆発のあとも整合性が保たれる', async () => {
  const d = duel(by => { by('X').hp = 2; }, 'bomb', ['item:0', -1], label('X'));
  await d.run();
  assert.equal(d.by('X').alive, false);
  assert.ok(d.by('A').hp < d.by('A').maxHp, '爆発で巻き込まれる');
  checkInvariants(d.b.G, '爆発');
});
test('[アイテム×効果] 最後の敵をアイテムで倒すと、その場で決着がつく', async () => {
  const d = duel(by => { by('T').hp = 0; by('T').alive = false; by('X').hp = 1; by('X').job = 'warrior'; }, 'pebble', ['item:0', -1], label('X'));
  await d.run();
  assert.equal(d.b.G.over, 'teamp');
  checkInvariants(d.b.G, '決着');
});
test('[アイテム×効果] 自滅するアイテム（呪いの人形）で味方が全滅したら、相手チームの勝ち', async () => {
  const d = duel(by => { by('A').hp = 1; by('B').alive = false; by('B').hp = 0; }, 'doll', ['item:0', -1], label('X'));
  await d.run();
  assert.equal(d.by('A').alive, false);
  assert.equal(d.b.G.over, 'teame');
  checkInvariants(d.b.G, '自滅');
});
test('[アイテム×効果] 目覚ましベル: 「次の問題休み」を取り消す', async () => {
  const d = duel(by => { by('B').restNext = true; }, 'alarm', ['item:0', -1], label('B'));
  await d.run();
  assert.equal(d.by('B').restNow, false);
});
test('[アイテム×効果] 眠りの粉の相手は次の問題に押せない（受付から外れる）', async () => {
  const d = duel(() => {}, 'powder', ['item:0', -1], label('X'));
  await d.run();
  d.b.G.pids.x = d.by('X').id;
  assert.ok(!('x' in eligibleDelays(d.b.G)));
});
test('[アイテム×効果] 足かせの相手の受付にディレイ（0.7秒）がつく', async () => {
  const d = duel(() => {}, 'shackle', ['item:0', -1], label('X'));
  await d.run();
  d.b.G.pids.x = d.by('X').id;
  assert.equal(eligibleDelays(d.b.G).x, 700);
});
test('[アイテム×効果] 小さな地雷: 仕掛けた事実は参加者に見えない', async () => {
  const d = duel(() => {}, 'landmine', ['item:0', -1], label('X'));
  await d.run();
  const x = d.by('X');
  assert.deepEqual(x.mine && x.mine.dmg, 1);
  assert.ok(!statusTags(x, false).some(t => t.t.includes('地雷')));
});
test('[アイテム×効果] 複数のアイテムを続けて使える（同じ種類でも1個ずつ）', async () => {
  const d = duel(() => {}, 'pebble', ['item:0', 'item:0', 'item:0', -1], label('X'));
  d.by('A').items = ['pebble', 'pebble', 'pebble'];
  await d.run();
  assert.equal(d.by('X').hp, d.by('X').maxHp - 3);
  assert.deepEqual(d.by('A').items, []);
});

/* ===== 参加者への配信・画面向けの情報 ===== */
test('[アイテム配信] 参加者向けの状態には、持ち物の個数だけ出る（中身は含まない）', () => {
  const b = createBattle({ ask: async () => 0, toast() {}, changed() {}, random: rng(5) });
  b.start({ players: [{ name: 'A', job: 'warrior', team: 'p' }, { name: 'B', job: 'monk', team: 'e' }], mode: 'pvp', items: 3 });
  const json = JSON.stringify(publicState(b.G));
  for (const k of ITEM_KEYS) assert.ok(!json.includes(`"${k}"`), `${k} が漏れている`);
  assert.ok(publicState(b.G).units.every(u => u.st.some(t => t.t === '🎒×3')));
  b.G.units[0].items = [];
  assert.ok(!publicState(b.G).units[0].st.some(t => t.t.startsWith('🎒')));
});
test('[アイテム配信] 行動メニューは本人の端末あてで、送れる形（文字列と真偽値だけ）になっている', async () => {
  let menu;
  const b = createBattle({ ask: async (t, o, opt) => { if (t.endsWith('の行動')) { menu = { o, opt }; return -1; } return o[0].value; }, toast() {}, changed() {}, random: rng(2) });
  b.start({ players: [{ name: 'A', job: 'warrior', team: 'p', pid: 'pa' }, { name: 'B', job: 'monk', team: 'e', pid: 'pb' }], mode: 'pvp', items: 1 });
  b.select(b.G.units[0].id);
  await b.correct();
  assert.equal(menu.opt.actor, b.G.units[0].id);
  JSON.parse(JSON.stringify(menu.o));
  const it = menu.o.find(x => x.cls === 'item');
  assert.ok(it && typeof it.label === 'string' && typeof it.sub === 'string' && typeof it.value === 'string');
});

/* ===== 数値の安全性 ===== */
test('[アイテム数値] どのアイテムも1回で与えるダメージ・回復量は小さい（強すぎない）', async () => {
  for (const key of ITEM_KEYS) {
    let n = 0;
    const b = createBattle({ ask: async (t, o) => { const ok = o.filter(x => !x.disabled && x.value !== '__back__'); if (t.endsWith('の行動')) return n++ ? -1 : ok.find(x => x.cls === 'item').value; return ok[0].value; }, toast() {}, changed() {}, random: rng(9) });
    b.start({ players: [{ name: 'A', job: 'cleric', team: 'p' }, { name: 'B', job: 'cleric', team: 'p' }, { name: 'C', job: 'cleric', team: 'e' }, { name: 'D', job: 'cleric', team: 'e' }], mode: 'pvp' });
    for (const u of b.G.units) { u.maxHp = u.hp = 20; }
    const A = b.G.units[0]; A.items = [key];
    if (key === 'feather') { b.G.units[1].alive = false; b.G.units[1].hp = 0; }
    if (key === 'herb') A.poison = 1;
    if (key === 'alarm') A.restNext = true;
    const before = b.G.units.map(u => (u.alive ? u.hp : 0));
    b.select(A.id);
    await b.correct();
    const delta = b.G.units.map((u, i) => u.hp - before[i]);
    const dmg = -delta.filter(d => d < 0).reduce((s, d) => s + d, 0);
    const heal = delta.filter(d => d > 0).reduce((s, d) => s + d, 0);
    assert.ok(dmg <= 4, `${key}: 与ダメージ合計 ${dmg}`);
    assert.ok(heal <= 10, `${key}: 回復合計 ${heal}`);
  }
});
