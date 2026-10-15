// 職業と魔王の「行動」の定義。正解したときの選択肢を、1職業 = 1関数で書く（表形式）
//
// 各関数は (ctx, a, add) を受け取る。
//   ctx … 共通部品（ダメージ処理・対象選択など。context.js）
//   a   … 行動する本人
//   add(ラベル, 説明, 対象の質問[], 実行する関数, {disabled}) … 選択肢を1つ登録する
// 対象の質問は P(ラベル, 条件) で書く。条件に合うユニットから1人ずつ選ばせる。
import { JOB } from './data.js';

const P = (label, f) => ({ label, f });
const alive = u => u.alive;
const foe = a => u => u.alive && u.side !== a.side;       // 敵
const ally = a => u => u.alive && u.side === a.side;      // 味方（自分を含む）
const other = a => u => u.alive && u !== a;               // 自分以外の生存者
const notIn = f => (u, picked) => f(u) && !picked.includes(u);  // すでに選んだ人を除く

/* ============================ プレイヤーの職業 ============================ */
const SPECIALS = {
  sage(ctx, a, add) {
    add('蘇生', '死んだプレイヤーを体力1で蘇生',
      [P('蘇生する人', u => !u.alive && !u.isBoss && u.side === a.side)],
      async ([t]) => { t.alive = true; t.hp = 1; t.ghost = false; ctx.log(`${t.name} が体力1で蘇生した！`, 'heal'); });
  },
  monk(ctx, a, add) {
    add('回復', '1人を3回復', [P('回復する人', alive)], async ([t]) => { ctx.heal(t, 3); });
  },
  warrior(ctx, a, add) {
    add('捨て身の一撃', '自身と他1人に5ダメージ', [P('もう1人の対象', other(a))],
      async ([t]) => { await ctx.applyEvents([{ src: a, to: a, amt: ctx.dm(a, 5) }, { src: a, to: t, amt: ctx.dm(a, 5) }]); });
  },
  mage(ctx, a, add) {
    add('封じの魔法', '1人に1ダメージ＋次の問題休み', [P('対象', alive)],
      async ([t]) => { await ctx.dmgTo(a, [t], ctx.dm(a, 1)); ctx.setRest(t); });
  },
  bm(ctx, a, add) {
    add('必殺の一撃', '1人に8ダメージ（バトル中1度だけ）', [P('対象', alive)],
      async ([t]) => { a.used = true; await ctx.dmgTo(a, [t], ctx.dm(a, 8)); }, { disabled: a.used });
  },
  hero(ctx, a, add) {
    add('勇者の剣', '自身を3回復し、他1人に4ダメージ', [P('対象', other(a))],
      async ([t]) => { ctx.heal(a, 3); await ctx.dmgTo(a, [t], ctx.dm(a, 4)); });
  },
  necro(ctx, a, add) {
    const n = ctx.G.units.filter(u => !u.alive && !u.isBoss && u.side === a.side).length;
    add(`死者の怨念（${n}ダメージ）`, '死んでいる仲間の人数×1ダメージ', [P('対象', alive)],
      async ([t]) => { if (n > 0) await ctx.dmgTo(a, [t], ctx.dm(a, n)); else ctx.log('死んでいる仲間がいない'); });
  },
  bard(ctx, a, add) {
    add('みんなに癒しの歌', '味方全員を1回復', [],
      async () => { for (const u of ctx.G.units.filter(ally(a))) ctx.heal(u, 1); });
  },
  tactician(ctx, a, add) {
    add('作戦指示', '味方1人の次の誤答ダメージを無効にする', [P('指示する味方', ally(a))],
      async ([t]) => { t.noWrong = true; ctx.log(`📜 ${t.name} は次の誤答ダメージを受けない`, 'sys'); });
  },
  cleric(ctx, a, add) {
    add('守護のバリア', '味方1人に、次のダメージ1回を無効にするバリアを付ける', [P('守る味方', ally(a))],
      async ([t]) => { t.barrier = 1; ctx.log(`🔰 ${t.name} にバリアが付いた`, 'sys'); });
  },
  poisoner(ctx, a, add) {
    add('毒', '1人に毒。次の2問が終わるたびに1ダメージ', [P('対象', alive)], async ([t]) => {
      if (!(t.poison > 0)) t.poisonSkip = true; // すでに毒なら、今の問題の終わりもそのまま数える
      t.poison = 2;
      ctx.log(`☠ ${t.name} は毒を受けた`, 'sys');
    });
  },
  oracle(ctx, a, add) {
    add('予言のディレイ', '敵1人の次の問題のボタンにディレイをつける', [P('対象', foe(a))], async ([t]) => {
      t.delayQ = ctx.G.q + 1;
      ctx.log(`🔮 ${t.name} の次のボタンにディレイがつく`, 'sys');
    });
  },
  minelayer(ctx, a, add) {
    add('地雷設置', '敵1人に地雷。その人が次に正解したとき3ダメージ', [P('対象', foe(a))], async ([t]) => {
      t.mine = { by: a.id, dmg: 3 };
      ctx.log('💣 地雷屋が何かを仕掛けた…', 'sys');   // 誰に仕掛けたかは伏せる
    });
  },
  gambler(ctx, a, add) {
    add('コイントス', '表なら敵1人に5ダメージ、裏なら自分が2ダメージ', [], async () => {
      const heads = ctx.rand() < 0.5;
      ctx.log(`🪙 コインは${heads ? '表' : '裏'}！`, 'sys');
      if (!heads) { await ctx.applyEvents([{ src: a, to: a, amt: 2 }]); return; }
      const t = await ctx.pickUnit('表！ 5ダメージを与える相手', foe(a), []);
      if (t) await ctx.dmgTo(a, [t], ctx.dm(a, 5)); else ctx.log('対象がいない');
    });
  },
  mimic(ctx, a, add) {
    const src = ctx.G.units.find(u => u.id === ctx.G.prevCorrect);
    const copyable = src && !src.isBoss && src.id !== a.id && src.job !== 'mimic';
    if (!copyable) { add('模倣', '直前に正解した人の能力をコピーする（コピー元なし）', [], async () => {}, { disabled: true }); return; }
    const copied = buildActions(ctx, a, src.job).slice(1);   // 通常攻撃は除く（模倣者自身の攻撃力で別に出る）
    for (const x of copied) add(`模倣：${x.label}`, x.desc, x.prompts, x.run, { disabled: x.disabled });
    if (src.job === 'thief') add('模倣：ジャンル選択', '次の問題のジャンルを選ぶ', [], async () => { await ctx.pickGenre(); });
    if (!copied.length && src.job !== 'thief') add(`模倣：${JOB[src.job].n}`, 'コピーできる能力がない', [], async () => {}, { disabled: true });
  },
};

/* ================================ 魔王 ================================ */
const BOSS_SKILLS = {
  1(ctx, a, add) {
    add('技1', '敵1体に3ダメージ', [P('対象', foe(a))], async ([t]) => { await ctx.dmgTo(a, [t], ctx.dm(a, 3)); });
    add('技2', '指定1人に2ダメージ、その両隣に1ダメージ', [P('指定する人', foe(a))], async ([t]) => {
      await ctx.applyEvents([{ src: a, to: t, amt: ctx.dm(a, 2) }, ...ctx.neighbors(t).map(n => ({ src: a, to: n, amt: ctx.dm(a, 1) }))]);
    });
  },
  2(ctx, a, add) {
    if (a.form === 0) {
      add('技1', '2人に1ダメージ。その2人は次のターン休み', [P('1人目', foe(a)), P('2人目', notIn(foe(a)))],
        async ([x, y]) => { await ctx.dmgTo(a, [x, y], 1); ctx.setRest(x); ctx.setRest(y); });
      add('技2', '1人に3ダメージ', [P('対象', foe(a))], async ([t]) => { await ctx.dmgTo(a, [t], 3); });
    } else if (a.form === 1) {
      add('技1', '自分を2回復', [], async () => { ctx.heal(a, 2); });
      add('技2', '敵に1ダメージ', [P('対象', foe(a))], async ([t]) => { await ctx.dmgTo(a, [t], 1); });
    } else {
      add('技1', '1人に2ダメージ', [P('対象', foe(a))], async ([t]) => { await ctx.dmgTo(a, [t], 2); });
    }
  },
  3(ctx, a, add) {
    add('技1', '2人に1ダメージ。その後、与えたダメージ分回復', [P('1人目', foe(a)), P('2人目', notIn(foe(a)))], async ([x, y]) => {
      const dealt = await ctx.dmgTo(a, [x, y], 1);
      if (dealt > 0) ctx.heal(a, dealt);
    });
    const prev = ctx.G.units.find(u => u.id === ctx.G.prevCorrect);
    add('技2', `直前に正解した相手に4ダメージ${prev ? `（${prev.name}）` : '（該当者なし）'}`, [], async () => {
      const t = ctx.G.units.find(u => u.id === ctx.G.prevCorrect);
      if (t && t.alive && t.side !== a.side) await ctx.dmgTo(a, [t], 4); else ctx.log('直前の正解者がいないため不発');
    }, { disabled: !(prev && prev.alive && prev.side !== a.side) });
  },
  4(ctx, a, add) {
    add('技1', '敵1人に毒（次の2問が終わるたびに1ダメージ）', [P('対象', foe(a))], async ([t]) => {
      if (!(t.poison > 0)) t.poisonSkip = true;
      t.poison = 2;
      ctx.log(`☠ ${t.name} は毒を受けた`, 'sys');
    });
    const poisoned = ctx.G.units.filter(u => u.alive && u.side !== a.side && u.poison > 0).length;
    const amt = poisoned >= 3 ? 2 : 1;
    add(`技2（敵全体に${amt}）`, '敵全体に1ダメージ（毒を受けている敵が3人以上なら2ダメージ）', [], async () => { await ctx.dmgTo(a, ctx.foesOf(a), ctx.dm(a, amt)); });
  },
  5(ctx, a, add) {
    const prev = ctx.G.units.find(u => u.id === ctx.G.prevCorrect);
    const ok = prev && prev.alive && prev.side !== a.side;
    const copyable = ok && !prev.isBoss && prev.job !== 'mimic';
    const copied = copyable ? buildActions(ctx, a, prev.job).slice(1) : [];   // 通常攻撃は除く
    for (const x of copied) add(`模倣：${x.label}`, x.desc, x.prompts, x.run, { disabled: x.disabled });
    if (copyable && prev.job === 'thief') add('模倣：ジャンル選択', '次の問題のジャンルを選ぶ', [], async () => { await ctx.pickGenre(); });
    if (!copied.length && !(copyable && prev.job === 'thief')) add('模倣', '直前に正解した敵の技をコピー（コピーできる技なし）', [], async () => {}, { disabled: true });
    add(`反射${ok ? `（${prev.name}）` : ''}`, '直前に正解した敵に2ダメージ', [], async () => {
      const t = ctx.G.units.find(u => u.id === ctx.G.prevCorrect);
      if (t && t.alive && t.side !== a.side) await ctx.dmgTo(a, [t], ctx.dm(a, 2)); else ctx.log('直前の正解者がいないため不発');
    }, { disabled: !ok });
  },
  6(ctx, a, add) {
    add('技1', '敵1人に5ダメージ', [P('対象', foe(a))], async ([t]) => { await ctx.dmgTo(a, [t], ctx.dm(a, 5)); });
    add('技2', '敵全体に2ダメージ。自分も1ダメージ（体力が1のときは受けない）', [], async () => {
      const evs = ctx.foesOf(a).map(t => ({ src: a, to: t, amt: ctx.dm(a, 2) }));
      if (a.hp > 1) evs.push({ src: null, to: a, amt: 1 });
      await ctx.applyEvents(evs);
    });
  },
};

/* ============================ 行動リストの組み立て ============================ */
/**
 * a が正解したときに選べる行動の一覧。asJob を渡すと、その職業の行動として組み立てる（模倣者用）。
 * 1つ目は魔王以外では必ず「通常攻撃」。
 */
export function buildActions(ctx, a, asJob = null) {
  const list = [];
  const add = (label, desc, prompts, run, opt = {}) => list.push({ label, desc, prompts, run, ...opt });

  if (a.isBoss && !asJob) { BOSS_SKILLS[a.bossId](ctx, a, add); return list; }

  const job = asJob || a.job;
  if (job === 'mw') {
    add(`通常攻撃（敵全体に${ctx.dm(a, a.atk)}）`, '常に敵全体へ', [], async () => { await ctx.dmgTo(a, ctx.foesOf(a), ctx.dm(a, a.atk)); });
  } else {
    add(`通常攻撃（${ctx.dm(a, a.atk)}）`, '1人に攻撃（自分・味方も可）', [P('攻撃対象', alive)], async ([t]) => { await ctx.dmgTo(a, [t], ctx.dm(a, a.atk)); });
  }
  if (a.ghost && !asJob) return list;   // 幽霊は通常攻撃だけ
  SPECIALS[job]?.(ctx, a, add);
  return list;
}
