// 全分岐の網羅: 正解したときの「行動の選択肢 × 対象 × 庇う/庇わない…」の全ての組み合わせを自動で辿る
import test from 'node:test';
import assert from 'node:assert/strict';
import { SELECTABLE, BOSS } from '../../app/src/lib/engine.js';
import { harness, checkInvariants, CANCEL } from './harness.mjs';

const JOBS = [...SELECTABLE, 'hero'];
const MAX_RUNS = 4000;
const COUNTS = {};

/** 同じ選び方で、各質問の時点でキャンセルしたら「状態が丸ごと元に戻る」ことを確かめる */
async function checkCancelEverywhere({ build, actor, label, chosen }) {
  for (let cancelAt = 0; cancelAt < chosen.length; cancelAt++) {
    const H = build();
    const unit = H.b.G.units.find(x => x.name === actor);
    H.b.select(unit.id);
    const before = JSON.stringify(H.b.G);
    let n = 0;
    H.hook = (title, opts) => {
      if (n === cancelAt) { n++; throw CANCEL; }
      return opts[chosen[n++]].value;
    };
    const ok = await H.b.correct();
    assert.equal(ok, false, `${label}: ${cancelAt}番目の質問でキャンセルしたのに成立した`);
    assert.equal(JSON.stringify(H.b.G), before, `${label}: ${cancelAt}番目の質問でキャンセルしたあと状態が戻っていない`);
    assert.equal(H.b.canUndo, false);
    assert.equal(H.b.busy, false);
  }
}

/** 質問が出るたびに、選べる選択肢を全部試す（深さ優先で全ての枝を再実行して数え上げる） */
async function exploreAll({ build, op = 'correct', actor, label }) {
  const queue = [[]];
  let runs = 0;
  const leaves = new Set();
  while (queue.length) {
    const path = queue.pop();
    const H = build();
    const decisions = [];
    H.hook = (title, opts) => {
      const enabled = opts.map((o, i) => (o.disabled ? -1 : i)).filter(i => i >= 0);
      assert.ok(enabled.length > 0, `${label}: 選べる選択肢がない (${title})`);
      const d = decisions.length;
      const chosen = d < path.length ? path[d] : enabled[0];
      assert.ok(enabled.includes(chosen), `${label}: 無効な選択肢を選ぼうとした`);
      decisions.push({ enabled, chosen, title });
      return opts[chosen].value;
    };
    const unit = H.b.G.units.find(x => x.name === actor);
    assert.ok(unit, `${label}: ${actor} がいない`);
    assert.ok(H.b.select(unit.id), `${label}: ${actor} を選択できない`);
    const ok = op === 'correct' ? await H.b.correct() : await H.b.wrong();
    assert.equal(ok, true, `${label}: 処理が成立しなかった path=${JSON.stringify(path)} 質問=${decisions.map(d => d.title).join(' > ')}`);
    assert.equal(H.b.G.q, 2, `${label}: 問題番号が進んでいない`);
    checkInvariants(H.b.G, `${label} path=${JSON.stringify(decisions.map(d => d.chosen))}`);
    leaves.add(JSON.stringify(H.b.G.units.map(u => [u.hp, u.alive, u.side, u.ghost || 0, u.guards, u.restNow, u.poison || 0, u.barrier || 0])) + H.b.G.over);
    if (op === 'correct') await checkCancelEverywhere({ build, actor, label, chosen: decisions.map(d => d.chosen) });
    for (let d = path.length; d < decisions.length; d++) {
      for (const alt of decisions[d].enabled) {
        if (alt !== decisions[d].chosen) queue.push(decisions.slice(0, d).map(x => x.chosen).concat(alt));
      }
    }
    if (++runs > MAX_RUNS) assert.fail(`${label}: 分岐が多すぎる（${MAX_RUNS}超）`);
  }
  return { runs, outcomes: leaves.size };
}

function make(players, { mode = 'cpu', boss = 3, rolls = 0.9, setup = null, genres = ['A', 'B'] } = {}) {
  return () => {
    let H;
    H = harness({ askFn: (...a) => H.hook(...a), random: () => rolls });
    H.hook = null;
    H.b.start({ players, mode, boss, genres });
    if (setup) setup(H);
    return H;
  };
}
const kill = (H, name) => { const u = H.u(name); u.hp = 0; u.alive = false; };
const P = (name, job, team = 'p') => ({ name, job, team });

/** プレイヤー職の標準シナリオ */
function scenarios(job, srcJob = 'monk') {
  return {
    // CPU戦: 味方5人（うち1人は死亡）。魔王3
    cpu: make([P('X', job), P('B', srcJob), P('C', 'monk'), P('D', 'tank'), P('E', 'bomb'), P('F', 'warrior')], {
      setup: H => { kill(H, 'F'); H.b.G.prevCorrect = H.u('B').id; },
    }),
    // ユーザー対戦: 敵チームにタンク・爆弾岩・死亡者
    pvp: make([P('X', job, 'p'), P('B', srcJob, 'p'), P('C', 'monk', 'p'), P('D', 'tank', 'e'), P('E', 'bomb', 'e'), P('F', 'warrior', 'e'), P('G', 'sage', 'e')], {
      mode: 'pvp', setup: H => { kill(H, 'G'); H.b.G.prevCorrect = H.u('B').id; },
    }),
    // 全員が瀕死: 連鎖爆発・幽霊化・決着が起きやすい
    low: make([P('X', job, 'p'), P('B', srcJob, 'p'), P('E', 'bomb', 'e'), P('D', 'ghost', 'e'), P('H', 'bomb', 'e'), P('T', 'tank', 'e')], {
      mode: 'pvp', setup: H => { for (const n of ['B', 'E', 'D', 'H', 'T']) H.u(n).hp = 1; H.b.G.prevCorrect = H.u('B').id; },
    }),
  };
}

for (const job of JOBS) {
  test(`全分岐 正解: ${job}`, async () => {
    let total = 0;
    for (const [kind, build] of Object.entries(scenarios(job))) {
      const r = await exploreAll({ build, actor: 'X', label: `${job}/${kind}` });
      total += r.runs;
    }
    COUNTS[job] = total;
    assert.ok(total >= 8, `${job}: 辿れた分岐が少なすぎる (${total})`);
  });
}

test('全分岐 正解: 模倣者 × コピー元の全職業', async () => {
  let total = 0;
  for (const src of JOBS) {
    for (const [kind, build] of Object.entries(scenarios('mimic', src))) {
      const r = await exploreAll({ build, actor: 'X', label: `mimic←${src}/${kind}` });
      total += r.runs;
    }
  }
  console.log(`  模倣者: 全${total}通りの分岐を確認`);
  assert.ok(total > 100);
});

for (const job of JOBS) {
  test(`全分岐 誤答: ${job}`, async () => {
    for (const [kind, build] of Object.entries(scenarios(job))) {
      await exploreAll({ build, op: 'wrong', actor: 'X', label: `${job}/${kind}/誤答` });
    }
  });
}

test('全分岐 コイントス: 表・裏どちらの目でも成立する（賭博師）', async () => {
  for (const rolls of [0.1, 0.9]) {
    for (const [kind, build] of Object.entries({
      cpu: make([P('X', 'gambler'), P('B', 'tank'), P('E', 'bomb')], { rolls }),
      pvp: make([P('X', 'gambler', 'p'), P('B', 'tank', 'e'), P('E', 'bomb', 'e')], { mode: 'pvp', rolls }),
    })) {
      await exploreAll({ build, actor: 'X', label: `賭博師/${kind}/${rolls}` });
    }
  }
});

/* ---------------- 魔王（全形態・全HP帯・全技・全対象） ---------------- */
for (const id of Object.keys(BOSS)) {
  const forms = BOSS[id].forms.map((_, i) => i);
  test(`全分岐 魔王${id}: 全形態 × HP帯 × 全技 × 全対象`, async () => {
    let total = 0;
    for (const form of forms) {
      for (const bossHpMode of ['full', 'half', 'one']) {
        for (const lowParty of [false, true]) {
          const build = make([P('A', 'warrior'), P('B', 'tank'), P('C', 'bomb'), P('D', 'ghost'), P('E', 'monk'), P('G', 'cleric')], {
            boss: +id,
            setup: H => {
              const b = H.u(`魔王${id}`);
              b.form = form;
              b.maxHp = b.hp = Math.max(2, Math.ceil((b.S || 10) * 0.5));
              if (bossHpMode === 'half') b.hp = Math.max(1, Math.floor(b.maxHp / 2));
              if (bossHpMode === 'one') b.hp = 1;
              if (lowParty) for (const n of ['A', 'B', 'C', 'D', 'E', 'G']) H.u(n).hp = 1;
              H.b.G.prevCorrect = H.u('A').id;
              H.u('G').barrier = 1;
            },
          });
          const r = await exploreAll({ build, actor: `魔王${id}`, label: `魔王${id}/形態${form}/${bossHpMode}/${lowParty ? '瀕死' : '通常'}` });
          total += r.runs;
        }
      }
    }
    console.log(`  魔王${id}: 全${total}通りの分岐を確認`);
    assert.ok(total >= forms.length * 3);
  });
}

test('全分岐 魔王: 誤答（ペナルティあり/なし）', async () => {
  for (const id of Object.keys(BOSS)) {
    for (const pen of [true, false]) {
      const build = () => {
        let H; H = harness({ askFn: (...a) => H.hook(...a) }); H.hook = null;
        H.b.start({ players: [P('A', 'warrior'), P('B', 'monk')], boss: +id, bossPenalty: pen });
        return H;
      };
      await exploreAll({ build, op: 'wrong', actor: `魔王${id}`, label: `魔王${id}誤答/${pen}` });
    }
  }
});

test('全分岐: 職業ごとに辿った分岐の数（網羅できている目安）', () => {
  const line = Object.entries(COUNTS).map(([k, v]) => `${k}=${v}`).join(' ');
  console.log('  ' + line);
  assert.equal(Object.keys(COUNTS).length, JOBS.length);
  // 特殊行動を持つ職業は、通常攻撃だけの職業より多くの分岐があるはず
  assert.ok(COUNTS.warrior > COUNTS.berserker);
  assert.ok(COUNTS.mage > COUNTS.berserker);
  assert.ok(COUNTS.tank >= 15);
});
