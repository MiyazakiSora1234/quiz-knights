// 称号: 定義（重複・名前・条件）、判定（すべての称号が取れる／取れない）、積み重ね
import test from 'node:test';
import assert from 'node:assert/strict';
import { TITLES, TITLE_CATS, TITLE_BY_ID, evaluateTitles, addToTotals, isTitleId, titleName } from '../../app/src/lib/titles.js';
import { SELECTABLE } from '../../app/src/lib/engine.js';

test('称号の定義: 番号・id・名前が重ならず、種類・条件の文がある。97個ある', () => {
  assert.equal(TITLES.length, 97);
  assert.equal(new Set(TITLES.map(t => t.id)).size, TITLES.length);
  assert.equal(new Set(TITLES.map(t => t.no)).size, TITLES.length);
  assert.equal(new Set(TITLES.map(t => t.n)).size, TITLES.length, '名前が重ならない');
  for (const t of TITLES) { assert.match(t.id, /^t\d{3}$/); assert.ok(t.n && t.d && TITLE_CATS.includes(t.cat), t.id); assert.equal(typeof t.f, 'function'); }
  assert.ok(isTitleId('t001') && !isTitleId('t999') && !isTitleId('__proto__') && !isTitleId(5) && !isTitleId('constructor'));
  assert.equal(titleName('t001'), '一番乗り'); assert.equal(titleName('xxx'), '');
  assert.deepEqual(Object.keys(TITLE_BY_ID).length, TITLES.length);
});

const unit = (o = {}) => ({ id: 1, job: 'warrior', atk: 3, hp: 7, maxHp: 7, alive: true, isBoss: false, human: false, side: 'p', ...o });
const ctx = (s = {}, o = {}) => ({ s: { correct: 0, wrong: 0, ...s }, u: unit(), all: [], result: { at: 1, q: 12, mode: 'cpu', win: 'p', bosses: [], minutes: 5 }, totals: { plays: 1, chat: 0, hosted: 0, bankSent: 0, winJobs: [], bosses: [] }, flags: {}, ...o });
const won = { won: 1 };

// 各称号を取れる状況（id → 状況）。ここに無い称号が無いことも確かめる
const CASES = {
  t001: ctx({ first: 1 }), t002: ctx({ leadWin: 1 }), t003: ctx({ firstQ1: 1 }), t004: ctx({ first: 5 }), t005: ctx({ first: 10 }),
  t008: ctx({ beatCpu: 1 }), t009: ctx({ beatCpu: 3 }), t010: ctx({ delayWin: 1 }),
  t011: ctx({ correct: 1 }), t012: ctx({ maxStreak: 3 }), t013: ctx({ maxStreak: 5 }), t014: ctx({ maxStreak: 10 }),
  t015: ctx({ correct: 5 }), t016: ctx({ correct: 9, wrong: 1 }), t017: ctx({ correct: 10 }), t018: ctx({ correct: 15 }), t019: ctx({ correct: 25 }),
  t020: ctx({ correct: 4 }, { all: [{ s: { correct: 3 } }, { s: { correct: 4 } }] }),
  t021: ctx({ wrong: 5 }), t022: ctx({ bounce: 1 }), t023: ctx({ twoWrong: 1 }), t024: ctx({ wrongDmg: 10 }), t025: ctx({ early: 1 }), t026: ctx({ early: 3 }),
  t027: ctx({ correct: 3, ...won }), t028: ctx({ edgeWrong: 1 }), t029: ctx({ wrongBlocked: 1 }), t030: ctx({ comeback: 1 }),
  t031: ctx({ dealtFoe: 1 }), t032: ctx({ maxAct: 5 }), t033: ctx({ maxAct: 8 }), t034: ctx({ dealtFoe: 30 }), t035: ctx({ dealtFoe: 60 }), t036: ctx({ finisher: 1 }),
  t037: ctx({ multiHit: 1 }), t038: ctx({ multiHit: 5 }), t039: ctx({ kills: 3 }), t040: ctx({ friendly: 1 }),
  t041: ctx({ healed: 1 }), t042: ctx({ healed: 20 }), t043: ctx({ saveLife: 1 }), t044: ctx({ revive: 1 }), t045: ctx({ barrierGiven: 5 }), t046: ctx({ blocked: 5 }),
  t047: ctx({ guard: 3 }), t048: ctx({ ...won }, { u: unit({ hp: 1 }) }), t049: ctx({ healAll: 1 }), t050: ctx({ cured: 3 }),
  t051: ctx({ itemsUsed: 1 }), t052: ctx({ item2: 1 }), t053: ctx({ itemsStart: 3, itemsUsed: 3, itemsEnd: 0 }), t054: ctx({ alarmCure: 2 }), t055: ctx({ coinHead: 1 }), t056: ctx({ coinTail: 1 }),
  t057: ctx({ mapGenre: 1 }), t058: ctx({ steal: 1 }), t059: ctx({ supply: 3 }), t060: ctx({ itemAtk: 5 }),
  t061: ctx({ poisonKill: 1 }), t062: ctx({ mineHit: 1 }), t063: ctx({ delaySet: 1 }), t064: ctx({ restFoe: 3 }), t065: ctx({}), t066: ctx({ rested: 3 }), t067: ctx({ delaySet: 5 }),
  t068: ctx({ poisonTaken: 6 }), t069: ctx({ blasted: 1 }), t070: ctx({ mineTaken: 1 }),
  t071: ctx({ hero: 1 }), t072: ctx({}, { u: unit({ job: 'apprentice', atk: 5 }) }), t073: ctx({ maxAct: 3 }, { u: unit({ job: 'necro' }) }), t074: ctx({ ghostCorrect: 1 }),
  t075: ctx({ sacrifice: 1, ...won }), t076: ctx({ special: 1 }), t077: ctx({ gamHead: 1 }), t078: ctx({ copy: 3 }), t079: ctx({ genrePick: 3 }),
  t080: ctx({}, { totals: { winJobs: [...SELECTABLE] } }),
  t081: ctx({ ...won }, { result: { at: 1, q: 12, mode: 'cpu', win: 'p', bosses: [1] } }), t082: ctx({}, { totals: { bosses: [1, 2, 3, 4, 5, 6] } }),
  t083: ctx({ flawless: 1 }), t084: ctx({ tight: 1 }), t085: ctx({ weak: 1 }), t086: ctx({ ...won }, { result: { at: 1, q: 10 } }), t087: ctx({ ...won }, { result: { at: 1, q: 30 } }),
  t088: ctx({ ...won }, { u: unit({ isBoss: true, human: true }) }), t089: ctx({ lost: 1 }), t090: ctx({ ...won }, { result: { at: 1, q: 12, mode: 'pvp' } }),
  t091: ctx({}, { totals: { chat: 10 } }), t093: ctx({}, { totals: { plays: 5 } }), t094: ctx({}, { totals: { plays: 20 } }), t095: ctx({ late: 1, correct: 1 }),
  t096: ctx({ correct: 1 }, { flags: { reconnected: true } }), t097: ctx({}, { totals: { hosted: 3 } }), t098: ctx({}, { totals: { bankSent: 1 } }), t099: ctx({}, { result: { at: 1, q: 12, minutes: 60 } }),
  t100: ctx({}),
};
CASES.t065 = ctx({ rested: 0 }, { result: { at: 1, q: 10 } });

test('称号の判定: 97個すべてに、取れる状況がある（取れる状況の表に漏れがない）', () => {
  assert.deepEqual(Object.keys(CASES).sort(), TITLES.map(t => t.id).sort());
  for (const t of TITLES) assert.ok(evaluateTitles(CASES[t.id]).includes(t.id), `${t.id} ${t.n}: 取れる状況で取れない`);
});

test('称号の判定: 何もしていない状況では、ほとんど取れない（入団・休みなく働く・全員が取れるものを除く）', () => {
  const got = evaluateTitles(ctx({}, { totals: {}, result: { at: 1, q: 3, mode: 'cpu' } }));
  assert.deepEqual(got.sort(), []);
  const first = evaluateTitles(ctx({}, { result: { at: 1, q: 3, mode: 'cpu' } }));
  assert.deepEqual(first, ['t100'], '最後まで遊べば、入団だけ');
});

test('称号の判定: 境界。条件に1足りないと取れない', () => {
  const no = (id, s, o) => assert.ok(!evaluateTitles(ctx(s, o)).includes(id), `${id} は取れない`);
  no('t004', { first: 4 }); no('t012', { maxStreak: 2 }); no('t015', { correct: 4 }); no('t015', { correct: 5, wrong: 1 });
  no('t016', { correct: 4, wrong: 1 }); no('t016', { correct: 8, wrong: 2 }); no('t032', { maxAct: 4 }); no('t033', { maxAct: 7 });
  no('t020', { correct: 2 }); no('t020', { correct: 3 }, { all: [{ s: { correct: 4 } }] }); no('t053', { itemsStart: 3, itemsUsed: 2, itemsEnd: 0 }); no('t053', { itemsStart: 0, itemsEnd: 0 });
  no('t048', { won: 1 }, { u: unit({ hp: 2 }) }); no('t048', {}, { u: unit({ hp: 1 }) }); no('t027', { correct: 3, wrong: 1, won: 1 }); no('t086', { won: 1 }, { result: { at: 1, q: 11 } });
  no('t081', { won: 1 }, { result: { at: 1, q: 12, mode: 'pvp', bosses: [1] } }); no('t081', {}, { result: { at: 1, q: 12, mode: 'cpu', bosses: [1] } });
  no('t080', {}, { totals: { winJobs: SELECTABLE.slice(1) } }); no('t082', {}, { totals: { bosses: [1, 2, 3, 4, 5] } }); no('t099', {}, { result: { at: 1, minutes: 59 } });
  no('t072', {}, { u: unit({ job: 'apprentice', atk: 4 }) }); no('t073', { maxAct: 2 }, { u: unit({ job: 'necro' }) }); no('t073', { maxAct: 3 });
});

test('称号の積み重ね: 参加を数え、勝った職業・倒した魔王を覚える（負けたバトルでは増えない）', () => {
  let t = addToTotals({}, { s: { won: 1 }, u: { job: 'monk' }, result: { bosses: [2, 3] } });
  assert.deepEqual([t.plays, t.winJobs, t.bosses], [1, ['monk'], [2, 3]]);
  t = addToTotals(t, { s: { won: 0, lost: 1 }, u: { job: 'mage' }, result: { bosses: [1] } });
  assert.deepEqual([t.plays, t.winJobs, t.bosses], [2, ['monk'], [2, 3]]);
  t = addToTotals(t, { s: { won: 1 }, u: { job: 'hero' }, result: { bosses: [3] } });
  assert.deepEqual(t.winJobs, ['monk'], '勇者は選べる職業ではないので数えない');
  assert.deepEqual(addToTotals(undefined, { s: {}, u: null, result: null }).plays, 1);
});
