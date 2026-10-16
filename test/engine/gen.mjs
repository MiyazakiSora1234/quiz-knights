// 網羅テスト用の共通部品（テストファイルではない）
import assert from 'node:assert/strict';
import { SELECTABLE, JOB, LEVELS, BOSS } from '../../app/src/lib/engine.js';
import { harness, rng, checkInvariants, CANCEL } from './harness.mjs';

export { harness, rng, checkInvariants, CANCEL, SELECTABLE, JOB, LEVELS, BOSS };
export const JOBS = SELECTABLE;
export const BOSS_IDS = Object.keys(BOSS).map(Number);
export const LEVEL_KEYS = Object.keys(LEVELS);
export const pl = (name, job, team = 'p') => ({ name, job, team });
export const enabled = opts => opts.filter(o => !o.disabled);

/** 選択の自動化: 行動は actIdx 番目の技（なければ先頭の有効な行動）、対象は targetId を優先 */
export function scriptedAsk({ actIdx = 0, targetId = null, last = false, r = null } = {}) {
  return async (title, opts) => {
    const ok = enabled(opts);
    assert.ok(ok.length > 0, `選べる選択肢がない: ${title}`);
    if (title.endsWith('の行動')) {
      const acts = ok.filter(o => o.cls !== 'ghost');
      if (!acts.length) return ok[0].value;
      return (acts[actIdx] ?? acts[0]).value;
    }
    if (targetId != null) { const t = ok.find(o => o.value === targetId); if (t) return t.value; }
    if (r) return r.pick(ok).value;
    return (last ? ok[ok.length - 1] : ok[0]).value;
  };
}

export function make(players, { mode = 'cpu', boss = 3, askFn = scriptedAsk(), level, cpuAuto = false, foes, random, bossPenalty = true } = {}) {
  const h = harness({ askFn, random });
  h.b.start({ players, mode, boss, level, cpuAuto, foes, bossPenalty, genres: ['A', 'B'] });
  return h;
}

/** 状態の付け方（名前 → 付ける関数） */
export const UNIT_VARIANTS = {
  通常: () => {},
  瀕死: u => { u.hp = 1; },
  バリア: u => { u.barrier = 1; },
  毒: u => { u.poison = 2; },
  地雷: (u, h) => { u.mine = { by: h.b.G.units.find(x => x !== u).id, dmg: 3 }; },
  死亡: u => { u.alive = false; u.hp = 0; },
  休み: u => { u.restNow = true; },
  守り多: u => { u.guards = 3; },
};
