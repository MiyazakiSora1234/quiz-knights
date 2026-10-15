// バトルの進行: 正解・誤答・スルー、問題の終わり、取り消し（画面に依存しない。Node でもテストできる）
//  ui = { ask(title, options, {sub,cancel}) -> Promise, random?(), toast(msg), changed(snapshot), persist?(G) }
import { CANCEL, JOB, BOSS, GENRES, jobName, nm, bossHp } from './data.js';
import { createContext } from './context.js';
import { buildActions } from './jobs.js';

export function createBattle(ui) {
  let G = null, undoStack = [], busy = false, pending = false;

  /** 変化を画面へ知らせる（同じ瞬間の変化は1回にまとめる） */
  const emit = () => {
    if (pending) return;
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

  /* ---------- 決着・問題の終わり ---------- */
  function checkEnd() {
    if (G.over) return;
    if (G.mode === 'pvp') {
      const p = G.units.some(u => u.alive && u.side === 'p'), e = G.units.some(u => u.alive && u.side === 'e');
      if (!p || !e) G.over = p ? 'teamp' : e ? 'teame' : 'draw';
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
      events.push({ src: null, to: u, amt: 1 });
    }
    if (events.length) { log('☠ 毒のダメージ', 'sys'); await applyEvents(events); }
  }

  /** 1問が終わったとき。correct は正解した人（いなければ null） */
  async function endQuestion(correct) {
    await tickPoison();
    for (const u of G.units) { u.restNow = u.restNext; u.restNext = false; }
    G.prevCorrect = correct ? correct.id : null;
    G.wrongOn = [];
    if (!correct) G.streak = 0;
    G.q++; G.sel = null;
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
    await applyEvents([{ src: by || null, to: a, amt: dmg }]);
    return !a.alive;
  }

  /** 正解したことで得るもの（連答・タンクの守り・勇者への転職・魔王3の回復） */
  function gainFromCorrect(a) {
    G.streak = (G.prevCorrect === a.id) ? (G.streak || 1) + 1 : 1;
    if (a.job === 'tank') { a.guards++; log(`🛡 ${a.name} の守り回数 +1 (${a.guards})`, 'sys'); }
    if (a.job === 'playboy' && G.streak >= 2) {
      const h = JOB.hero;
      a.job = 'hero'; a.atk = h.atk; a.maxHp = h.hp; a.hp = h.hp;
      log(`🎲→👑 ${a.name} は連答で勇者に転職！体力リセット (HP ${a.hp})`, 'sys');
    }
    if (a.isBoss && a.bossId === 3 && a.hp === 1) heal(a, 5);
  }

  /** 行動を選ばせて実行する。選択肢の対象を1つずつ聞き、足りなければ不発 */
  async function chooseAndRunAction(a) {
    const acts = buildActions(ctx, a);
    const noSpecial = acts.every(x => x.disabled);
    const options = [
      ...acts.map((x, i) => ({ label: x.label, sub: x.desc, value: i, disabled: x.disabled || !x.prompts.every(p => G.units.some(u => p.f(u, []))) })),
      { label: '何もしない', value: -1, cls: 'ghost' },
    ];
    const c = await ask(`${nm(a)} の行動`, options, { sub: noSpecial ? '使える行動がありません' : '行動を選んでください' });
    if (c < 0) return;
    const act = acts[c], picked = [];
    for (const p of act.prompts) {
      const t = await ctx.pickUnit(p.label, p.f, picked);
      if (!t) { log('対象がいないため不発'); return; }
      picked.push(t);
    }
    await act.run(picked);
  }

  /** 行動のあとの後始末（盗賊のジャンル選択・見習いの成長・幽霊の成仏） */
  async function afterAction(a) {
    if (a.job === 'thief' && a.alive && !G.over) await pickGenre();
    if (a.job === 'apprentice' && a.alive && a.atk < 5) {
      a.atk++; a.maxHp++; a.hp++;
      log(`🌱 ${a.name} は成長した！ (攻撃${a.atk} / 体力${a.hp}/${a.maxHp})`, 'sys');
    }
    if (a.ghost) { a.ghost = false; a.ghostUsed = true; log(`👻 ${a.name} は成仏した`, 'sys'); }
  }

  /** その人が選ぶ場面（行動・対象・押し付け先など）では、その人の端末に選択ダイアログを出す */
  const asActor = async (a, fn) => { ctx.setActor(a.id); try { await fn(); } finally { ctx.setActor(null); } };

  const doCorrect = a => asActor(a, () => doCorrectBody(a));
  async function doCorrectBody(a) {
    stat(a, 'correct');
    log(`⭕ ${nm(a)} 正解！`, 'sys');
    if (await stepOnMine(a)) { await endQuestion(a); return; }
    gainFromCorrect(a);
    await chooseAndRunAction(a);
    await afterAction(a);
    await endQuestion(a);
  }

  /* ---------- 誤答 ---------- */
  /** 道化師: 誤答の2ダメージを他の1人に押し付けられる */
  async function jesterPush(a) {
    const others = G.units.filter(u => u.alive && u !== a);
    const choice = await ask('🃏 道化師：誤答の2ダメージを誰かに押し付ける？', [
      ...others.map(u => ctx.unitOption(u, { sub: `${jobName(u)}　HP ${u.hp}/${u.maxHp}`, cls: u.side !== a.side ? 'foe' : '' })),
      { label: '自分で受ける', value: null, cls: 'ghost' },
    ], { sub: '押し付けた相手が2ダメージを受けます' });
    const target = choice === null ? a : G.units.find(x => x.id === choice);
    await applyEvents([{ src: target === a ? null : a, to: target, amt: 2 }]);
  }

  /** 誤答の罰（役職に関係なく2ダメージ。幽霊・魔王の設定・軍師の加護・道化師は例外） */
  async function wrongPenalty(a) {
    if (a.ghost) { a.ghost = false; a.ghostUsed = true; log(`👻 ${a.name} は成仏した`, 'sys'); return; }
    if (a.isBoss && !G.cfg.bossPenalty) { log('魔王は誤答ペナルティなし'); return; }
    if (a.noWrong) { a.noWrong = false; log(`📜 ${a.name} は作戦で誤答ダメージを受けない`, 'sys'); return; }
    if (a.job === 'jester' && G.units.some(u => u.alive && u !== a)) { await jesterPush(a); return; }
    await applyEvents([{ src: null, to: a, amt: 2 }]);
  }

  /** retry=true: 問題は終わらせず、誤答した人を除いて同じ問題をもう一度受け付ける */
  const doWrong = (a, retry = false) => asActor(a, () => doWrongBody(a, retry));
  async function doWrongBody(a, retry) {
    stat(a, 'wrong');
    log(`❌ ${nm(a)} 誤答`, 'sys');
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
      undoStack.push(snap);
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

    /** players:[{name,job,team,pid?}] */
    start({ players, mode = 'cpu', boss = 1, bossPenalty = true, genres = null, foes = [] }) {
      // foes: 魔王の代わりに、CPU の職業ユニットが相手になる（進行役が操作する。ルールは対戦と同じ）
      const squad = mode === 'cpu' && foes.length > 0;
      if (squad) mode = 'pvp';
      G = { cpu: squad, mode, uid: 1, units: [], log: [], q: 1, prevCorrect: null, streak: 0, genre: null, genreFor: 0, sel: null, over: null, pids: {}, stats: {},
            genres: (genres && genres.length) ? [...genres] : [...GENRES], cfg: { bossPenalty } };
      const pvp = mode === 'pvp';
      for (const p of players) {
        const u = mkPlayer(p.name.trim(), p.job);
        if (pvp) u.side = squad ? 'p' : (p.team || 'p');
        G.units.push(u);
        if (p.pid) G.pids[p.pid] = u.id;
      }
      if (squad) {
        const count = {};
        for (const j of foes) {
          const key = JOB[j] && j !== 'hero' ? j : 'warrior';
          count[key] = (count[key] || 0) + 1;
          const total = foes.filter(x => x === j).length;
          const u = mkPlayer(`CPU${JOB[key].n}${total > 1 ? count[key] : ''}`, key);
          u.side = 'e'; u.cpu = true;
          G.units.push(u);
        }
      }
      if (pvp) {
        G.units.sort((a, b) => (a.side === 'p' ? 0 : 1) - (b.side === 'p' ? 0 : 1)); // チームごとに席を連続させる
        log(squad ? `バトル開始！ プレイヤー vs CPU（${G.units.filter(u => u.cpu).map(u => u.name).join('・')}）` : '対戦開始！ チームA vs チームB', 'sys');
      } else {
        const S = G.units.reduce((s, u) => s + u.atk, 0);
        const b = mkBoss(+boss, S);
        G.units.push(b);
        log(`バトル開始！ ${b.name} (HP ${b.hp}) ／ プレイヤー攻撃合計 ${S}`, 'sys');
      }
      log('── 第1問 ──', 'sys');
      undoStack = []; busy = false;
      ui.persist && ui.persist(G);
      emit();
    },
    /** 戦闘中に新しい参加者を加える（途中参戦）。魔王のHPは変えない。加えられたら true */
    join({ name, job = 'warrior', team = 'p', pid }) {
      if (!G || G.over || busy || (pid && G.pids[pid] != null)) return false;
      const u = mkPlayer(String(name).trim() || '名無し', JOB[job] && job !== 'hero' ? job : 'warrior');
      if (G.mode === 'pvp') {
        u.side = team === 'e' && !G.cpu ? 'e' : 'p';
        const last = G.units.map(x => x.side).lastIndexOf(u.side);   // 自分のチームの最後尾に入れる
        G.units.splice(last + 1, 0, u);
      } else {
        const b = G.units.findIndex(x => x.isBoss);
        G.units.splice(b < 0 ? G.units.length : b, 0, u);
      }
      if (pid) G.pids[pid] = u.id;
      log(`${u.name} が途中参戦！（${JOB[u.job].n}）`, 'sys');
      ui.persist && ui.persist(G);
      emit();
      return true;
    },
    load(saved) { G = saved; undoStack = []; busy = false; emit(); },
    reset() { G = null; undoStack = []; busy = false; emit(); },

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
      if (typeof patch.name === 'string' && patch.name.trim()) u.name = patch.name.trim().slice(0, 12);
      if (!u.isBoss && patch.job && patch.job !== u.job && JOB[patch.job]) {          // 職業を変えると、その職業の基本の数値になる
        const j = JOB[patch.job];
        Object.assign(u, { job: patch.job, atk: j.atk, maxHp: j.hp, hp: Math.min(u.hp, j.hp) || j.hp, guards: patch.job === 'tank' ? Math.max(1, u.guards) : 0 });
        u.ghost = false; u.converted = false;
      }
      const num = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(+v)));
      if (patch.maxHp != null && Number.isFinite(+patch.maxHp)) u.maxHp = num(patch.maxHp, 1, 99);
      if (patch.atk != null && Number.isFinite(+patch.atk) && !u.isBoss) u.atk = num(patch.atk, 0, 99);
      if (patch.hp != null && Number.isFinite(+patch.hp)) u.hp = num(patch.hp, 0, 999);
      u.hp = Math.min(u.hp, u.maxHp);
      if (patch.alive === true && u.hp <= 0) u.hp = 1;
      if (patch.alive === false || u.hp <= 0) { u.alive = false; u.hp = 0; if (G.sel === u.id) G.sel = null; }
      else if (patch.alive === true || !u.alive) { u.alive = true; u.ghost = false; u.hp = Math.max(1, u.hp); }
      if (typeof patch.rest === 'boolean') u.restNow = patch.rest;
      G.over = null; checkEnd();
      log(`✎ ${u.name} を調整（${JOB[u.job]?.n ?? '魔王'} ATK${u.atk} HP ${u.hp}/${u.maxHp}${u.alive ? '' : '・戦闘不能'}）`, 'sys');
      ui.persist && ui.persist(G);
      emit();
      return true;
    },
    skip() { return transact(doThrow); },
    undo() {
      if (busy || !undoStack.length) return false;
      G = JSON.parse(undoStack.pop());
      G.over = null;
      ui.persist && ui.persist(G);
      emit();
      return true;
    },
  };
}
