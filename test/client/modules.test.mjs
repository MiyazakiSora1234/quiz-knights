// 小さな部品のテスト: データ表の整合、アイコン、選択肢のグループ化、保存領域の入口、順位の表示、時計合わせ
import test from 'node:test';
import assert from 'node:assert/strict';
import { JOB, SELECTABLE, JOB_GROUPS, BOSS, LEVELS, GENRES, PLAYABLE_BOSS_KEYS, bossIdOf, bossHp, jobName, nm, iconKey, statusTags, bonusOf, recommendedHpScale, BERSERKER_DELAY_MS, jobDesc, jobDescOf } from '../../app/src/lib/engine.js';
import { icon, ICON_KEYS } from '../../app/src/lib/icons.js';
import { groupOptions } from '../../app/src/lib/groups.js';
import { isBuzzKey } from '../../app/src/lib/buzzkey.js';
import { rankTag, rankTags } from '../../app/src/lib/ranks.js';

/* ===== データ表 ===== */
for (const [k, j] of Object.entries(JOB)) {
  test(`[データ] 職業 ${k}: 名前・攻撃・体力・説明が正しい型で、説明が空でない`, () => {
    assert.equal(typeof j.n, 'string'); assert.ok(j.n.length > 0);
    assert.ok(Number.isInteger(j.atk) && j.atk >= 0 && j.atk <= 10);
    assert.ok(Number.isInteger(j.hp) && j.hp >= 1 && j.hp <= 20);
    assert.ok(j.d && j.d.length >= 6);
  });
}
test('[データ] 選べる職業は勇者を除く全職業で、分類（基本・攻撃・守り支援・特殊）と順番まで一致する', () => {
  assert.deepEqual(SELECTABLE, Object.keys(JOB).filter(k => k !== 'hero'));
  assert.deepEqual(JOB_GROUPS.flatMap(g => g.keys), SELECTABLE);
  assert.equal(new Set(SELECTABLE).size, SELECTABLE.length);
});
for (const [id, b] of Object.entries(BOSS)) {
  test(`[データ] 魔王${id}: 紹介・体力式・技・特性・形態がそろっている`, () => {
    assert.ok(b.n && b.intro && b.hpText);
    assert.ok(Array.isArray(b.skills) && b.skills.length >= 1 && b.skills.every(s => s.n && s.d));
    assert.ok(Array.isArray(b.traits) && b.traits.length >= 1);
    assert.ok(Array.isArray(b.forms) && b.forms.length >= 1);
    for (const S of [1, 4, 10, 30]) assert.ok(bossHp(S, +id) >= 1 && Number.isInteger(bossHp(S, +id)));
    assert.ok(bossHp(10, +id) >= bossHp(5, +id), '攻撃合計が大きいほど体力は減らない');
    assert.equal(bossIdOf('boss' + id), +id);
    assert.ok(PLAYABLE_BOSS_KEYS.includes('boss' + id));
    assert.ok(ICON_KEYS.includes('boss' + id), 'アイコンがある');
  });
}
for (const [k, l] of Object.entries(LEVELS)) {
  test(`[データ] 難易度 ${k}: 倍率とダメージ加減が数値`, () => {
    assert.ok(l.n && typeof l.hp === 'number' && l.hp > 0 && Number.isInteger(l.dmg) && typeof l.d === 'string');
  });
}
test('[データ] 難易度は 弱い < 普通 < 強い < 最強 の順に強く、「基準」だけ表に出ない', () => {
  const order = ['weak', 'normal', 'strong', 'extreme'];
  for (let i = 1; i < order.length; i++) { assert.ok(LEVELS[order[i]].hp > LEVELS[order[i - 1]].hp); assert.ok(LEVELS[order[i]].dmg > LEVELS[order[i - 1]].dmg); }
  assert.deepEqual(Object.entries(LEVELS).filter(([, l]) => l.hidden).map(([k]) => k), ['base']);
  assert.deepEqual([LEVELS.base.hp, LEVELS.base.dmg], [1, 0]);
});
test('[データ] 定数: ジャンル・バーサーカーのディレイ・体力の倍率の範囲', () => {
  assert.ok(GENRES.length >= 3 && GENRES.every(g => typeof g === 'string'));
  assert.equal(BERSERKER_DELAY_MS, 700);
  for (let n = 1; n <= 20; n++) for (const mode of ['cpu', 'pvp']) { const k = recommendedHpScale(mode, n); assert.ok(k >= 1.2 && k <= 12); }
});
test('[データ] 名前・アイコン・状態表示の小さな関数', () => {
  const boss = { isBoss: true, bossId: 2, form: 1, name: '魔王2', job: 'boss' };
  assert.equal(jobName(boss), '魔王2・第2形態');
  assert.equal(nm({ name: 'A', job: 'monk' }), 'A(僧侶)');
  assert.equal(nm(boss), '魔王2');
  assert.equal(iconKey(boss), 'boss2');
  assert.equal(iconKey({ job: 'tank' }), 'tank');
  assert.equal(bonusOf({ isBoss: true, bossId: 1, hp: 4, maxHp: 9 }), 2);
  assert.equal(bonusOf({ isBoss: true, bossId: 1, hp: 5, maxHp: 9 }), 0);
  assert.equal(bonusOf({ isBoss: false, hp: 1, maxHp: 9 }), 0);
  const tags = statusTags({ poison: 2, barrier: 1, noWrong: true, ghost: true, mine: { dmg: 3 }, delayQ: 5 }, true, 5).map(t => t.t).join('|');
  for (const k of ['毒', 'バリア', '誤答無効', '幽霊', '地雷', 'ディレイ']) assert.ok(tags.includes(k), k);
  assert.ok(!statusTags({ mine: { dmg: 3 } }, false, 5).some(t => t.t.includes('地雷')), '地雷は参加者には見せない');
});

/* ===== アイコン ===== */
for (const key of ICON_KEYS) {
  test(`[アイコン] ${key}: SVGとして閉じており、アクセシビリティ属性と描画領域がある`, () => {
    const svg = icon(key);
    assert.match(svg, /^<svg [^>]*viewBox="[^"]+"[^>]*aria-hidden="true">/);
    assert.ok(svg.endsWith('</svg>'));
    assert.equal((svg.match(/<svg/g) || []).length, 1);
    const opens = (svg.match(/<(path|circle|ellipse|rect|g)\b/g) || []).length;
    assert.ok(opens >= 1, '図形がある');
    assert.ok(!/undefined|NaN/.test(svg));
  });
}
test('[アイコン] 全職業・全魔王のアイコンがあり、未知のキーは戦士にフォールバック', () => {
  for (const k of [...SELECTABLE, 'hero', ...PLAYABLE_BOSS_KEYS, 'boss']) assert.ok(ICON_KEYS.includes(k), k);
  assert.equal(icon('???'), icon('warrior'));
});

/* ===== 選択肢のグループ化 ===== */
test('[グループ] 敵→味方の順に分け、番号は元のまま。グループが1つなら見出しを出さない。見出しのない選択肢は最後', () => {
  const opts = [
    { label: 'A', group: '味方', gorder: 10, gcls: 'ally' }, { label: 'B', group: '敵', gorder: 0, gcls: 'foe' },
    { label: 'C', group: '味方', gorder: 10, gcls: 'ally' }, { label: '何もしない' }, { label: 'D', group: '敵', gorder: 0, gcls: 'foe' },
  ];
  const g = groupOptions(opts);
  assert.deepEqual(g.map(x => x.label), ['敵', '味方', '']);
  assert.deepEqual(g[0].items.map(x => x.i), [1, 4]);
  assert.deepEqual(g[1].items.map(x => x.i), [0, 2]);
  assert.deepEqual(g[2].items.map(x => x.o.label), ['何もしない']);
  const one = groupOptions([{ label: 'X', group: '味方', gorder: 10 }, { label: 'Y', group: '味方', gorder: 10 }]);
  assert.equal(one.length, 1); assert.equal(one[0].label, '');
  assert.deepEqual(groupOptions([]), []);
});
for (const n of [0, 1, 2, 5, 12]) {
  test(`[グループ] 選択肢${n}個でも、元の番号が一度ずつ現れる`, () => {
    const opts = Array.from({ length: n }, (_, i) => ({ label: 'o' + i, group: i % 3 ? '味方' : '敵', gorder: i % 3 ? 10 : 0 }));
    const idx = groupOptions(opts).flatMap(g => g.items.map(x => x.i)).sort((a, b) => a - b);
    assert.deepEqual(idx, opts.map((_, i) => i));
  });
}

/* ===== 順位の表示 ===== */
for (const [ms, text] of [[0, '🥇 1着'], [1, '2着 +1ms'], [120.4, '2着 +120ms'], [999.6, '2着 +1000ms']]) {
  test(`[順位] ${ms}ms の表示`, () => assert.equal(rankTag({ ms }, ms === 0 ? 0 : 1).t, text));
}
test('[順位] 順位表から pid ごとのタグを作る。空・未定義でも落ちない', () => {
  const t = rankTags([{ pid: 'a', ms: 0 }, { pid: 'b', ms: 50 }, { pid: 'c', ms: 80 }]);
  assert.deepEqual([t.a.cls, t.b.cls, t.c.cls], ['rank1', 'rank', 'rank']);
  assert.equal(t.c.t, '3着 +80ms');
  assert.deepEqual(rankTags([]), {}); assert.deepEqual(rankTags(), {}); assert.equal(rankTag(null, 0), null);
});

/* ===== 保存領域の入口 ===== */
test('[保存] localStorage / sessionStorage が使えなくても落ちない。使えるときは読み書きできる', async () => {
  const saveL = globalThis.localStorage, saveS = globalThis.sessionStorage;
  const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
  try {
    const { store, session, KEY } = await import('../../app/src/lib/storage.js');
    globalThis.localStorage = undefined; globalThis.sessionStorage = undefined;
    assert.equal(store.get('x'), null); assert.doesNotThrow(() => { store.set('x', '1'); store.remove('x'); session.set('y', '1'); session.remove('y'); });
    globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
    assert.equal(store.get('x'), null); assert.doesNotThrow(() => store.set('x', '1'));
    globalThis.localStorage = mem(); globalThis.sessionStorage = mem();
    store.set(KEY.name, 'たろう'); assert.equal(store.get(KEY.name), 'たろう');
    store.remove(KEY.name); assert.equal(store.get(KEY.name), null);
    session.set(KEY.pid(3), 'abc'); assert.equal(session.get(KEY.pid(3)), 'abc');
    assert.equal(KEY.hostKey(7), 'qr_hk_7'); assert.equal(KEY.save(7), 'qr_save_7'); assert.equal(KEY.pw(7), 'qr_pw_7'); assert.equal(KEY.name, 'qr_name');
  } finally { globalThis.localStorage = saveL; globalThis.sessionStorage = saveS; }
});

/* ===== 裁定一覧（ルール画面） ===== */
import { RULINGS } from '../../app/src/lib/rulings.js';
test('[裁定] 見出し・質問・答えがそろい、質問は重複せず、アイテムの項目がある', () => {
  assert.ok(RULINGS.length >= 6);
  const qs = RULINGS.flatMap(g => g.items.map(i => i[0]));
  assert.equal(new Set(qs).size, qs.length, '質問の重複');
  for (const g of RULINGS) { assert.ok(g.n && g.items.length); for (const [q, a] of g.items) { assert.ok(q.length >= 4 && q.endsWith('？'), q); assert.ok(a.length >= 10, q); } }
  assert.ok(RULINGS.some(g => g.n === 'アイテム'));
  assert.ok(qs.length >= 50, `${qs.length}件`);
});

test('[データ] 職業の説明: 全職業・全魔王に説明があり、ユニットからも引ける（クリックで出す文）', () => {
  for (const k of [...SELECTABLE, 'hero']) { assert.equal(jobDescOf(k), JOB[k].d); assert.ok(jobDescOf(k).length >= 6, k); }
  for (const k of PLAYABLE_BOSS_KEYS) { const b = BOSS[bossIdOf(k)]; assert.ok(jobDescOf(k).includes(b.intro), k); for (const sk of b.skills) assert.ok(jobDescOf(k).includes(sk.d), `${k} の技 ${sk.n} が説明に出る`); }
  assert.equal(jobDescOf('???'), '');
  assert.equal(jobDesc({ job: 'monk', isBoss: false }), JOB.monk.d);
  assert.ok(jobDesc({ isBoss: true, bossId: 3, job: 'boss' }).includes(BOSS[3].intro));
});

/* ===== キーボードでの早押し ===== */
test('[早押しキー] Space / Enter で押せる。長押しの連打・修飾キー・ダイアログ中・入力欄やボタン上では押さない（早押しボタン自身は除く）', () => {
  const ev = (key, target = { tagName: 'BODY' }, extra = {}) => ({ key, code: key === ' ' ? 'Space' : key, target, repeat: false, ...extra });
  assert.equal(isBuzzKey(ev(' ')), true);
  assert.equal(isBuzzKey(ev('Enter')), true);
  assert.equal(isBuzzKey(ev('a')), false);
  assert.equal(isBuzzKey(ev(' '), true), false, 'ダイアログ中');
  assert.equal(isBuzzKey(ev(' ', undefined, { repeat: true })), false, '押しっぱなしの連打');
  for (const m of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) assert.equal(isBuzzKey(ev(' ', undefined, { [m]: true })), false, m);
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A', 'SUMMARY']) assert.equal(isBuzzKey(ev('Enter', { tagName: tag })), false, tag);
  assert.equal(isBuzzKey(ev('Enter', { tagName: 'DIV', isContentEditable: true })), false);
  assert.equal(isBuzzKey(ev(' ', { tagName: 'BUTTON', classList: { contains: c => c === 'buzz' } })), true, '早押しボタン自身は押せる');
  assert.equal(isBuzzKey({ key: ' ', code: 'Space', repeat: false }), true, 'target がなくても');
});
