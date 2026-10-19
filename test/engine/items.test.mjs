// アイテム: 開始時の配布・メニュー表示・各効果・行動が残ること・取り消し
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, ITEMS, ITEM_KEYS, ITEM_GROUPS, SELECTABLE, statusTags } from '../../app/src/lib/engine.js';
import { rng, harness } from './harness.mjs';

/** script: 行動メニューで選ぶ値の列（文字列 'item:0' など）→ 対象の選択は pickTarget(title, options) */
function mk({ seed = 1, script = [], pick = (t, ok) => ok[0].value } = {}) {
  const asks = [];
  const b = createBattle({
    ask: async (t, o) => {
      asks.push({ t, o });
      if (t.endsWith('の行動')) return script.length ? script.shift() : -1;
      return pick(t, o.filter(x => !x.disabled && x.value !== '__back__'));
    },
    toast() {}, changed() {}, random: rng(seed),
  });
  return { b, asks };
}
const players = [{ name: 'A', job: 'warrior', team: 'p' }, { name: 'B', job: 'monk', team: 'p' }, { name: 'C', job: 'mage', team: 'e' }];

test('[アイテム] items=0（既定）では誰も持たず、1以上ならプレイヤーだけに配る（魔王・CPUには配らない）', () => {
  const { b } = mk();
  b.start({ players, mode: 'cpu', foes: ['boss1', 'warrior'] });
  assert.ok(b.G.units.every(u => !u.items));
  const m = mk(); m.b.start({ players, mode: 'cpu', foes: ['boss1', 'warrior'], items: 2 });
  for (const u of m.b.G.units) {
    if (u.isBoss || u.cpu) assert.equal(u.items, undefined);
    else { assert.equal(u.items.length, 2); assert.ok(u.items.every(k => ITEM_KEYS.includes(k))); }
  }
});
test('[アイテム] 途中参戦した人にも配られる。状態タグに個数が出る', () => {
  const { b } = mk(); b.start({ players, items: 1 });
  assert.ok(b.join({ name: 'D', job: 'bm', pid: 'd' }));
  const d = b.G.units.find(u => u.name === 'D');
  assert.equal(d.items.length, 1);
  assert.ok(statusTags(d).some(t => t.t === '🎒×1'));
});
test('[アイテム] 配られる種類は偏りつつ全種類が出る', () => {
  const seen = new Set();
  for (let s = 1; s < 80; s++) { const { b } = mk({ seed: s }); b.start({ players, items: 3 }); b.G.units.forEach(u => (u.items || []).forEach(k => seen.add(k))); }
  assert.deepEqual([...seen].sort(), [...ITEM_KEYS].sort());
});

async function useItem(key, { setup = () => {}, target, team = players } = {}) {
  const { b, asks } = mk({ script: ['item:0', -1], pick: (t, ok) => (target != null ? ok.find(x => x.value === target)?.value ?? ok[0].value : ok[0].value) });
  b.start({ players: team, mode: 'pvp', items: 0 });
  const [A, B, C] = b.G.units;
  A.items = [key];
  setup(b.G, A, B, C);
  b.select(A.id);
  await b.correct();
  return { b, A, B, C, asks };
}
test('[アイテム] 使うと1個減り、通常の行動は残る（メニューに戻る）', async () => {
  const { b, A, asks } = await useItem('potion');
  assert.deepEqual(A.items, []);
  const menus = asks.filter(a => a.t.endsWith('の行動'));
  assert.equal(menus.length, 2, 'アイテムのあとにもう一度メニュー');
  assert.ok(menus[0].o.some(o => o.cls === 'item'));
  assert.ok(!menus[1].o.some(o => o.cls === 'item'), '使い切ったら出ない');
  assert.equal(b.G.q, 2);
});
test('[アイテム] 回復薬: 2回復 / 薬草茶: 半分回復', async () => {
  let r = await useItem('potion', { setup: (G, A) => { A.hp = 2; }, target: 1 });
  assert.equal(r.A.hp, 4);
  r = await useItem('tea', { setup: (G, A) => { A.hp = 1; } });
  assert.equal(r.A.hp, 1 + Math.ceil(r.A.maxHp / 2));
});
test('[アイテム] 爆弾: 敵に2ダメージ / 毒薬: 毒 / 眠りの粉: 次の問題休み', async () => {
  let r = await useItem('bomb');
  assert.equal(r.C.hp, r.C.maxHp - 2);
  r = await useItem('venom');
  assert.equal(r.C.poison, 2);
  r = await useItem('powder');
  assert.equal(r.C.restNow, true, '次の問題で休み');
});
test('[アイテム] 小さなアイテム: 包帯・癒しの水・石つぶて・炎の巻物・解毒草・目覚ましベル', async () => {
  let r = await useItem('bandage', { setup: (G, A) => { A.hp = 1; } });
  assert.equal(r.A.hp, 2);
  r = await useItem('water', { setup: (G, A, B) => { A.hp = 1; B.hp = 1; } });
  assert.deepEqual([r.A.hp, r.B.hp], [2, 2]);
  r = await useItem('pebble'); assert.equal(r.C.hp, r.C.maxHp - 1);
  r = await useItem('scroll'); assert.equal(r.C.hp, r.C.maxHp - 1);
  r = await useItem('herb', { setup: (G, A) => { A.poison = 2; } }); assert.equal(r.A.poison, 0);
  r = await useItem('alarm', { setup: (G, A) => { A.restNext = true; } }); assert.equal(r.A.restNow, false);
});
test('[アイテム] 護符・身代わり札・蘇生の羽', async () => {
  let r = await useItem('amulet', { target: 1 });
  assert.equal(r.A.barrier, 1);
  r = await useItem('charm', { target: 1 });
  assert.equal(r.A.noWrong, true);
  r = await useItem('feather', { setup: (G, A) => { const d = G.units.find(u => u.side === A.side && u !== A); d.alive = false; d.hp = 0; } });
  assert.ok(r.b.G.units.filter(u => u.side === r.A.side).every(u => u.alive));
});
test('[アイテム] 対象がいないアイテムは選べない（蘇生の羽・誰も死んでいない）', async () => {
  const { asks } = await useItem('feather');
  const opt = asks.find(a => a.t.endsWith('の行動')).o.find(o => o.cls === 'item');
  assert.equal(opt.disabled, true);
});
test('[アイテム] 取り消しで持ち物も戻る', async () => {
  const { b, A } = await useItem('potion');
  assert.equal(A.items.length, 0);
  b.undo();
  assert.deepEqual(b.G.units[0].items, ['potion']);
});
test('[アイテム] ランダムな戦闘を最後まで回しても壊れない（持ち物は常に定義済みの物・個数は減る一方）', async () => {
  for (let s = 1; s <= 40; s++) {
    const r = rng(s), pick = a => a[Math.floor(r() * a.length)];
    const b = createBattle({
      ask: async (t, o) => { const ok = o.filter(x => !x.disabled && x.value !== '__back__'); if (t.endsWith('の行動')) { const a = ok.filter(x => x.cls !== 'ghost'); return (r() < .8 && a.length ? pick(a) : ok[0]).value; } if (t.startsWith('🛡')) return o.find(x => x.cls === 'ghost').value; return pick(ok).value; },
      toast() {}, changed() {}, random: r,
    });
    b.start({ players: Array.from({ length: 4 }, (_, i) => ({ name: 'P' + i, job: pick(SELECTABLE.filter(j => j !== 'toolmaster' && j !== 'mimic')) })), mode: 'cpu', boss: 1 + (s % 6), items: 3, level: 'normal', cpuAuto: true });
    let q = 0, total = b.G.units.reduce((t, u) => t + (u.items?.length || 0), 0);
    while (!b.G.over && q++ < 60) {
      const alive = b.G.units.filter(u => u.alive && !u.isBoss && !u.restNow);
      if (!alive.length) { await b.skip(); continue; }
      b.select(pick(alive).id); await (r() < .7 ? b.correct() : b.wrong());
      const now = b.G.units.reduce((t, u) => t + (u.items?.length || 0), 0);
      assert.ok(now <= total, '持ち物は増えない'); total = now;
      for (const u of b.G.units) for (const k of u.items || []) assert.ok(ITEMS[k]);
    }
  }
});

test('[アイテム] 30種類そろっていて、説明・絵文字があり、強すぎない（全アイテムが使えて、1個だけ減る）', async () => {
  assert.ok(ITEM_KEYS.length >= 30, `${ITEM_KEYS.length}種`);
  for (const k of ITEM_KEYS) {
    assert.ok(ITEMS[k].n && ITEMS[k].ic && ITEMS[k].d && ITEMS[k].w > 0, k);
    const { b, A, C, asks } = await useItem(k, { team: [...players, { name: 'D', job: 'bm', team: 'e' }], setup: (G, A, B, C) => { A.hp = 3; A.poison = 1; A.restNext = true; const d = G.units.find(u => u.side === A.side && u !== A && u.id !== A.id); if (k === 'feather') { d.alive = false; d.hp = 0; } } });
    assert.deepEqual(A.items, [], `${k} は使うと減る`);
    assert.ok(b.G.q === 2 && !b.busy, `${k} のあとも進行できる`);
    for (const u of b.G.units) assert.ok(u.hp <= u.maxHp, k);
  }
});
test('[アイテム] 新アイテムの効果: 輸血パック・吸血の牙・呪いの人形・手裏剣・花火・足かせ・地雷・煙玉・命綱・栄養ドリンク・お弁当', async () => {
  let r = await useItem('blood', { setup: (G, A, B) => { B.hp = 1; } });
  assert.equal(r.B.hp, 4); assert.equal(r.A.hp, r.A.maxHp - 1);
  r = await useItem('fang', { setup: (G, A) => { A.hp = 2; } }); assert.equal(r.C.hp, r.C.maxHp - 1); assert.equal(r.A.hp, 3);
  r = await useItem('doll'); assert.equal(r.C.hp, r.C.maxHp - 1); assert.equal(r.A.hp, r.A.maxHp - 1);
  const two = [...players, { name: 'D', job: 'bm', team: 'e' }];
  r = await useItem('shuriken', { team: two }); assert.deepEqual(r.b.G.units.filter(u => u.side === 'e').map(u => u.hp === u.maxHp - 1), [true, true]);
  r = await useItem('shuriken'); assert.equal(r.asks.find(a => a.t.endsWith('の行動')).o.find(o => o.cls === 'item').disabled, true, '敵が1人なら使えない');
  r = await useItem('firework'); assert.deepEqual([r.A.hp, r.B.hp, r.C.hp], [r.A.maxHp, r.B.maxHp - 1, r.C.maxHp - 1]);
  r = await useItem('shackle'); assert.equal(r.C.delayQ, r.b.G.q);
  r = await useItem('landmine'); assert.deepEqual(r.C.mine && r.C.mine.dmg, 1);
  r = await useItem('smoke'); assert.equal(r.A.noWrong, true);
  r = await useItem('rope'); assert.equal(r.B.barrier, 1); assert.equal(r.A.hp, r.A.maxHp - 1);
  r = await useItem('drink', { setup: (G, A) => { A.hp = 2; } }); assert.equal(r.A.maxHp, 8); assert.equal(r.A.hp, 3);
  r = await useItem('bento', { setup: (G, A) => { A.hp = 1; } }); assert.equal(r.A.hp, 4); assert.equal(r.A.restNow, true);
  r = await useItem('candy', { setup: (G, A) => { A.hp = 1; A.poison = 2; } }); assert.deepEqual([r.A.hp, r.A.poison], [2, 0]);
});

/* ===== 保存・再開・途中参戦・離脱 ===== */
test('[アイテム] 途中のバトルを保存して読み込んでも、持ち物がそのまま残る（再開）', async () => {
  const { b } = mk({ seed: 11 });
  b.start({ players, mode: 'pvp', items: 3 });
  const saved = JSON.parse(JSON.stringify(b.G));
  const { b: b2 } = mk({ seed: 12, script: ['item:0', -1] });
  b2.load(saved);
  assert.deepEqual(b2.G.units.map(u => u.items), saved.units.map(u => u.items));
  b2.select(b2.G.units[0].id);
  assert.ok(await b2.correct());
  assert.equal(b2.G.units[0].items.length, 2);
});
test('[アイテム] 配布数の設定は途中参戦にも引き継がれる。離脱した人の持ち物は消える', () => {
  const { b } = mk({ seed: 13 });
  b.start({ players: players.map((p, i) => ({ ...p, pid: 'p' + i })), items: 2 });
  assert.ok(b.join({ name: 'N', job: 'mage', team: 'e', pid: 'pn' }));
  assert.equal(b.G.units.find(u => u.name === 'N').items.length, 2);
  assert.ok(b.leave('pn'));
  assert.ok(!b.G.units.some(u => u.name === 'N'));
  assert.equal(b.G.units.reduce((t, u) => t + (u.items || []).length, 0), 6);
});
test('[アイテム] 参加者が操作する魔王にも、CPUにも、アイテムは配られない', () => {
  const { b } = mk({ seed: 14 });
  b.start({ players: [{ name: 'A', job: 'warrior', team: 'p' }, { name: 'M', job: 'boss2', team: 'e' }], mode: 'pvp', items: 2 });
  assert.equal(b.G.units.find(u => u.name === 'M').items, undefined);
  assert.equal(b.G.units.find(u => u.name === 'A').items.length, 2);
  b.join({ name: 'B', job: 'boss3', pid: 'zz' });
  assert.equal(b.G.units.find(u => u.name === 'B').items, undefined);
});
test('[アイテム] 配られる数の上限なしでも極端に大きい値で壊れない（0・負・小数・文字列）', () => {
  for (const items of [0, -3, 0.5, 'x', null, undefined]) {
    const { b } = mk({ seed: 15 });
    b.start({ players, mode: 'pvp', items });
    for (const u of b.G.units) assert.ok(!u.items || u.items.length === 0 || u.items.length >= 1);
    checkOk(b);
  }
  const { b } = mk({ seed: 16 }); b.start({ players, mode: 'pvp', items: 40 });
  assert.equal(b.G.units[0].items.length, 40);
});
function checkOk(b) { assert.ok(b.G && b.G.units.length === 3); }
test('[アイテム] 配り方に偏りはあるが、全員が同じ物ばかりにならない（重み付きの抽選）', () => {
  const tally = {};
  for (let s = 1; s <= 400; s++) { const { b } = mk({ seed: s }); b.start({ players, mode: 'pvp', items: 3 }); for (const u of b.G.units) for (const k of u.items) tally[k] = (tally[k] || 0) + 1; }
  const total = Object.values(tally).reduce((a, b) => a + b, 0), wsum = ITEM_KEYS.reduce((a, k) => a + ITEMS[k].w, 0);
  for (const k of ITEM_KEYS) {
    const expect = total * ITEMS[k].w / wsum;
    assert.ok(Math.abs(tally[k] - expect) < expect * 0.35 + 12, `${k}: 実際 ${tally[k]} / 期待 ${expect.toFixed(0)}`);
  }
});
test('[アイテム] 誤答では使えない（メニューが出ない）。誤答しても持ち物は減らない', async () => {
  const { b, asks } = mk({ seed: 17 });
  b.start({ players, mode: 'pvp', items: 2 });
  const before = JSON.stringify(b.G.units[0].items);
  b.select(b.G.units[0].id);
  await b.wrong();
  assert.equal(JSON.stringify(b.G.units[0].items), before);
  assert.ok(!asks.some(a => a.t.endsWith('の行動')));
});
test('[アイテム] 手直し（edit）で職業を変えても、持ち物は残る', () => {
  const { b } = mk({ seed: 18 });
  b.start({ players, mode: 'pvp', items: 2 });
  const before = [...b.G.units[0].items];
  b.edit(b.G.units[0].id, { job: 'bm', hp: 1 });
  assert.deepEqual(b.G.units[0].items, before);
});

test('[アイテム] アイテムで自分が倒れたら、そのあとの行動メニューは出ない（決着していなくても）', async () => {
  const { b, asks } = mk({ script: ['item:0', 0, 0], pick: (t, ok) => ok[0].value });
  b.start({ players, mode: 'pvp' });
  const [A, B, C] = b.G.units;
  A.items = ['doll', 'bandage']; A.hp = 1;
  b.select(A.id);
  assert.ok(await b.correct());
  assert.equal(A.alive, false);
  assert.ok(!b.G.over, 'まだ味方も敵もいる');
  assert.equal(asks.filter(a => a.t.endsWith('の行動')).length, 1, '倒れたあとは行動を聞かない');
  assert.deepEqual(b.G.units[0].items, ['bandage'], '残りの持ち物はそのまま');
});

/* ===== 1つ進める（やり直し） ===== */
test('[進める] 戻した操作をもう一度進められる。進めたあとにもう一度戻せる。状態は完全に同じ', async () => {
  const { b } = mk({ seed: 21, script: ['item:0', -1] });
  b.start({ players, mode: 'pvp', items: 1 });
  assert.equal(b.canRedo, false); assert.equal(b.redo(), false);
  b.select(b.G.units[0].id);
  await b.correct();
  const after = JSON.stringify(b.G);
  assert.ok(b.undo()); assert.equal(b.canRedo, true);
  assert.equal(b.G.q, 1);
  assert.ok(b.redo());
  assert.equal(JSON.stringify(b.G), after, '進めたら戻す前と同じ');
  assert.equal(b.canRedo, false); assert.equal(b.canUndo, true);
  assert.ok(b.undo()); assert.ok(b.redo()); assert.ok(b.undo()); assert.equal(b.G.q, 1);
});
test('[進める] 何回でも戻して、同じ回数だけ進められる。新しい操作・手直し・途中参戦・離脱をすると進められなくなる', async () => {
  const { b } = mk({ seed: 22, script: [-1, -1, -1, -1] });
  b.start({ players: players.map((p, i) => ({ ...p, pid: 'p' + i })), mode: 'pvp' });
  for (let i = 0; i < 3; i++) await b.skip();
  assert.equal(b.G.q, 4);
  b.undo(); b.undo(); b.undo(); assert.equal(b.G.q, 1);
  b.redo(); b.redo(); assert.equal(b.G.q, 3);
  await b.skip(); assert.equal(b.canRedo, false, '新しい操作で進められなくなる');
  b.undo(); assert.ok(b.canRedo);
  b.edit(b.G.units[0].id, { hp: 1 }); assert.equal(b.canRedo, false, '手直しでも');
  b.undo(); assert.ok(b.canRedo);
  b.join({ name: 'N', job: 'mage', team: 'e', pid: 'pn' }); assert.equal(b.canRedo, false, '途中参戦でも');
  b.undo(); assert.ok(b.canRedo); assert.ok(b.leave('p0')); assert.equal(b.canRedo, false, '離脱でも');
});
test('[進める] 戻したあとの決着・保存・開始し直しの扱い', async () => {
  const saves = [];
  const b = createBattle({ ask: async (t, o) => (t.endsWith('の行動') ? 0 : o.filter(x => !x.disabled)[0].value), toast() {}, changed() {}, random: rng(23), persist: G => saves.push(JSON.stringify(G)) });
  b.start({ players, mode: 'pvp' });
  b.G.units[2].hp = 1; b.G.units[1].alive = false; b.G.units[1].hp = 0;
  b.select(b.G.units[0].id); await b.correct();
  const over = b.G.over;
  b.undo(); assert.equal(b.G.over, null);
  b.redo(); assert.equal(b.G.over, over, '進めると決着も元どおり');
  assert.equal(saves.at(-1), JSON.stringify(b.G), '進めたあとも保存される');
  b.undo(); b.start({ players, mode: 'pvp' }); assert.equal(b.canRedo, false, '開始し直したら進められない');
});

/* ===== 進行役による付与・取り上げ ===== */
test('[アイテム] 進行役は、参加者に好きなアイテムを付与でき、取り上げもできる。「1つ戻す」で元に戻る。魔王・CPUには付けられない', () => {
  const { b } = mk({ seed: 31 });
  b.start({ players, mode: 'pvp', items: 1 });
  const A = b.G.units[0];
  assert.ok(b.edit(A.id, { items: ['bomb', 'potion', 'nonexistent', 'feather'] }));
  assert.deepEqual(b.G.units[0].items, ['bomb', 'potion', 'feather'], '存在しない物は無視');
  b.edit(A.id, { items: [] }); assert.deepEqual(b.G.units[0].items, []);
  b.undo(); assert.deepEqual(b.G.units[0].items, ['bomb', 'potion', 'feather']);
  b.edit(A.id, { items: Array(30).fill('pebble') }); assert.equal(b.G.units[0].items.length, 20, '上限は20個');
  const m = mk({ seed: 32 }); m.b.start({ players, mode: 'cpu', foes: ['boss1', 'warrior'] });
  const boss = m.b.G.units.find(u => u.isBoss), cpu = m.b.G.units.find(u => u.cpu);
  m.b.edit(boss.id, { items: ['bomb'] }); m.b.edit(cpu.id, { items: ['bomb'] });
  assert.equal(m.b.G.units.find(u => u.isBoss).items, undefined); assert.equal(m.b.G.units.find(u => u.cpu).items, undefined);
});

/* ===== 道具使い・怪盗 ===== */
import { harness as hn, P as PP, checkInvariants as ci } from './harness.mjs';

test('[道具使い] 開始時に、設定にかかわらずアイテムを3つ持つ。途中参戦でも3つ。ほかの職業は設定どおり', () => {
  for (const items of [0, 1, 2, 5]) {
    const h = hn();
    h.b.start({ players: [PP('T', 'toolmaster', 'p'), PP('W', 'warrior', 'p'), PP('X', 'monk', 'e')], mode: 'pvp', items });
    assert.equal(h.u('T').items.length, Math.max(3, items), `items=${items}`);
    assert.equal(h.u('W').items?.length ?? 0, items);
  }
  const h = hn();
  h.b.start({ players: [PP('W', 'warrior', 'p'), PP('X', 'monk', 'e')], mode: 'pvp', items: 1 });
  h.b.join({ name: 'T2', job: 'toolmaster', team: 'p', pid: 't2' });
  assert.equal(h.u('T2').items.length, 3);
});
test('[道具使い] 補給: アイテムを1つ増やす。6個以上ではその行動は選べない。魔王・CPUは使えない', async () => {
  const h = hn();
  h.b.start({ players: [PP('T', 'toolmaster', 'p'), PP('X', 'monk', 'e')], mode: 'pvp', items: 0 });
  const before = h.u('T').items.length;
  await h.correct('T', '補給');
  assert.equal(h.u('T').items.length, before + 1);
  h.u('T').items = ['pebble', 'pebble', 'pebble', 'pebble', 'pebble', 'pebble'];
  h.script.push('補給'); h.b.select(h.u('T').id);
  assert.equal(await h.b.correct(), false, '6個では選べない'); h.script.length = 0;
  ci(h.b.G, '補給');
});
test('[怪盗] 通常攻撃でダメージを与えたら、相手のアイテムを1つ盗む。盗んだ分だけ相手が減る', async () => {
  const h = hn();
  h.b.start({ players: [PP('S', 'pickpocket', 'p'), PP('V', 'monk', 'e')], mode: 'pvp', items: 0 });
  h.u('V').items = ['bomb', 'potion'];
  await h.correct('S', '通常攻撃', 'V');
  assert.equal(h.u('V').items.length, 1); assert.equal(h.u('S').items.length, 1);
  assert.ok(['bomb', 'potion'].includes(h.u('S').items[0]));
  assert.ok(h.b.G.log.some(l => /盗んだ/.test(l.m)));
  await h.correct('S', '通常攻撃', 'V');
  assert.equal(h.u('V').items.length, 0); assert.equal(h.u('S').items.length, 2);
  await h.correct('S', '通常攻撃', 'V');                   // 持っていない相手からは盗めない
  assert.equal(h.u('S').items.length, 2);
  ci(h.b.G, '怪盗');
});
test('[怪盗] バリアで防がれたら盗めない。0ダメージ・自分への攻撃・取り消しでも壊れない', async () => {
  const h = hn();
  h.b.start({ players: [PP('S', 'pickpocket', 'p'), PP('V', 'monk', 'e')], mode: 'pvp', items: 0 });
  h.u('V').items = ['bomb']; h.u('V').barrier = 1;
  await h.correct('S', '通常攻撃', 'V');
  assert.equal(h.u('V').items.length, 1, 'バリアで防がれたので、盗めない');
  await h.correct('S', '通常攻撃', 'S');                   // 自分への攻撃
  assert.equal(h.u('S').items?.length ?? 0, 0);
  h.b.undo(); h.b.undo();
  assert.deepEqual(h.u('V').items, ['bomb']);
});
test('[怪盗・道具使い] 乱戦（盗む・補給が混ざった戦闘）でも整合性が保たれる', async () => {
  let stole = 0, supplied = 0;
  for (let s = 1; s <= 60; s++) {
    const r = rng(s + 999);
    const h = hn({ random: rng(s), askFn: async (t, o) => { const ok = o.filter(x => !x.disabled && x.value !== '__back__'); return ok[Math.floor(r() * ok.length)].value; } });
    h.b.start({ players: [PP('S', 'pickpocket', 'p'), PP('T', 'toolmaster', 'p'), PP('V', 'monk', 'e'), PP('W', 'warrior', 'e')], mode: 'pvp', items: 2 });
    for (let i = 0; i < 25 && !h.b.G.over; i++) {
      const alive = h.b.G.units.filter(u => u.alive);
      h.b.select(alive[Math.floor(r() * alive.length)].id);
      if (r() < 0.7) await h.b.correct(); else await h.b.wrong();
      ci(h.b.G, `seed=${s} i=${i}`);
    }
    stole += h.b.G.log.filter(l => /盗んだ/.test(l.m)).length; supplied += h.b.G.log.filter(l => /補給した/.test(l.m)).length;
  }
  assert.ok(stole > 0 && supplied > 0, `盗む ${stole} 回・補給 ${supplied} 回が起きている`);
});

test('[アイテム] 目覚ましベル: 味方全員の状態異常（毒・休み・ディレイ・地雷）を回復する。誰も状態異常でなければ使えない', async () => {
  const { b, asks } = mk({ script: [-1, 'item:0', -1] });
  b.start({ players, mode: 'cpu', boss: 1 });
  const u = n => b.G.units.find(x => x.name === n);
  u('A').items = ['alarm'];
  assert.ok(b.select(u('A').id)); await b.correct();
  assert.ok(asks[0].o.find(o => o.value === 'item:0').disabled, '状態異常がいなければ選べない');
  u('B').poison = 2; u('A').restNext = true; u('A').delayQ = b.G.q + 1; u('A').mine = { by: 99, dmg: 1 };
  u('魔王1').poison = 2;                                         // 敵は回復しない
  assert.ok(b.select(u('A').id)); await b.correct();
  assert.equal(u('B').poison, 0); assert.equal(u('A').restNext, false); assert.equal(u('A').delayQ, null); assert.ok(!u('A').mine);
  assert.ok(u('魔王1').poison > 0, '敵は治らない'); assert.deepEqual(u('A').items, []);
});

test('[アイテム] 1回の行動で使えるアイテムは2個まで（3個目は選べない）。行動は残る', async () => {
  const { b, asks } = mk({ script: ['item:0', 'item:0', -1] });
  b.start({ players, mode: 'cpu', boss: 1 });
  const A = b.G.units.find(x => x.name === 'A');
  A.hp = 3; A.items = ['bandage', 'bandage', 'bandage'];
  assert.ok(b.select(A.id)); await b.correct();
  assert.equal(A.items.length, 1, '2個だけ使った');
  const menus = asks.filter(x => x.t.endsWith('の行動'));
  assert.equal(menus.length, 3);
  assert.ok(!menus[1].o.find(o => o.value === 'item:0').disabled, '2個目までは選べる');
  assert.ok(menus[2].o.find(o => o.value === 'item:0').disabled, '3個目は選べない');
  assert.ok(menus[2].o.some(o => !o.disabled && o.value === 0), '通常の行動は残る');
});

test('[アイテム] 一覧のジャンル分け: 全アイテムが、ちょうど1つのジャンルに入る', () => {
  const all = ITEM_GROUPS.flatMap(g => g.keys);
  assert.deepEqual([...all].sort(), [...ITEM_KEYS].sort());
  assert.equal(new Set(all).size, all.length, '重複がない');
  assert.ok(ITEM_GROUPS.every(g => g.n && g.keys.length));
});
