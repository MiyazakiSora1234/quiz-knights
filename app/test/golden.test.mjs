// ゴールデンテスト（挙動の固定）: 決まった乱数で戦闘を最後まで進め、結果の要約を保存した値と比べる。
// リファクタリングで戦闘の挙動が1つでも変わると、どの条件で変わったかが名前でわかる。
// 意図して挙動を変えたときだけ、`UPDATE_GOLDEN=1 npm test` で保存し直す。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createBattle, SELECTABLE, recommendedHpScale } from '../src/lib/engine.js';
import { rng } from './harness.mjs';

const FILE = path.join(import.meta.dirname, 'golden', 'engine.json');
const UPDATE = process.env.UPDATE_GOLDEN === '1';
const saved = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const fresh = {};

/** 条件から戦闘を最後まで進め、結果の要約（決着・問題数・全ユニットの最終状態・ログの末尾・成績）を返す */
async function run(cfg) {
  const r = rng(cfg.seed);
  const pick = a => a[Math.floor(r() * a.length)];
  const b = createBattle({
    ask: async (t, o) => {
      const ok = o.filter(x => !x.disabled && x.value !== '__back__');
      if (t.startsWith('🛡')) return r() < 0.5 ? o.find(x => x.cls === 'ghost').value : ok[0].value;
      if (t.endsWith('の行動')) { const acts = ok.filter(x => x.cls !== 'ghost'); return (r() < 0.75 && acts.length ? pick(acts) : ok[0]).value; }
      return pick(ok).value;
    },
    toast() {}, changed() {}, random: r,
  });
  const n = cfg.n;
  const players = Array.from({ length: n }, (_, i) => ({ name: 'P' + i, job: pick(SELECTABLE), team: cfg.mode === 'pvp' ? ['p', 'e', 'c'][i % (cfg.teams || 2)] : 'p', pid: 'x' + i }));
  b.start({ players, mode: cfg.mode, foes: cfg.foes ?? [], boss: cfg.boss ?? 1, level: cfg.level ?? 'normal', cpuAuto: cfg.mode === 'cpu', hpScale: cfg.scaled ? recommendedHpScale(cfg.mode, n) : 1 });
  let q = 0;
  while (!b.G.over && q < 80) {
    q++;
    const x = r(), alive = b.G.units.filter(u => (u.alive || u.ghost) && !u.restNow && !u.isBoss && !u.cpu);
    if (!alive.length || x < 0.1) { await b.skip(); continue; }
    if (x < 0.15) { b.undo(); continue; }
    if (x < 0.18) { b.join({ name: 'L' + q, job: pick(SELECTABLE), team: pick(['p', 'e']), pid: 'l' + q }); continue; }
    const u = pick(alive); b.select(u.id);
    if (r() < 0.6) await b.correct(); else await b.wrong({ retry: r() < 0.3 });
  }
  const G = b.G;
  return {
    over: G.over, q: G.q,
    units: G.units.map(u => `${u.name}|${u.job}|${u.side}|${u.hp}/${u.maxHp}|${u.alive ? 1 : 0}|${u.poison || 0}${u.barrier || 0}${u.restNow ? 'r' : ''}`),
    logTail: G.log.slice(0, 4).map(l => l.m),
    logLen: Math.min(G.log.length, 300),
    stats: Object.fromEntries(Object.entries(G.stats || {}).map(([k, v]) => [k, `${v.correct}/${v.wrong}`])),
  };
}

const CASES = [];
let seed = 1;
for (const boss of [1, 2, 3, 4, 5, 6]) for (const level of ['base', 'weak', 'normal', 'strong', 'extreme']) for (const n of [2, 4, 7]) CASES.push({ seed: seed++, mode: 'cpu', boss, level, n, scaled: n !== 7 });
for (const n of [2, 3, 4, 6, 8]) for (const teams of [2, 3]) for (let k = 0; k < 4; k++) CASES.push({ seed: seed++, mode: 'pvp', n, teams, scaled: k % 2 === 0 });
for (let k = 0; k < 24; k++) CASES.push({ seed: seed++, mode: 'cpu', n: 3 + (k % 4), foes: [['warrior', 'monk'], ['bm', 'berserker', 'mw'], ['boss1', 'warrior'], ['boss2', 'boss3'], ['tank', 'tank', 'cleric', 'bard']][k % 5], level: ['normal', 'strong'][k % 2], scaled: true });

for (const cfg of CASES) {
  const name = `[固定] ${cfg.mode} 種${cfg.seed} ${cfg.mode === 'cpu' ? (cfg.foes ? 'foes=' + cfg.foes.join('+') : `魔王${cfg.boss}`) + ' ' + cfg.level : `${cfg.teams}チーム`} ${cfg.n}人${cfg.scaled ? '(体力調整)' : ''}`;
  test(name, async () => {
    const got = await run(cfg);
    fresh[cfg.seed] = got;
    if (UPDATE || !saved[cfg.seed]) return;       // 初回・更新時は保存するだけ
    assert.deepEqual(got, saved[cfg.seed], '戦闘の結果が保存した値と違う（挙動が変わった）');
  });
}

test('[固定] 保存した値の更新（UPDATE_GOLDEN=1 のときだけ書き込む。初回は自動で作る）', () => {
  if (UPDATE || !Object.keys(saved).length) {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(fresh, null, 1));
  }
  assert.ok(Object.keys(fresh).length === CASES.length || !UPDATE, '全ケースを実行した');
});
