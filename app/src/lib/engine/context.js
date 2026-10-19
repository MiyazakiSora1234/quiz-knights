// 戦闘中の共通部品: ログ・位置関係・回復・対象選択・ダメージ処理（庇う→同時ダメージ→死亡処理）
import { BOSS, GENRES, LEVELS, jobName, nm, bossHp, bonusOf, iconKey } from './data.js';

/**
 * ui = { ask, random }、getG = 現在の戦闘状態を返す関数、emit = 画面へ変化を知らせる関数。
 * G は取り消し・キャンセルで差し替わるため、使うたびに getG() で最新を取る。
 */
export function createContext({ ui, getG, emit }) {
  // 選択ダイアログには「誰が選ぶか」(actor=ユニットid) を添える。その人の端末で選んでもらうため（null なら進行役）
  let actor = null;
  const setActor = id => { actor = id; };
  // CPU（魔王・CPUの職業ユニット）の行動中は、選択を自動で決める。ただし「誰が選ぶか」を指定した選択（タンクの庇いなど）は人に聞く
  let auto = null;
  const setAuto = u => { auto = u; };
  // 先読み（シミュレーション）中は、すべての選択を自動で決める。人には聞かない。庇いは使わない前提で評価する
  let sim = false;
  const setSim = v => { sim = v; };
  /** 画面に出す演出（コイントスなど）。全員の画面に同じ演出が出る。先読み中は出さない */
  const event = e => { if (sim) return; const G = getG(); G.eventSeq = (G.eventSeq || 0) + 1; G.event = { id: G.eventSeq, ...e }; emit(); };
  /** 特定のユニットに出す短い演出（毒・バリア・休み・成長など）。unit の kind で画面が見た目を決める */
  const fxUnit = (uid, kind) => { if (sim) return; const G = getG(); G.fxSeq = (G.fxSeq || 0) + 1; (G.fxs ||= []).push({ id: G.fxSeq, uid, kind }); if (G.fxs.length > 16) G.fxs.shift(); emit(); };
  const wait = ms => (sim || !ui.pause ? null : ui.pause(ms));
  const ask = (title, options, opts = {}) => {
    if (sim && title.startsWith('🛡')) return Promise.resolve(null);
    if ((auto && opts.actor == null) || (sim && auto)) return Promise.resolve(autoPick(title, options, auto));
    return ui.ask(title, options, { actor, ...opts });
  };
  const pickOf = list => list[Math.floor(rand() * list.length)];
  /** CPU の選び方: 行動はランダム。攻撃は体力の低い敵を狙い、回復は体力の割合が低い味方、蘇生・味方への補助は味方から選ぶ */
  function autoPick(title, options, a) {
    const G = getG();
    const real = options.filter(o => !o.disabled && o.cls !== 'ghost');
    if (title.startsWith('💰')) return null;                                  // ジャンル選択はしない
    if (!real.length) return options.find(o => o.cls === 'ghost')?.value ?? null;
    if (title.endsWith('の行動')) return pickOf(real).value;
    const cands = real.map(o => ({ o, u: typeof o.value === 'number' ? G.units.find(x => x.id === o.value) : null })).filter(c => c.u);
    if (!cands.length) return real[0].value;
    const lowest = (list, ratio) => {
      const key = c => (ratio ? c.u.hp / c.u.maxHp : c.u.hp);
      const m = Math.min(...list.map(key));
      return pickOf(list.filter(c => key(c) === m)).o.value;
    };
    if (/回復|蘇生|守る|指示する味方/.test(title)) {
      const mine = cands.filter(c => c.u.side === a.side);
      const pool = mine.length ? mine : cands;
      return /回復/.test(title) ? lowest(pool.filter(c => c.u.alive).length ? pool.filter(c => c.u.alive) : pool, true) : pickOf(pool).o.value;
    }
    const foes = cands.filter(c => c.u.side !== a.side && c.u.alive);
    return lowest(foes.length ? foes : cands, false);
  }
  const rand = () => (ui.random ? ui.random() : Math.random());

  /* ---------- 称号のための記録（G.stats[ユニットid]）。先読み中は記録しない ---------- */
  const rec = (u, k, n = 1) => { if (sim || !u) return; const G = getG(); const s = ((G.stats ??= {})[u.id] ??= { correct: 0, wrong: 0 }); s[k] = (s[k] || 0) + n; };
  const recMax = (u, k, v) => { if (sim || !u) return; const G = getG(); const s = ((G.stats ??= {})[u.id] ??= { correct: 0, wrong: 0 }); s[k] = Math.max(s[k] || 0, v); };
  let cur = null, act = null;      // いま行動している人と、その行動のあいだの集計
  /** 行動の開始: 終わったときに、増えたバリア・治った毒・蘇生・全体回復などを数えるため、いまの状態を覚えておく */
  function beginAct(a) {
    cur = a;
    act = { dealt: 0, foes: new Set(), snap: new Map(getG().units.map(u => [u.id, { hp: u.hp, barrier: u.barrier || 0, poison: u.poison || 0, alive: u.alive }])) };
  }
  function endAct() {
    const a = cur, s = act; cur = null; act = null;
    if (!a || !s || sim) return;
    const G = getG();
    const mine = G.units.filter(u => u.side === a.side);
    recMax(a, 'maxAct', s.dealt);
    if (s.foes.size >= 2) rec(a, 'multiHit');
    const gained = mine.filter(u => (u.barrier || 0) > (s.snap.get(u.id)?.barrier ?? 0)).length;
    if (gained) rec(a, 'barrierGiven', gained);
    const cured = mine.filter(u => u.alive && (s.snap.get(u.id)?.poison ?? 0) > 0 && !(u.poison > 0)).length;
    if (cured) rec(a, 'cured', cured);
    const revived = mine.filter(u => u.alive && s.snap.get(u.id) && !s.snap.get(u.id).alive).length;
    if (revived) rec(a, 'revive', revived);
    const alive0 = mine.filter(u => s.snap.get(u.id)?.alive);
    if (alive0.length >= 2 && alive0.every(u => u.alive && u.hp > s.snap.get(u.id).hp)) rec(a, 'healAll');
  }

  const log = (m, c = '') => {
    const G = getG();
    G.log.unshift({ m, c });
    if (G.log.length > 300) G.log.pop();
    emit();
  };

  /* ---------- 位置・陣営 ---------- */
  const foesOf = a => getG().units.filter(u => u.alive && u.side !== a.side);
  /** 魔王1の「半分以下で+2」を含めた与ダメージ */
  // 魔王・CPUの与えるダメージは、難易度で加減される（0ダメージの技は0のまま、1以上は1未満にならない）
  const dm = (a, n) => {
    const lv = LEVELS[getG().cfg?.level] ?? LEVELS.normal;
    const adj = (a && (a.isBoss || a.cpu)) ? lv.dmg : 0;
    const bm = lv.hidden ? 1 : ((a && a.isBoss && !a.human && BOSS[a.bossId] && BOSS[a.bossId].dmgMul) || 1);      // 魔王ごとの与ダメージの倍率（バランス調整用）
    return n > 0 ? Math.max(1, Math.round((n + bonusOf(a)) * bm) + adj) : n + bonusOf(a);
  };

  /* ---------- 回復・休み ---------- */
  function heal(u, n) {
    if (!u.alive) return 0;
    const before = u.hp;
    u.hp = Math.min(u.maxHp, u.hp + n);
    log(`${nm(u)} は ${u.hp - before} 回復 (HP ${u.hp}/${u.maxHp})`, 'heal');
    if (cur && u.hp > before) { rec(cur, 'healed', u.hp - before); if (before === 1 && u !== cur && u.side === cur.side) rec(cur, 'saveLife'); }
    return u.hp - before;
  }
  /** 次の問題休み。すでに今回休みの人は連続では休みにならない */
  function setRest(t) {
    if (!t.alive) return;
    if (t.restNow) { log(`${t.name} は今回すでに休みなので連続では休みにならない`); return; }
    t.restNext = true; fxUnit(t.id, 'rest');
    if (cur && t.side !== cur.side) rec(cur, 'restFoe');
    log(`${t.name} は次の問題休み`, 'sys');
  }

  /* ---------- 対象・ジャンルの選択 ---------- */
  /** 選択ダイアログ用の選択肢（ユニットのアイコン付き） */
  // 敵かどうかは、選ぶ本人から見て決める（本人がいなければ、魔王・CPU・チームB側を敵とする）
  const isFoe = u => {
    const G = getG();
    const me = auto || (actor != null ? G.units.find(x => x.id === actor) : null);
    return me ? u.side !== me.side : u.side === 'e';
  };
  // 対象の選択肢を、敵・味方（対戦ではチーム）ごとに分けて見せるための印
  const TEAM_NAME = { p: 'チームA', e: 'チームB', c: 'チームC' };
  const groupInfo = u => {
    const G = getG(), foe = isFoe(u);
    const versus = G.mode === 'pvp' && !G.cpu;
    const label = versus ? `${TEAM_NAME[u.side] ?? 'チーム'}（${foe ? '敵' : '味方'}）` : (foe ? '敵' : '味方');
    return { group: label, gcls: foe ? 'foe' : 'ally', gorder: (foe ? 0 : 10) + ({ p: 0, e: 1, c: 2 }[u.side] ?? 0) };
  };
  const unitOption = (u, extra = {}) => ({
    ...groupInfo(u),
    label: u.name,
    sub: `${jobName(u)}　HP ${u.hp}/${u.maxHp}${u.alive ? '' : '（死亡）'}${isFoe(u) ? '　【敵】' : ''}`,
    value: u.id,
    cls: isFoe(u) ? 'foe' : '',
    unit: { job: iconKey(u), side: isFoe(u) ? 'e' : 'p', alive: u.alive },
    ...extra,
  });
  /** 対象の選択で「戻る」を選んだときの値（行動の選び直しに戻る） */
  const BACK = '__back__';
  /** 条件 f に合うユニットから1人選ばせる。候補がいなければ null。opts.back なら「行動を選びなおす」も出す（人が選ぶときだけ） */
  async function pickUnit(label, f, picked, opts = {}) {
    const G = getG();
    const cands = G.units.filter(u => f(u, picked));
    if (!cands.length) return null;
    const options = cands.map(u => unitOption(u));
    if (opts.back && !auto && !sim) options.push({ label: '← 行動を選びなおす', value: BACK, cls: 'ghost' });
    const id = await ask(label, options, { sub: '対象を選んでください' });
    if (id === BACK) return BACK;
    return G.units.find(u => u.id === id);
  }
  async function pickGenre() {
    const G = getG();
    const genres = G.genres && G.genres.length ? G.genres : GENRES;
    const g = await ask('💰 次の問題のジャンルを選択', [...genres.map(x => ({ label: x, value: x })), { label: '選ばない', value: null, cls: 'ghost' }]);
    if (g) { event({ kind: 'genre', genre: g }); G.genre = g; G.genreFor = G.q + 1; log(`次の問題のジャンル：${g}`, 'sys'); rec(G.units.find(x => x.id === actor), 'genrePick'); }
    return g || null;
  }

  /* ---------- ダメージ処理 ---------- */
  /** タンクによる庇い（攻撃元と対象が敵対しているときのみ）。庇われた分は対象がタンクに替わる */
  async function protect(events) {
    const G = getG();
    const out = [];
    for (const e of events) {
      let ev = e;
      if (e.src && !e.blast && e.amt > 0 && e.to.alive && e.src.side !== e.to.side) {
        const tanks = G.units.filter(t => t.alive && t.job === 'tank' && t.guards > 0 && t.side === e.to.side && t !== e.to);
        if (tanks.length) {
          const opts = tanks.map(t => ({ label: `${t.name} が代わりに受ける`, sub: `守り残り ${t.guards}`, value: t.id, cls: 'ok' }));
          opts.push({ label: '庇わない', value: null, cls: 'ghost' });
          const c = await ask(`🛡 ${e.to.name} への ${e.amt} ダメージ（${e.src.name}）`, opts, { sub: 'タンクが庇いますか？', actor: tanks.length === 1 ? tanks[0].id : null });
          if (c !== null) {
            const t = G.units.find(x => x.id === c);
            t.guards--; fxUnit(t.id, 'shield'); rec(t, 'guard');
            log(`🛡 ${t.name} が ${e.to.name} を庇った (守り残り ${t.guards})`, 'sys');
            ev = { src: e.src, to: t, amt: e.amt };
          }
        }
      }
      out.push(ev);
    }
    return out;
  }

  /** 同時にダメージを与える。バリアは1回分を無効にする。戻り値は実際に与えた合計と、倒した相手の記録 */
  function strike(events, startAlive) {
    let dealt = 0;
    const slayer = {};
    for (const e of events) {
      if (!startAlive.has(e.to.id) || e.amt <= 0) continue;
      if (e.to.barrier > 0) { e.to.barrier--; fxUnit(e.to.id, 'barrier'); log(`🔰 ${e.to.name} のバリアがダメージを防いだ`, 'sys'); rec(e.to, 'blocked'); continue; }
      const wasAlive = e.to.hp > 0;
      const real = Math.min(e.amt, Math.max(e.to.hp, 0));
      dealt += real;
      rec(e.to, 'taken', real);
      if (e.blast && real > 0) rec(e.to, 'blasted');
      if (e.src) {
        rec(e.src, 'dealt', real);
        const foe = e.src.side !== e.to.side;
        if (foe) rec(e.src, 'dealtFoe', real); else if (e.src !== e.to) rec(e.src, 'friendly');
        if (act && e.src === cur) { act.dealt += real; if (foe) act.foes.add(e.to.id); }
        if (foe && wasAlive && e.to.hp - e.amt <= 0) rec(e.src, 'kills');
      }
      e.to.hp -= e.amt;
      log(`${nm(e.to)} に ${e.amt} ダメージ${e.src ? `（${e.src.name}）` : ''} → HP ${Math.max(0, e.to.hp)}/${e.to.maxHp}`, 'dmg');
      if (wasAlive && e.to.hp <= 0) slayer[e.to.id] = e.src;
    }
    return { dealt, slayer };
  }

  /** 魔王が形態を持っていれば次の形態へ（倒れずに変身する）。変身したら true */
  function transformBoss(k) {
    if (!(k.isBoss && k.form < BOSS[k.bossId].forms.length - 1)) return false;
    k.form++;
    k.maxHp = k.hp = bossHp(k.S, k.bossId);
    log(`${k.name} は ${BOSS[k.bossId].forms[k.form]} に変身した！ (HP ${k.hp})`, 'sys');
    event({ kind: 'transform', who: k.name, bossId: k.bossId, form: BOSS[k.bossId].forms[k.form] });
    return true;
  }

  /** ユニットが倒れたときの処理。連鎖する追加ダメージのイベントを返す */
  function kill(k, startAlive, slayer) {
    const G = getG();
    const next = [];
    k.alive = false; k.hp = 0; k.poison = 0; k.barrier = 0; k.mine = null; k.noWrong = false;
    log(`${nm(k)} は倒れた…`, 'sys');
    if (k.isBoss) { event({ kind: 'bossdown', who: k.name, bossId: k.bossId }); if (!sim) { const L = (G.bossDown ??= []); if (!L.includes(k.bossId)) L.push(k.bossId); } }
    if (k.job === 'ghost' && !k.ghostUsed) {
      k.ghost = true; k.ghostUsed = true;
      log(`👻 ${k.name} は幽霊になった（あと1回だけ答えられる）`, 'sys'); fxUnit(k.id, 'ghost');
    }
    if (k.job === 'bomb' && !k.bombUsed) {
      // 爆発: 自分以外の全員（敵も味方も）に2ダメージ。庇うことはできない。蘇生されて倒れ直しても、爆発は1回だけ
      k.bombUsed = true;
      for (const n of G.units) if (n !== k && (n.alive || startAlive.has(n.id))) next.push({ src: k, to: n, amt: 2, blast: true });
      log('💥 ばくだんいわが爆発！', 'sys');
      event({ kind: 'bomb', who: k.name });
    }
    // 魔王2の第3形態に倒されると、体力1で魔王の仲間として復活し、敵全体に1ダメージ
    if (slayer && slayer.isBoss && slayer.bossId === 2 && slayer.form === 2 && !k.isBoss && k.side !== slayer.side) {
      k.side = 'e'; k.alive = true; k.hp = 1; k.converted = true; k.ghost = false; k.ghostUsed = true;
      log(`${k.name} は魔王の仲間として体力1で復活した！`, 'sys');
      for (const f of G.units) if (f.alive && f.side === 'p' && f.id !== k.id) next.push({ src: slayer, to: f, amt: 1 });
    }
    if (!k.alive && slayer && slayer.side !== k.side && !G.units.some(u => u.alive && u.side === k.side)) rec(slayer, 'finisher');
    return next;
  }

  /**
   * events:[{src,to,amt}] を処理する。庇う → 同時ダメージ → 死亡処理（爆発などの連鎖あり）。
   * 実際に与えたダメージの合計を返す。
   */
  async function applyEvents(events) {
    let total = 0;
    let queue = events;
    while (queue.length) {
      queue = await protect(queue);
      const G = getG();
      const startAlive = new Set(G.units.filter(u => u.alive).map(u => u.id));
      const { dealt, slayer } = strike(queue, startAlive);
      total += dealt;
      const next = [];
      for (const k of G.units.filter(u => u.alive && u.hp <= 0)) {
        if (transformBoss(k)) continue;
        next.push(...kill(k, startAlive, slayer[k.id]));
      }
      queue = next;
    }
    return total;
  }
  const dmgTo = (src, targets, amt) => applyEvents(targets.map(t => ({ src, to: t, amt })));

  return {
    get G() { return getG(); },
    BACK, rec, recMax, beginAct, endAct, event, fxUnit, wait, ask, setActor, setAuto, setSim, rand, log, foesOf, dm, heal, setRest, unitOption, pickUnit, pickGenre, applyEvents, dmgTo,
  };
}
