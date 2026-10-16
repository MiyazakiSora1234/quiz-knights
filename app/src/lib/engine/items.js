// アイテムの効果の定義。正解したときの行動メニューに「🎒 アイテム」として並び、使うと1個減る（行動とは別に何個でも使える）
//   buildItemActions(ctx, a) -> [{ key, label, desc, prompts, run, disabled }]（jobs.js の行動と同じ形）
import { ITEMS } from './data.js';

const P = (label, f) => ({ label, f });
const alive = u => u.alive;
const foe = a => u => u.alive && u.side !== a.side;
const ally = a => u => u.alive && u.side === a.side;

const notIn = f => (u, picked) => f(u) && !picked.includes(u);
const hurtSelf = (ctx, a, n) => ctx.applyEvents([{ src: null, to: a, amt: n }]);

const EFFECTS = {
  jerky(ctx, a) { return { prompts: [P('回復する人', ally(a))], run: async ([t]) => { ctx.heal(t, 1); } }; },
  candy(ctx, a) { return { prompts: [], run: async () => { a.poison = 0; a.poisonSkip = false; ctx.heal(a, 1); } }; },
  holy(ctx, a) { return { prompts: [P('清める味方', ally(a))], run: async ([t]) => { t.poison = 0; t.poisonSkip = false; ctx.heal(t, 1); } }; },
  bento(ctx, a) { return { prompts: [], run: async () => { ctx.heal(a, 3); ctx.setRest(a); } }; },
  drink(ctx, a) { return { prompts: [], run: async () => { a.maxHp++; ctx.heal(a, 1); ctx.fxUnit(a.id, 'grow'); } }; },
  blood(ctx, a) { return { prompts: [P('回復する味方', u => u.alive && u.side === a.side && u !== a)], run: async ([t]) => { await hurtSelf(ctx, a, 1); ctx.heal(t, 3); } }; },
  fang(ctx, a) { return { prompts: [P('牙を立てる相手', foe(a))], run: async ([t]) => { await ctx.dmgTo(a, [t], 1); ctx.heal(a, 1); } }; },
  doll(ctx, a) { return { prompts: [P('呪う相手', foe(a))], run: async ([t]) => { await ctx.applyEvents([{ src: null, to: a, amt: 1 }, { src: a, to: t, amt: 1 }]); } }; },
  shuriken(ctx, a) { return { disabled: ctx.G.units.filter(foe(a)).length < 2, prompts: [P('1人目', foe(a)), P('2人目', notIn(foe(a)))], run: async ([x, y]) => { await ctx.dmgTo(a, [x, y], 1); } }; },
  firework(ctx, a) { return { prompts: [], run: async () => { await ctx.dmgTo(a, ctx.G.units.filter(u => u.alive && u !== a), 1); } }; },
  landmine(ctx, a) { return { prompts: [P('地雷を仕掛ける相手', foe(a))], run: async ([t]) => { t.mine = { by: a.id, dmg: 1 }; ctx.log('💣 誰かが何かを仕掛けた…', 'sys'); } }; },
  shackle(ctx, a) { return { prompts: [P('足かせをはめる相手', foe(a))], run: async ([t]) => { t.delayQ = ctx.G.q + 1; ctx.fxUnit(t.id, 'delay'); ctx.log(`⛓ ${t.name} の次のボタンにディレイがつく`, 'sys'); } }; },
  smoke(ctx, a) { return { prompts: [], run: async () => { a.noWrong = true; ctx.fxUnit(a.id, 'guard'); ctx.log(`🌫 ${a.name} は次の誤答ダメージを受けない`, 'sys'); } }; },
  rope(ctx, a) { return { prompts: [P('命綱を渡す味方', u => u.alive && u.side === a.side && u !== a)], run: async ([t]) => { await hurtSelf(ctx, a, 1); t.barrier = 1; ctx.fxUnit(t.id, 'barrier'); ctx.log(`🔰 ${t.name} にバリアが付いた`, 'sys'); } }; },
  coin(ctx, a) {
    return { prompts: [], run: async () => {
      const heads = ctx.rand() < 0.5;
      ctx.log(`🪙 コインは${heads ? '表' : '裏'}！`, 'sys');
      ctx.event({ kind: 'coin', heads, who: a.name });
      await ctx.wait(1700);
      if (heads) ctx.heal(a, 3); else await hurtSelf(ctx, a, 1);
    } };
  },
  map(ctx, a) { return { prompts: [], run: async () => { await ctx.pickGenre(); } }; },

  bandage(ctx, a) { return { prompts: [], run: async () => { ctx.heal(a, 1); } }; },
  potion(ctx, a) { return { prompts: [P('回復する人', alive)], run: async ([t]) => { ctx.heal(t, 2); } }; },
  water(ctx, a) { return { prompts: [], run: async () => { for (const u of ctx.G.units.filter(ally(a))) ctx.heal(u, 1); } }; },
  pebble(ctx, a) { return { prompts: [P('石を投げる相手', foe(a))], run: async ([t]) => { await ctx.dmgTo(a, [t], 1); } }; },
  scroll(ctx, a) { return { prompts: [], run: async () => { await ctx.dmgTo(a, ctx.foesOf(a), 1); } }; },
  herb(ctx, a) { return { prompts: [P('毒を消す味方', u => u.alive && u.side === a.side && u.poison > 0)], run: async ([t]) => { t.poison = 0; t.poisonSkip = false; ctx.log(`🌿 ${t.name} の毒が消えた`, 'heal'); } }; },
  alarm(ctx, a) { return { prompts: [P('起こす味方', u => u.alive && u.side === a.side && u.restNext)], run: async ([t]) => { t.restNext = false; ctx.log(`🔔 ${t.name} の休みが取り消された`, 'heal'); } }; },
  bomb(ctx, a) { return { prompts: [P('爆弾を投げる相手', foe(a))], run: async ([t]) => { await ctx.dmgTo(a, [t], 2); } }; },
  amulet(ctx, a) {
    return { prompts: [P('守る味方', ally(a))], run: async ([t]) => { t.barrier = 1; ctx.fxUnit(t.id, 'barrier'); ctx.log(`🔰 ${t.name} にバリアが付いた`, 'sys'); } };
  },
  venom(ctx, a) {
    return { prompts: [P('毒を盛る相手', foe(a))], run: async ([t]) => {
      if (!(t.poison > 0)) t.poisonSkip = true;
      t.poison = 2; ctx.fxUnit(t.id, 'poison'); ctx.log(`☠ ${t.name} は毒を受けた`, 'sys');
    } };
  },
  powder(ctx, a) { return { prompts: [P('眠らせる相手', foe(a))], run: async ([t]) => { ctx.setRest(t); } }; },
  charm(ctx, a) {
    return { prompts: [P('札を渡す味方', ally(a))], run: async ([t]) => { t.noWrong = true; ctx.fxUnit(t.id, 'guard'); ctx.log(`📜 ${t.name} は次の誤答ダメージを受けない`, 'sys'); } };
  },
  feather(ctx, a) {
    return { prompts: [P('蘇生する人', u => !u.alive && !u.isBoss && u.side === a.side)], run: async ([t]) => {
      t.alive = true; t.hp = 1; t.ghost = false; ctx.log(`${t.name} が体力1で蘇生した！`, 'heal');
    } };
  },
  tea(ctx, a) { return { prompts: [], run: async () => { ctx.heal(a, Math.ceil(a.maxHp / 2)); } }; },
};

/** a が持っているアイテムの行動一覧（持っている順。同じ物を複数持っていても1個ずつ並ぶ） */
export function buildItemActions(ctx, a) {
  return (a.items || []).filter(k => ITEMS[k]).map(key => {
    const it = ITEMS[key];
    return { key, label: `${it.ic} ${it.n}`, desc: it.d, ...EFFECTS[key](ctx, a) };
  });
}
