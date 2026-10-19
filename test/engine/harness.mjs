// テスト共通の道具: 台本式の ask、乱数、状態の整合性チェック
import assert from 'node:assert/strict';
import { createBattle, CANCEL, BOSS, ITEMS } from '../../app/src/lib/engine.js';

export { CANCEL };
export const P = (name, job, team = 'p') => ({ name, job, team });

/** 再現可能な乱数（mulberry32） */
export function rng(seed) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.int = n => Math.floor(f() * n);
  f.pick = arr => arr[f.int(arr.length)];
  return f;
}

/**
 * askFn(title, opts, step) を差し替えられるハーネス。
 * 既定は「台本（script）に書いた文字列をラベルに含む選択肢を選ぶ」
 */
export function harness({ askFn = null, random = null } = {}) {
  const script = [];
  const rolls = [];
  const asked = [];
  let step = 0;
  const ui = {
    async ask(title, opts0) {
      // 対象選択の「戻る」は、台本・自動選択のテストでは選ばない（選ぶと行動の選び直しに戻って終わらなくなる）
      const opts = opts0.filter(o => o.value !== '__back__');
      asked.push({ title, opts: opts0 });
      const i = step++;
      if (askFn) return askFn(title, opts, i);
      const s = script.shift();
      if (s === undefined) throw new Error('想定外の質問: ' + title + ' / ' + opts.map(o => o.label).join('|'));
      if (s === CANCEL) throw CANCEL;
      // 「技N」は、魔王の行動メニューのN番目の技（技には名前が付いているので、番号で選べるようにしている）
      const nth = typeof s === 'string' && /^技[1-9]$/.exec(s) ? opts[+s[1] - 1] : null;
      const o = nth ?? opts.find(x => x.label.includes(s));
      if (!o) throw new Error(`選択肢「${s}」がありません: ${opts.map(x => x.label).join(' | ')}`);
      if (o.disabled) throw new Error(`選択肢「${s}」は無効です`);
      return o.value;
    },
    random: random || (() => (rolls.length ? rolls.shift() : 0.9)),
    toast() {}, changed() {}, persist() {},
  };
  const b = createBattle(ui);
  const u = name => b.G.units.find(x => x.name === name);
  const correct = async (name, ...answers) => {
    script.push(...answers);
    assert.ok(b.select(u(name).id), `${name} を選択できない`);
    const ok = await b.correct();
    assert.equal(script.length, 0, '台本が余っている: ' + script.join(','));
    return ok;
  };
  const wrong = async name => { b.select(u(name).id); return b.wrong(); };
  const snap = () => JSON.stringify(b.G);
  return { b, u, script, rolls, asked, correct, wrong, snap, ui, resetStep: () => { step = 0; } };
}

/** どの時点でも成り立つべき整合性（Gは engine の生の状態） */
export function checkInvariants(G, ctx = '') {
  const fail = m => assert.fail(`[不変条件違反] ${m}\n  状況: ${ctx}\n  状態: ${JSON.stringify(G.units.map(u => ({ n: u.name, j: u.job, s: u.side, hp: u.hp, mx: u.maxHp, a: u.alive, g: u.ghost })))}`);
  if (!G) fail('G が null');
  const ids = new Set();
  for (const u of G.units) {
    if (ids.has(u.id)) fail('id が重複 ' + u.id);
    ids.add(u.id);
    if (!Number.isFinite(u.hp) || !Number.isFinite(u.maxHp) || !Number.isFinite(u.atk)) fail(`${u.name} の数値が不正`);
    if (u.maxHp < 1) fail(`${u.name} の最大HPが1未満`);
    if (u.atk < 0) fail(`${u.name} の攻撃力が負`);
    if (u.side !== 'p' && u.side !== 'e' && u.side !== 'c') fail(`${u.name} の陣営が不正`);
    if (u.isBoss && !u.human && u.side !== 'e') fail('魔王が敵陣営でない');
    if (u.alive) {
      if (!(u.hp >= 1 && u.hp <= u.maxHp)) fail(`${u.name} は生存だが HP=${u.hp}/${u.maxHp}`);
      if (u.ghost) fail(`${u.name} が生存かつ幽霊`);
    } else {
      if (u.hp !== 0) fail(`${u.name} は死亡だが HP=${u.hp}`);
      if (u.poison > 0 || u.barrier > 0 || u.mine) fail(`${u.name} は死亡だが状態異常が残っている`);
      if (u.isBoss && u.form < BOSS[u.bossId].forms.length - 1) fail('途中形態の魔王が死亡扱い');
    }
    if (u.ghost && u.job !== 'ghost') fail(`${u.name} が幽霊でないのに ghost`);
    if (u.guards < 0 || !Number.isInteger(u.guards)) fail(`${u.name} の守り回数が不正`);
    if (u.poison != null && !(u.poison >= 0 && u.poison <= 2)) fail(`${u.name} の毒の値が不正`);
    if (u.barrier != null && !(u.barrier >= 0 && u.barrier <= 1)) fail(`${u.name} のバリアの値が不正`);
    if (u.items != null) {
      if (!Array.isArray(u.items) || u.items.some(k => !ITEMS[k])) fail(`${u.name} の持ち物が不正`);
      if (u.isBoss || u.cpu) fail(`${u.name} は魔王/CPU なのにアイテムを持っている`);
    }
    if (!u.isBoss && u.maxHp > 150) fail(`${u.name} の最大HPが大きすぎる`);
  }
  if (!(G.q >= 1) || !Number.isInteger(G.q)) fail('問題番号が不正');
  if (G.sel != null && !G.units.some(u => u.id === G.sel)) fail('選択中のユニットが存在しない');
  for (const [pid, uid] of Object.entries(G.pids || {})) if (!ids.has(uid)) fail(`pid ${pid} が存在しないユニットを指す`);
  for (const [id, st] of Object.entries(G.stats || {})) if (!(st.correct >= 0 && st.wrong >= 0) || !ids.has(+id)) fail('成績が不正');
  const aliveP = G.units.some(u => u.alive && u.side === 'p');
  const aliveE = G.units.some(u => u.alive && u.side === 'e');
  const bossesDead = G.units.filter(u => u.isBoss).every(b => !b.alive);
  if (G.over) {
    if (G.mode === 'pvp') {
      const teamsAlive = [...new Set(G.units.filter(u => u.alive).map(u => u.side))];
      if (G.over === 'draw' && teamsAlive.length) fail('draw なのに生存者がいる');
      if (G.over.startsWith('team') && !(teamsAlive.length === 1 && teamsAlive[0] === G.over.slice(4))) fail(`${G.over} なのに条件を満たさない`);
    } else {
      if (G.over === 'win' && !bossesDead) fail('win なのに魔王が生存');
      if (G.over === 'lose' && aliveP) fail('lose なのにプレイヤーが生存');
    }
  } else {
    if (G.mode === 'pvp' && new Set(G.units.filter(u => u.alive).map(u => u.side)).size <= 1) fail('対戦の決着条件を満たしているのに over が未設定');
    if (G.mode !== 'pvp' && (bossesDead || !aliveP)) fail('CPU戦の決着条件を満たしているのに over が未設定');
  }
  // JSON で往復しても同じ（保存・取り消しの前提）
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(G))), JSON.stringify(G), 'JSON往復で状態が変わる');
}
