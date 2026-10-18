// バトルの進行: 正解・誤答・スルー、問題の終わり、取り消し（画面に依存しない。Node でもテストできる）
//  ui = { ask(title, options, {sub,cancel}) -> Promise, random?(), toast(msg), changed(snapshot), persist?(G) }
import { CANCEL, JOB, BOSS, ITEMS, GENRES, LEVELS, squadFoeScale, isSquadFoes, jobName, nm, bossHp, bossIdOf } from './data.js';
import { createContext } from './context.js';
import { buildActions } from './jobs.js';
import { buildItemActions, dealItems, startItemCount } from './items.js';
import { evaluate } from './ai.js';

/** チームの並び順（A=p / B=e / C=c） */
const TEAM_ORDER = { p: 0, e: 1, c: 2 };

export function createBattle(ui) {
  let G = null, undoStack = [], redoStack = [], busy = false, pending = false, simulating = false;

  /** 変化を画面へ知らせる（同じ瞬間の変化は1回にまとめる） */
  const emit = () => {
    if (pending || simulating) return;       // 先読み中の状態は画面に出さない
    pending = true;
    queueMicrotask(() => { pending = false; ui.changed(G ? JSON.parse(JSON.stringify(G)) : null); });
  };
  const ctx = createContext({ ui, getG: () => G, emit });
  const { ask, log, heal, applyEvents, pickGenre } = ctx;

  /* ---------- ユニットの生成 ---------- */
  const baseUnit = fields => ({ id: G.uid++, restNow: false, restNext: false, used: false, converted: false, alive: true, ...fields });
  const mkPlayer = (name, job) => {
    const j = JOB[job];
    return baseUnit({ name, job, side: 'p', isBoss: false, atk: j.atk, maxHp: j.hp, hp: j.hp, guards: job === 'tank' ? 1 : 0 });
  };
  const mkBoss = (id, S) => {
    const hp = bossHp(S, id);
    return baseUnit({ name: BOSS[id].n, job: 'boss', side: 'e', isBoss: true, bossId: id, form: 0, S, atk: 0, maxHp: hp, hp, guards: 0 });
  };

  /** 魔王の代わりに、相手チームとして CPU（魔王 'boss3' や職業）を加える。体力は難易度と敵の数で変わる */
  function addFoes(foes, level) {
    const count = {}, fs = isSquadFoes(foes) ? squadFoeScale(foes.length) : 1;
    const S = G.units.reduce((s, u) => s + (u.isBoss ? 0 : u.atk), 0);
    for (const j of foes) {
      const bm = typeof j === 'string' && /^boss[0-9]+$/.test(j) ? +j.slice(4) : 0;
      if (bm && BOSS[bm]) { G.units.push(mkBoss(bm, S * LEVELS[level].hp * fs)); continue; }   // 'boss3' = 魔王3
      const key = JOB[j] && j !== 'hero' ? j : 'warrior';
      count[key] = (count[key] || 0) + 1;
      const total = foes.filter(x => x === j).length;
      const u = mkPlayer(`CPU${JOB[key].n}${total > 1 ? count[key] : ''}`, key);
      u.side = 'e'; u.cpu = true;
      u.maxHp = u.hp = Math.max(1, Math.ceil(u.maxHp * LEVELS[level].hp * fs));      // 難易度でCPUの体力が変わる
      G.units.push(u);
    }
  }

  /* ---------- 決着・問題の終わり ---------- */
  function checkEnd() {
    if (G.over) return;
    if (G.mode === 'pvp') {
      // 生き残っているチームが1つ以下なら決着（A=p / B=e / C=c）
      const alive = [...new Set(G.units.filter(u => u.alive).map(u => u.side))];
      if (alive.length <= 1) G.over = alive.length ? 'team' + alive[0] : 'draw';
      return;
    }
    if (G.units.filter(u => u.isBoss).every(b => !b.alive)) G.over = 'win';
    else if (!G.units.some(u => u.alive && u.side === 'p')) G.over = 'lose';
  }

  /** 毒（付けた問題の終わりは数えず、その次の2問が終わるたびに1ダメージ） */
  async function tickPoison() {
    const events = [];
    for (const u of G.units) {
      if (!u.alive || !(u.poison > 0)) continue;
      if (u.poisonSkip) { u.poisonSkip = false; continue; }
      u.poison--;
      events.push({ src: null, to: u, amt: 1 }); ctx.fxUnit(u.id, 'poison');
    }
    if (events.length) { log('☠ 毒のダメージ', 'sys'); await applyEvents(events); }
  }

  /* ---------- CPUの頭脳（先読み） ---------- */
  /** すべての行動 × 対象の組み合わせ（行動の番号と対象のid）を挙げる */
  function enumeratePlans(a) {
    const acts = buildActions(ctx, a);
    const plans = [];
    acts.forEach((act, ai) => {
      if (act.disabled) return;
      const walk = (k, picked) => {
        if (k === act.prompts.length) { plans.push({ ai, ids: picked.map(u => u.id) }); return; }
        for (const u of G.units.filter(x => act.prompts[k].f(x, picked))) walk(k + 1, [...picked, u]);
      };
      walk(0, []);
    });
    return plans;
  }
  /** a の最良の計画を先読みで探す: 各計画を状態の複製で試し、盤面の良さが最大のものを選ぶ（同点・僅差はランダム） */
  async function bestPlan(a) {
    const plans = enumeratePlans(a);
    if (!plans.length) return null;
    const real = G, snap = JSON.stringify({ ...G, log: [] });
    let best = null;
    simulating = true;
    try {
      for (const pl of plans) {
        G = JSON.parse(snap);
        const a2 = G.units.find(u => u.id === a.id);
        ctx.setSim(true); ctx.setAuto(a2);
        try {
          const act = buildActions(ctx, a2)[pl.ai];
          await act.run(pl.ids.map(id => G.units.find(u => u.id === id)));
          checkEnd();
        } catch { G = real; continue; } finally { ctx.setSim(false); ctx.setAuto(null); }
        const score = evaluate(G, a.side) + ctx.rand() * 0.6;      // わずかな揺らぎ（同じ手ばかりにならないように）
        if (!best || score > best.score) best = { ...pl, score };
      }
    } finally { G = real; simulating = false; ctx.setSim(false); }
    return best;
  }

  /** CPU（魔王・CPUの職業ユニット）のうち1体が、1問ごとに自動で1回行動する。先読みで「いちばん効く動き」をするCPUと、その行動・対象を選ぶ */
  /** only: 早押しに勝ったCPU。指定があれば、そのCPUだけが動く */
  async function cpuTurn(only = null) {
    const all = G.units.filter(u => (u.isBoss || u.cpu) && !u.human && u.alive && !u.restNow && (!only || u.id === only.id));   // 参加者が操作する魔王は自動で動かない
    let cpus = [], plan = null;
    if (all.length) {
      let top = null;
      for (const u of all) {
        const pl = await bestPlan(u);
        if (pl && (!top || pl.score > top.pl.score)) top = { u, pl };
      }
      if (top) { cpus = [top.u]; plan = top.pl; }
      else cpus = [all[Math.min(all.length - 1, Math.floor(ctx.rand() * all.length))]];
    }
    for (const u of cpus) {
      if (G.over) return;
      const cur = G.units.find(x => x.id === u.id);
      if (!cur || !cur.alive) continue;                       // 先に動いたCPUの行動で倒された
      // ワンテンポ置いて「いま誰が動くか」を見せ、動いたあとは何をしたかを知らせる
      log(`🤖 ${nm(cur)} の行動`, 'sys');
      G.acting = cur.id; G.notice = null; emit();
      if (ui.pause) await ui.pause(1100);
      let did = null;
      ctx.setAuto(cur);
      try {
        if (!(await stepOnMine(cur))) { did = await runPlan(cur, plan); await afterAction(cur); }
        else { did = { label: '地雷を踏んで行動できない', desc: '', names: [] }; announce(cur, did.label, '', []); await wait(800); }
      } finally { ctx.setAuto(null); }
      G.acting = null;
      emit();
      checkEnd();
    }
  }

  /** 1問が終わったとき。correct は正解した人（いなければ null） */
  /** cpuWinner: 早押しに勝ったCPU。CPUが早押しで競っている（cfg.cpuBuzz）ときは、勝ったCPUだけが動き、押し負けたとき・スルーのときは動かない */
  async function endQuestion(correct, cpuWinner = null) {
    checkEnd();
    if (!G.over && G.cfg.cpuAuto && (!G.cfg.cpuBuzz || cpuWinner)) await cpuTurn(cpuWinner);
    if (!G.over) await tickPoison();            // 決着がついたあとは、毒で状況を変えない
    for (const u of G.units) { u.restNow = u.restNext; u.restNext = false; }
    G.prevCorrect = correct ? correct.id : null;
    G.wrongOn = [];
    if (!correct) G.streak = 0;
    G.q++; G.sel = null;
    ctx.event({ kind: 'round', q: G.q });
    log(`── 第${G.q}問 ──`, 'sys');
    checkEnd();
  }

  /* ---------- 正解 ---------- */
  const stat = (u, k) => { G.stats ??= {}; (G.stats[u.id] ??= { correct: 0, wrong: 0 })[k]++; };

  /** 地雷を踏んだら先にダメージ。それで倒れたら true（行動はできない） */
  async function stepOnMine(a) {
    if (!a.mine) return false;
    const by = G.units.find(u => u.id === a.mine.by), dmg = a.mine.dmg;
    a.mine = null;
    log(`💥 ${a.name} は地雷を踏んだ！`, 'sys');
    ctx.event({ kind: 'bomb', who: a.name, mine: true });
    await applyEvents([{ src: by || null, to: a, amt: dmg }]);
    return !a.alive;
  }

  /** 正解したことで得るもの（連答・タンクの守り・勇者への転職・魔王3の回復） */
  function gainFromCorrect(a) {
    G.streak = (G.prevCorrect === a.id) ? (G.streak || 1) + 1 : 1;
    if (a.job === 'tank') { a.guards++; log(`🛡 ${a.name} の守り回数 +1 (${a.guards})`, 'sys'); }
    if (a.job === 'playboy' && G.streak >= 2) {
      const h = JOB.hero, sc = G.cfg.hpScale || 1;
      a.job = 'hero'; a.atk = h.atk; a.maxHp = Math.max(1, Math.round(h.hp * sc)); a.hp = a.maxHp;      // 体力は、ほかの人と同じ倍率で増える
      log(`🎲→👑 ${a.name} は連答で勇者に転職！体力リセット (HP ${a.hp})`, 'sys');
      ctx.event({ kind: 'job', who: a.name, from: '遊び人', to: '勇者' });
    }
    if (a.isBoss && a.bossId === 3 && a.hp === 1) heal(a, 5);
  }

  /** 画面に「誰が何をするか」を出す（行動の前に知らせてから、効果を適用する） */
  function announce(a, label, desc, names, fizzled = false) {
    const short = label.replace(/（.*?）/g, '');
    const inner = (/（(.*?)）/.exec(label) || [])[1];
    const text = `${a.name} の ${label.startsWith('地雷') ? label : short}`;
    const detail = [inner || desc, names.length ? `対象：${names.join('・')}` : '', fizzled ? '（対象がいないため不発）' : ''].filter(Boolean).join('　');
    G.noticeSeq = (G.noticeSeq || 0) + 1;
    G.notice = { id: G.noticeSeq, text, detail, side: a.side };
    emit();
  }
  const wait = ms => (ui.pause ? ui.pause(ms) : null);
  /** 行動の実行: 予告 → 少し間を置く → 効果 → 効果を見せる間。誰の行動でも同じ流れにする */
  async function perform(a, act, targets) {
    announce(a, act.label, act.desc, targets.map(t => t.name));
    await wait(650);
    await act.run(targets);
    await wait(750);
    return { label: act.label, desc: act.desc, names: targets.map(t => t.name) };
  }

  /** 行動を選ばせて実行する。選択肢の対象を1つずつ聞き、足りなければ不発。対象の選択から「戻る」で行動を選び直せる */
  async function chooseAndRunAction(a) {
    for (;;) {
      const acts = buildActions(ctx, a);
      const items = buildItemActions(ctx, a);
      const c = await ask(`${nm(a)} の行動`, actionMenu(acts, items), { sub: acts.every(x => x.disabled) ? '使える行動がありません' : (items.length ? '行動を選んでください（🎒 アイテムも使えます）' : '行動を選んでください') });
      if (typeof c === 'string' && c.startsWith('item:')) {
        const it = items[+c.slice(5)];
        if (!it) continue;
        const r = await useItem(a, it);
        if (r.done) return r.result;                           // アイテムで決着した・自分が倒れた: 続きの行動はできない
        continue;                                              // アイテムは行動を消費しない。メニューに戻る
      }
      if (c < 0) return { label: '何もしない', desc: '', names: [] };
      const act = acts[c], t = await pickTargets(act);
      if (t.back) continue;
      if (t.fizzled) { log('対象がいないため不発'); announce(a, act.label, act.desc, [], true); return { label: act.label, desc: act.desc, names: [], fizzled: true }; }
      return perform(a, act, t.picked);
    }
  }
  /** 行動メニューの選択肢（行動 → アイテム → 何もしない）。対象がいないものは選べない */
  function actionMenu(acts, items) {
    const blocked = x => x.disabled || !x.prompts.every(p => G.units.some(u => p.f(u, [])));
    return [
      ...acts.map((x, i) => ({ label: x.label, sub: x.desc, value: i, disabled: blocked(x) })),
      ...items.map((x, i) => ({ label: x.label, sub: `アイテム：${x.desc}（使っても行動は残る）`, value: 'item:' + i, cls: 'item', disabled: blocked(x) })),
      { label: '何もしない', value: -1, cls: 'ghost' },
    ];
  }
  /** アイテムを使う（対象を選ぶ → 1個減らす → 予告して効果）。戻る/不発なら使わず done=false。使った結果で決着した・自分が倒れたら done=true */
  async function useItem(a, it) {
    const t = await pickTargets(it);
    if (t.back || t.fizzled) return { done: false };
    const wasAlive = a.alive;
    const at = a.items.indexOf(it.key);
    if (at >= 0) a.items.splice(at, 1);
    log(`🎒 ${a.name} は ${it.label} を使った`, 'sys');
    ctx.fxUnit(a.id, 'item');
    await perform(a, { ...it, label: `${it.label}を使う`, desc: it.desc }, t.picked);
    const over = G.over || (wasAlive && !a.alive);
    return { done: !!over, result: { label: it.label, desc: it.desc, names: t.picked.map(x => x.name) } };
  }
  /** 対象を1つずつ選ばせる。戻る → { back }、対象がいない → { fizzled }、選び終えた → { picked } */
  async function pickTargets(act) {
    const picked = [];
    for (const p of act.prompts) {
      const t = await ctx.pickUnit(p.label, p.f, picked, { back: true });
      if (t === ctx.BACK) return { back: true };
      if (!t) return { fizzled: true };
      picked.push(t);
    }
    return { picked };
  }
  /** 先読みで決めた計画を実行する。計画がなければ何もしない */
  async function runPlan(a, plan) {
    if (!plan) return { label: '何もしない', desc: '', names: [] };
    const act = buildActions(ctx, a)[plan.ai];
    const targets = plan.ids.map(id => G.units.find(u => u.id === id)).filter(Boolean);
    // 計画を立てたあとに状況が変わった（地雷で魔王が変身した、対象が消えた、など）ら、計画は使わず自動選択に戻す
    if (!act || act.disabled || act.prompts.length !== plan.ids.length || targets.length !== plan.ids.length) return chooseAndRunAction(a);
    return perform(a, act, targets);
  }

  /** 行動のあとの後始末（盗賊のジャンル選択・見習いの成長・幽霊の成仏） */
  async function afterAction(a) {
    if (a.job === 'thief' && a.alive && !G.over) await pickGenre();
    if (a.job === 'apprentice' && a.alive && a.atk < 5) {
      a.atk++; a.maxHp++; a.hp++;
      log(`🌱 ${a.name} は成長した！ (攻撃${a.atk} / 体力${a.hp}/${a.maxHp})`, 'sys'); ctx.fxUnit(a.id, 'grow');
    }
    if (a.ghost) { a.ghost = false; a.ghostUsed = true; log(`👻 ${a.name} は成仏した`, 'sys'); }
  }

  /** その人が選ぶ場面（行動・対象・押し付け先など）では、その人の端末に選択ダイアログを出す */
  const asActor = async (a, fn) => { ctx.setActor(a.id); try { await fn(); } finally { ctx.setActor(null); } };

  const doCorrect = a => asActor(a, () => doCorrectBody(a));
  async function doCorrectBody(a) {
    stat(a, 'correct');
    log(`⭕ ${nm(a)} 正解！`, 'sys');
    ctx.event({ kind: 'answer', ok: true, who: a.name });
    await wait(700);
    if (await stepOnMine(a)) { await endQuestion(a); return; }
    gainFromCorrect(a);
    await chooseAndRunAction(a);
    await afterAction(a);
    await endQuestion(a);
  }

  /* ---------- 誤答 ---------- */
  /** 道化師: 誤答の2ダメージを味方の1人に押し付けられる */
  async function jesterPush(a) {
    const others = G.units.filter(u => u.alive && u !== a && u.side === a.side);      // 押し付けられるのは味方だけ（敵に押し付けると、わざと誤答するだけの攻撃になってしまう）
    const choice = await ask('🃏 道化師：誤答の2ダメージを味方の誰かに押し付ける？', [
      ...others.map(u => ctx.unitOption(u, { sub: `${jobName(u)}　HP ${u.hp}/${u.maxHp}` })),
      { label: '自分で受ける', value: null, cls: 'ghost' },
    ], { sub: '押し付けた味方が2ダメージを受けます' });
    const target = choice === null ? a : G.units.find(x => x.id === choice);
    await applyEvents([{ src: target === a ? null : a, to: target, amt: 2 }]);
  }

  /** 誤答の罰（役職に関係なく2ダメージ。幽霊・魔王の設定・軍師の加護・道化師は例外） */
  async function wrongPenalty(a) {
    if (a.ghost) { a.ghost = false; a.ghostUsed = true; log(`👻 ${a.name} は成仏した`, 'sys'); return; }
    if (a.isBoss && !a.human && !G.cfg.bossPenalty) { log('魔王は誤答ペナルティなし'); return; }
    if (a.noWrong) { a.noWrong = false; log(`📜 ${a.name} は作戦で誤答ダメージを受けない`, 'sys'); return; }
    if (a.job === 'jester' && G.units.some(u => u.alive && u !== a && u.side === a.side)) { await jesterPush(a); return; }
    await applyEvents([{ src: null, to: a, amt: 2 }]);
  }

  /** retry=true: 問題は終わらせず、誤答した人を除いて同じ問題をもう一度受け付ける */
  const doWrong = (a, retry = false) => asActor(a, () => doWrongBody(a, retry));
  async function doWrongBody(a, retry) {
    stat(a, 'wrong');
    log(`❌ ${nm(a)} 誤答`, 'sys');
    ctx.event({ kind: 'answer', ok: false, who: a.name });
    await wait(700);
    await wrongPenalty(a);
    if (retry) {
      (G.wrongOn ??= []).push(a.id);
      G.sel = null;
      checkEnd();
      if (!G.over) log(`同じ問題を再受付（${G.wrongOn.length}人が誤答済み）`, 'sys');
      return;
    }
    await endQuestion(null);
  }

  /* ---------- CPUの早押し ---------- */
  /** CPU（魔王・CPUの職業）が先に押した。正解なら誰も得をせずに問題が終わり、誤答ならCPUが罰を受けて、受付は続く */
  const doCpuBuzz = (u, ok, text) => asActor(u, () => doCpuBuzzBody(u, ok, text));
  async function doCpuBuzzBody(u, ok, text) {
    stat(u, ok ? 'correct' : 'wrong');
    log(`🤖 ${nm(u)} が先に押して${text ? `「${text}」と答え、` : ''}${ok ? '正解' : '誤答'}`, 'sys');
    ctx.event({ kind: 'answer', ok, who: u.name, text: text || '' });
    await wait(ok ? 900 : 700);
    if (ok) { await endQuestion(null, u); return; }
    await wrongPenalty(u);
    checkEnd();
  }

  /* ---------- スルー ---------- */
  async function doThrow() {
    log('問題スルー', 'sys');
    for (const b of G.units) if (b.isBoss && b.alive && b.bossId === 2 && b.form === 2) heal(b, 1);
    await endQuestion(null);
  }

  /* ---------- 取り消し（失敗・キャンセルなら丸ごと元に戻す） ---------- */
  async function transact(fn) {
    if (busy || !G || G.over) return false;
    busy = true; emit();
    const snap = JSON.stringify(G);
    let ok = true;
    try {
      await fn();
      undoStack.push(snap); redoStack = [];                    // 新しい操作をしたら、「進める」は使えなくなる
      if (undoStack.length > 40) undoStack.shift();
      ui.persist && ui.persist(G);
    } catch (e) {
      ok = false;
      G = JSON.parse(snap);
      if (e !== CANCEL) { console.error(e); ui.toast('エラーが発生したため処理を取り消しました: ' + e.message); }
    } finally { busy = false; emit(); }
    return ok;
  }

  /* ---------- 公開API ---------- */
  return {
    get G() { return G; },
    get busy() { return busy; },
    get canUndo() { return undoStack.length > 0; },
    get canRedo() { return redoStack.length > 0; },

    /** players:[{name,job,team,pid?}] */
    start({ players, mode = 'cpu', boss = 1, bossPenalty = true, genres = null, foes = [], cpuAuto = false, level = 'base', hpScale = 1, bossHpScale = null, items = 0 }) {
      // 難易度を指定しない場合は「基準」（調整なし）。進行役の画面は「普通」から始まる
      if (!LEVELS[level]) level = 'base';
      // foes: 魔王の代わりに、CPU の職業ユニットが相手になる（進行役が操作する。ルールは対戦と同じ）
      const hasBossPlayer = players.some(p => bossIdOf(p.job));      // 魔王を選んだ参加者がいるときも、チーム戦のルールで進める
      const squad = mode === 'cpu' && (foes.length > 0 || hasBossPlayer);
      if (squad) mode = 'pvp';
      G = { cpu: squad, mode, uid: 1, units: [], log: [], q: 1, prevCorrect: null, streak: 0, genre: null, genreFor: 0, sel: null, over: null, pids: {}, stats: {},
            genres: (genres && genres.length) ? [...genres] : [...GENRES], cfg: { bossPenalty, cpuAuto, level, hpScale, bossHpScale: bossHpScale ?? hpScale, items } };
      const pvp = mode === 'pvp';
      const humanBosses = [];
      for (const p of players) {
        const bid = bossIdOf(p.job);
        const u = bid ? mkBoss(bid, 1) : mkPlayer(p.name.trim(), p.job);
        if (bid) { u.name = p.name.trim(); u.human = true; humanBosses.push(u); }       // 参加者が操作する魔王
        if (pvp) u.side = squad ? 'p' : (TEAM_ORDER[p.team] != null ? p.team : 'p');
        G.units.push(u);
        dealItems(u, startItemCount(u.job, items), ctx.rand);
        if (p.pid) G.pids[p.pid] = u.id;
      }
      // 参加者が操作する魔王の体力は、ほかの参加者の攻撃合計から決まる（難易度の影響は受けない）
      if (humanBosses.length) {
        const S0 = G.units.reduce((t, u) => t + (u.isBoss ? 0 : u.atk), 0);
        for (const b of humanBosses) { b.S = S0; b.maxHp = b.hp = bossHp(S0, b.bossId); }
      }
      if (squad) addFoes(foes, level);
      if (pvp) {
        G.units.sort((a, b) => TEAM_ORDER[a.side] - TEAM_ORDER[b.side]); // チームごとに席を連続させる（安定ソート）
        log(squad ? `バトル開始！ プレイヤー vs ${G.units.filter(u => u.cpu || u.isBoss).map(u => u.name).join('・')}` : '対戦開始！ チームA vs チームB', 'sys');
      } else {
        const S = G.units.reduce((s, u) => s + u.atk, 0);
        const b = mkBoss(+boss, S * LEVELS[level].hp);
        G.units.push(b);
        log(`バトル開始！ ${b.name} (HP ${b.hp}) ／ プレイヤー攻撃合計 ${S}`, 'sys');
      }
      // 全員の体力を同じ倍率で増やす（試合を長くするための調整。与えるダメージ・回復量は変えない）
      for (const u of G.units) {
        const k = u.isBoss ? G.cfg.bossHpScale : hpScale;
        if (k !== 1) { u.maxHp = Math.max(1, Math.round(u.maxHp * k)); u.hp = u.maxHp; }
      }
      if (pvp) checkEnd();                       // 相手が誰もいない構成なら、始まってすぐ決着
      log('── 第1問 ──', 'sys');
      undoStack = []; redoStack = []; busy = false;
      ui.persist && ui.persist(G);
      emit();
    },
    /** 魔王の登場の演出を出す（バトル開始の少しあとに、進行役が呼ぶ）。敵の魔王がいなければ何もしない */
    intro() {
      if (!G || G.over) return false;
      const bosses = G.units.filter(u => u.isBoss && u.alive && !u.human && u.side !== 'p');
      if (!bosses.length) return false;
      ctx.event({ kind: 'intro', bosses: bosses.slice(0, 3).map(b => ({ name: b.name, bossId: b.bossId, intro: BOSS[b.bossId].intro })) });
      return true;
    },
    /** 戦闘中に新しい参加者を加える（途中参戦）。魔王のHPは変えない。加えられたら true */
    join({ name, job = 'warrior', team = 'p', pid }) {
      if (!G || G.over || busy || (pid && G.pids[pid] != null)) return false;
      const bid = bossIdOf(job);
      let u;
      if (bid) {
        u = mkBoss(bid, 1);
        const S0 = G.units.reduce((t, x) => t + (x.isBoss ? 0 : x.atk), 0);
        u.name = String(name).trim() || '名無し'; u.human = true; u.S = S0; u.maxHp = u.hp = bossHp(S0, bid);
      } else u = mkPlayer(String(name).trim() || '名無し', JOB[job] && job !== 'hero' ? job : 'warrior');
      if (G.mode === 'pvp') {
        u.side = !G.cpu && TEAM_ORDER[team] != null ? team : 'p';
        // 自分のチームの最後尾（そのチームがなければ、順番が前のチームのあと）に入れる
        let at = 0;
        G.units.forEach((x, i) => { if (TEAM_ORDER[x.side] <= TEAM_ORDER[u.side]) at = i + 1; });
        G.units.splice(at, 0, u);
      } else {
        const b = G.units.findIndex(x => x.isBoss);
        G.units.splice(b < 0 ? G.units.length : b, 0, u);
      }
      const sc = (u.isBoss ? G.cfg.bossHpScale : G.cfg.hpScale) || 1;
      if (sc !== 1) { u.maxHp = Math.max(1, Math.round(u.maxHp * sc)); u.hp = u.maxHp; }
      if (pid) G.pids[pid] = u.id;
      dealItems(u, startItemCount(u.job, G.cfg.items), ctx.rand);
      redoStack = [];
      log(`${u.name} が途中参戦！（${jobName(u)}）`, 'sys');
      ui.persist && ui.persist(G);
      emit();
      return true;
    },
    /** 退室した参加者のユニットを戦闘から外す（途中離脱）。外したら true。戻る場合は新しい参加者として途中参戦する */
    leave(pid) {
      if (!G || busy || G.pids[pid] == null) return false;
      const id = G.pids[pid];
      const u = G.units.find(x => x.id === id);
      delete G.pids[pid];
      if (!u) return false;
      G.units = G.units.filter(x => x.id !== id);
      if (G.stats) delete G.stats[id];
      if (G.sel === id) G.sel = null;
      if (G.prevCorrect === id) G.prevCorrect = null;
      G.wrongOn = (G.wrongOn || []).filter(x => x !== id);
      redoStack = [];
      log(`${u.name} が離脱した`, 'sys');
      checkEnd();
      ui.persist && ui.persist(G);
      emit();
      return true;
    },
    load(saved) { G = saved; undoStack = []; redoStack = []; busy = false; emit(); },
    reset() { G = null; undoStack = []; redoStack = []; busy = false; emit(); },

    /** 回答者を選ぶ（死亡・休み中は選べない。幽霊は選べる）。null で選択解除 */
    select(id) {
      if (!G || G.over || busy) return false;
      if (id == null) { G.sel = null; emit(); return true; }
      const u = G.units.find(x => x.id === id);
      if (!u || (!u.alive && !u.ghost) || u.restNow) return false;
      G.sel = id; emit();
      return true;
    },
    correct() { const a = G && G.units.find(x => x.id === G.sel); return a ? transact(() => doCorrect(a)) : false; },
    /** retry: 誤答のあとも同じ問題を続ける（誤答した人は、この問題ではもう答えられない） */
    wrong({ retry = false } = {}) { const a = G && G.units.find(x => x.id === G.sel); return a ? transact(() => doWrong(a, retry)) : false; },
    /** 進行中のユニットの調整（職業・体力・攻撃・生死・休み）。戻す操作で元に戻せる */
    edit(id, patch) {
      if (!G || busy) return false;
      const u = G.units.find(x => x.id === id); if (!u) return false;
      undoStack.push(JSON.stringify(G)); if (undoStack.length > 40) undoStack.shift();
      redoStack = [];
      u.edit = (u.edit || 0) + 1;                      // 画面に「手直し」だと伝える（攻撃・回復の演出を出さない。戻したときも手直しとして扱われる）
      if (typeof patch.name === 'string' && patch.name.trim()) u.name = patch.name.trim().slice(0, 12);
      if (!u.isBoss && patch.job && patch.job !== u.job && JOB[patch.job]) {          // 職業を変えると、その職業の基本の数値になる
        const j = JOB[patch.job];
        Object.assign(u, { job: patch.job, atk: j.atk, maxHp: j.hp, hp: Math.min(u.hp, j.hp) || j.hp, guards: patch.job === 'tank' ? Math.max(1, u.guards) : 0 });
        u.ghost = false; u.converted = false;
      }
      if (Array.isArray(patch.items) && !u.isBoss && !u.cpu) u.items = patch.items.filter(k => ITEMS[k]).slice(0, 20);      // 持ち物の付与・取り上げ
      const num = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(+v)));
      if (patch.maxHp != null && Number.isFinite(+patch.maxHp)) u.maxHp = num(patch.maxHp, 1, 99);
      if (patch.atk != null && Number.isFinite(+patch.atk) && !u.isBoss) u.atk = num(patch.atk, 0, 99);
      if (patch.hp != null && Number.isFinite(+patch.hp)) u.hp = num(patch.hp, 0, 999);
      u.hp = Math.min(u.hp, u.maxHp);
      if (patch.alive === true && u.hp <= 0) u.hp = 1;
      if (patch.alive === false || u.hp <= 0) {
        u.alive = false; u.hp = 0; if (G.sel === u.id) G.sel = null;
        u.poison = 0; u.poisonSkip = false; u.barrier = 0; u.mine = null;     // 倒れたら状態異常は消える
      }
      else if (patch.alive === true || !u.alive) { u.alive = true; u.ghost = false; u.hp = Math.max(1, u.hp); }
      if (typeof patch.rest === 'boolean') u.restNow = patch.rest;
      G.over = null; checkEnd();
      log(`✎ ${u.name} を調整（${JOB[u.job]?.n ?? '魔王'} ATK${u.atk} HP ${u.hp}/${u.maxHp}${u.alive ? '' : '・戦闘不能'}）`, 'sys');
      ui.persist && ui.persist(G);
      emit();
      return true;
    },
    skip() { return transact(doThrow); },
    /** CPUが早押しで競うか。オンのあいだ、CPUは「早押しに勝った問題」でだけ行動する（押し負け・スルーでは動かない） */
    setCpuBuzz(on) { if (G && !!G.cfg.cpuBuzz !== !!on) G.cfg.cpuBuzz = !!on; },
    /** CPUの早押し。回答者が決まっていない間だけ（ok: 正解したか） */
    cpuBuzz(id, ok, text = '') {
      const u = G && G.units.find(x => x.id === id);
      if (!u || G.sel != null || G.over || !(u.isBoss || u.cpu) || u.human || !u.alive || u.restNow) return false;
      return transact(() => doCpuBuzz(u, !!ok, String(text ?? '').slice(0, 40)));
    },
    undo() {
      if (busy || !undoStack.length) return false;
      redoStack.push(JSON.stringify(G));
      G = JSON.parse(undoStack.pop());
      G.over = null;
      ui.persist && ui.persist(G);
      emit();
      return true;
    },
    /** 「1つ戻す」で戻した操作を、もう一度進める（戻したあとに新しい操作をすると使えない） */
    redo() {
      if (busy || !redoStack.length) return false;
      undoStack.push(JSON.stringify(G)); if (undoStack.length > 40) undoStack.shift();
      G = JSON.parse(redoStack.pop());
      ui.persist && ui.persist(G);
      emit();
      return true;
    },
  };
}
