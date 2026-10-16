// アイテムの効果の定義。正解したときの行動メニューに「🎒 アイテム」として並び、使うと1個減る（行動とは別に何個でも使える）
//   buildItemActions(ctx, a) -> [{ key, label, desc, prompts, run, disabled }]（jobs.js の行動と同じ形）
import { ITEMS } from './data.js';

const P = (label, f) => ({ label, f });
const alive = u => u.alive;
const foe = a => u => u.alive && u.side !== a.side;
const ally = a => u => u.alive && u.side === a.side;

const EFFECTS = {
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
