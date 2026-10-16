// アイテムの効果の定義。正解したときの行動メニューに「🎒 アイテム」として並び、使うと1個減る（行動とは別に何個でも使える）
//   buildItemActions(ctx, a) -> [{ key, label, desc, prompts, run, disabled }]（jobs.js の行動と同じ形）
import { ITEMS } from './data.js';

const P = (label, f) => ({ label, f });
const alive = u => u.alive;
const foe = a => u => u.alive && u.side !== a.side;
const ally = a => u => u.alive && u.side === a.side;

const EFFECTS = {
  potion(ctx, a) { return { prompts: [P('回復する人', alive)], run: async ([t]) => { ctx.heal(t, 3); } }; },
  bomb(ctx, a) { return { prompts: [P('爆弾を投げる相手', foe(a))], run: async ([t]) => { await ctx.dmgTo(a, [t], 3); } }; },
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
  elixir(ctx, a) { return { prompts: [], run: async () => { ctx.heal(a, a.maxHp); } }; },
};

/** a が持っているアイテムの行動一覧（持っている順。同じ物を複数持っていても1個ずつ並ぶ） */
export function buildItemActions(ctx, a) {
  return (a.items || []).filter(k => ITEMS[k]).map(key => {
    const it = ITEMS[key];
    return { key, label: `${it.ic} ${it.n}`, desc: it.d, ...EFFECTS[key](ctx, a) };
  });
}
