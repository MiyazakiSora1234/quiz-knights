// 網羅: 攻撃側の職業 × 受け側の職業 × 攻撃側の状態 × 受け側の状態 × 選ぶ技（23×23×2×8×2 = 16,928 通り）
import test from 'node:test';
import assert from 'node:assert/strict';
import { JOBS, JOB, pl, make, scriptedAsk, checkInvariants, UNIT_VARIANTS } from './gen.mjs';

const ATTACKER_VARIANTS = ['通常', '瀕死'];
const DEFENDER_VARIANTS = Object.keys(UNIT_VARIANTS);

for (const a of JOBS) for (const d of JOBS) for (const av of ATTACKER_VARIANTS) for (const dv of DEFENDER_VARIANTS) for (const act of [0, 1]) {
  test(`[組合せ] ${JOB[a].n}(${av}) → ${JOB[d].n}(${dv}) 技${act}`, async () => {
    const h = make([pl('A', a), pl('D', d), pl('E', 'monk')], { askFn: null });
    // 受け側の id を知ってから ask を差し替える
    const D = h.u('D'), A = h.u('A');
    const ask = scriptedAsk({ actIdx: act, targetId: D.id });
    h.ui.ask = async (title, opts) => ask(title, opts);
    UNIT_VARIANTS[av](A, h);
    UNIT_VARIANTS[dv](D, h);
    h.b.select(A.id);
    const ok = await h.b.correct();
    assert.equal(ok, true, '正解の処理が完了する');
    const G = h.b.G;
    assert.ok(G.over || G.q === 2, '問題番号が進む');
    assert.ok(G.log.length >= 1);
    checkInvariants(G, `${a}/${av} -> ${d}/${dv} 技${act}`);
  });
}
