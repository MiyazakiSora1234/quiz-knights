// 画面の状態クラスのテスト（リファクタリングの安全網）:
//   PlayStore（参加者の画面）と HostStore（進行役の画面）を、偽のサーバー・偽の保存領域で動かし、
//   受け取ったメッセージで状態がどう変わるか、何を送るかを確かめる。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { loadStores, closeStores, fakeEnv, tick } from './stores.helper.mjs';

after(closeStores);

const room = { id: 3, used: true, name: 'テスト部屋', count: 0, online: 0, hasPw: false };
const unit = (id, name, over = {}) => ({ id, name, job: 'warrior', jobName: '戦士', side: 'p', hp: 7, maxHp: 7, alive: true, ghost: false, restNow: false, guards: 0, isBoss: false, atk: 3, st: [], ...over });
const gstate = (over = {}) => ({ mode: 'cpu', cpu: true, q: 1, acting: null, notice: null, event: null, fxs: [], over: null, pids: { me: 1 }, sel: null, genre: '', units: [unit(1, 'ぼく'), unit(2, '魔王1', { side: 'e', isBoss: true, job: 'boss', jobName: '魔王1' })], log: [], stats: {}, ...over });

/** 参加者の画面を、入室済みの状態まで進める */
async function joined(env, mods, { pid = 'me', joinedMsg = {} } = {}) {
  const p = new mods.play.PlayStore(3);
  await p.init();
  p.name = 'たろう';
  p.join();
  const ws = env.ws();
  ws.open();
  ws.recv({ t: 'joined', pid, room: 3, roomName: 'テスト部屋', name: p.name, flavor: '', job: 'warrior', team: 'p', delay: 0, ...joinedMsg });
  return { p, ws };
}

/* ======================= PlayStore（参加者） ======================= */
test('[参加者] CPUが先に押したら、「🤖 魔王1 が先に押した！」と知らせ、順位に載る', async () => {
  const mods = await loadStores(); const env = fakeEnv({ rooms: [room] });
  try {
    const { p, ws } = await joined(env, mods);
    ws.recv({ t: 'state', state: gstate() });
    ws.recv({ t: 'open', q: 1, eligible: ['me'] });
    const r = [{ pid: 'cpu:7', name: '魔王1', ms: 0 }, { pid: 'me', name: 'たろう', ms: 40 }];
    ws.recv({ t: 'winner', q: 1, pid: 'cpu:7', name: '魔王1', ranking: r, all: r });
    assert.ok(mods.ui.toasts.some(t => /魔王1 が先に押した/.test(t.msg)));
    assert.equal(p.ranks['cpu:7'].t, '🥇 1着'); assert.equal(p.ranks.me.t, '2着 +40ms');
    assert.equal(p.myWin, false);
    p.conn.close();
  } finally { env.restore(); }
});

test('[参加者] 部屋が存在しなければ、お知らせを出して部屋一覧へ戻る。存在すれば参加ダイアログ', async () => {
  const mods = await loadStores();
  let env = fakeEnv({ rooms: [] });
  try {
    const p = new mods.play.PlayStore(3);
    await p.init();
    assert.equal(p.phase, 'loading');
    assert.ok(mods.ui.toasts.some(t => /存在しません/.test(t.msg)));
    assert.equal(env.timers.length >= 1, true, '一覧へ戻る予約');
  } finally { env.restore(); }
  env = fakeEnv({ rooms: [room] });
  try {
    const p = new mods.play.PlayStore(3);
    await p.init();
    assert.equal(p.phase, 'join');
    assert.equal(p.roomName, 'テスト部屋');
    assert.equal(p.name, '', '名前の初期値は空欄（入力例を薄く表示する）');
    assert.equal(FakeWSCount(), 0, '初めての入室は自動で入らない');
  } finally { env.restore(); }
});
const FakeWSCount = () => globalThis.WebSocket.all.length;

test('[参加者] 入室: 接続したら join を送り、joined で pid を保存して待合室へ。名前の空は入れない', async () => {
  const mods = await loadStores(); const env = fakeEnv({ rooms: [room] });
  try {
    const p = new mods.play.PlayStore(3);
    await p.init();
    p.name = '  '; p.join();
    assert.match(p.err, /名前/);
    p.name = ' たろう '; p.flavor = ' がんばる '; p.pw = 'pw';
    p.join();
    const ws = env.ws(); ws.open();
    assert.deepEqual(ws.of('join')[0], { t: 'join', id: 3, name: 'たろう', flavor: 'がんばる', password: 'pw' });
    ws.recv({ t: 'joined', pid: 'abc', room: 3, roomName: '部屋名', name: 'たろう', flavor: 'がんばる', job: 'mage', team: 'e', delay: 0 });
    assert.equal(p.pid, 'abc'); assert.equal(p.phase, 'lobby'); assert.equal(p.myJob, 'mage'); assert.equal(p.myTeam, 'e'); assert.equal(p.roomName, '部屋名');
    assert.equal(env.sess.getItem('qr_pid_3') ?? env.sess._m.values().next().value, 'abc');
    p.destroy();
  } finally { env.restore(); }
});
test('[参加者] 再接続: 保存した pid を付けて入り直し、自分のディレイを引き継ぐ', async () => {
  const mods = await loadStores(); const env = fakeEnv({ rooms: [room] });
  try {
    const { KEY } = await import('../../app/src/lib/storage.js');
    env.local.setItem(KEY.delay, '300'); env.local.setItem(KEY.name, 'たろう');
    env.sess.setItem(KEY.pid(3), 'old');
    const p = new mods.play.PlayStore(3);
    await p.init();                                         // pid があるので自動で入室
    const ws = env.ws(); ws.open();
    assert.equal(ws.of('join')[0].pid, 'old');
    ws.recv({ t: 'joined', pid: 'old', room: 3, roomName: 'x', name: 'たろう', flavor: '', job: 'warrior', team: 'p', delay: 0 });
    assert.deepEqual(ws.of('profile')[0], { t: 'profile', delay: 300 });
    p.destroy();
  } finally { env.restore(); }
});
test('[参加者] エラー: 合言葉違いは入室ダイアログに戻る。部屋が消えたら一覧へ。閉じられたらお知らせ', async () => {
  const mods = await loadStores(); const env = fakeEnv({ rooms: [room] });
  try {
    const p = new mods.play.PlayStore(3);
    await p.init(); p.name = 'たろう'; p.join(); const ws = env.ws(); ws.open();
    ws.recv({ t: 'error', code: 'pw', msg: 'パスワードが違います' });
    assert.equal(p.phase, 'join'); assert.equal(p.err, 'パスワードが違います'); assert.equal(p.info.hasPw, true); assert.equal(p.pid, null);
    p.join(); env.ws().open();
    env.ws().recv({ t: 'error', code: 'claim', msg: 'なれません' });
    assert.ok(mods.ui.toasts.some(t => t.msg === 'なれません'), '引き継ぎの失敗は入室を続ける');
    env.ws().recv({ t: 'closed', why: '閉じました' });
    assert.ok(mods.ui.toasts.some(t => t.msg === '閉じました'));
    p.destroy();
  } finally { env.restore(); }
});
test('[参加者] 部屋の情報(members)・戦う相手・難易度・進行役の有無を反映する', async () => {
  const mods = await loadStores(); const env = fakeEnv({ rooms: [room] });
  try {
    const { p, ws } = await joined(env, mods);
    ws.recv({ t: 'members', players: [{ pid: 'me', name: 'A', online: true }], roomName: '改名', foes: ['boss2', 'warrior'], level: 'strong', hasHost: false, hostOnline: false });
    assert.equal(p.members.length, 1); assert.equal(p.roomName, '改名'); assert.deepEqual(p.foes, ['boss2', 'warrior']); assert.equal(p.level, 'strong'); assert.equal(p.hasHost, false);
    assert.equal(typeof p.setFoes, 'undefined', '戦う相手・難易度は、参加者は変えられない（進行役だけ）');
    p.claimHost(); assert.equal(ws.of('claim_host').length, 1);
    p.destroy();
  } finally { env.restore(); }
});
test('[参加者] バトルの状態: state で画面が game になり、自分のユニットが引ける。終わると待合室に戻り持ち物も消える', async () => {
  const mods = await loadStores(); const env = fakeEnv({ rooms: [room] });
  try {
    const { p, ws } = await joined(env, mods);
    assert.equal(p.me, null);
    ws.recv({ t: 'state', state: gstate() });
    assert.equal(p.phase, 'game'); assert.equal(p.me.name, 'ぼく'); assert.equal(p.mine, 1);
    assert.ok(mods.ui.toasts.some(t => t.msg === 'バトル開始！'));
    ws.recv({ t: 'priv', items: ['potion', 'bomb'] });
    assert.deepEqual(p.myItems, ['potion', 'bomb']);
    ws.recv({ t: 'ended' });
    assert.equal(p.phase, 'lobby'); assert.equal(p.gs, null); assert.deepEqual(p.myItems, []);
    p.destroy();
  } finally { env.restore(); }
});
test('[参加者] 早押し: 受付→押す→送信済み。押せるのは受付中・押せる人・未送信のときだけ。通信を待たず押した感触を返す', async () => {
  const mods = await loadStores(); const env = fakeEnv({ rooms: [room] });
  try {
    const { p, ws } = await joined(env, mods);
    ws.recv({ t: 'state', state: gstate() });
    assert.equal(p.canBuzz, false); assert.equal(p.buzzLabel, ''); assert.equal(p.bannerKind, '');
    p.buzz(); assert.equal(ws.of('buzz').length, 0, '受付前は押せない');
    ws.recv({ t: 'open', q: 1, chain: false, eligible: ['me'] });
    assert.equal(p.canBuzz, true); assert.equal(p.buzzLabel, '押す！'); assert.equal(p.bannerKind, 'open');
    p.buzz({ timeStamp: 1234 });
    assert.equal(ws.of('buzz').length, 1); assert.equal(typeof ws.of('buzz')[0].ts, 'number');
    assert.equal(p.sent, true); assert.equal(p.canBuzz, false); assert.equal(p.buzzLabel, '', '押したあとは文言なし');
    p.buzz(); assert.equal(ws.of('buzz').length, 1, '二重には送らない');
    ws.recv({ t: 'ack' });
    ws.recv({ t: 'winner', q: 1, pid: 'me', name: 'ぼく', ranking: [{ pid: 'me', name: 'ぼく', ms: 0 }] });
    assert.equal(p.myWin, true); assert.equal(p.bannerKind, 'win'); assert.match(p.bannerText, /回答権を獲得/); assert.equal(p.buzzLabel, '回答権獲得！');
    assert.equal(p.ranks.me.cls, 'rank1');
    p.destroy();
  } finally { env.restore(); }
});
test('[参加者] 他の人が回答権を取ったとき・自分は押せないとき・連チャンの表示', async () => {
  const mods = await loadStores(); const env = fakeEnv({ rooms: [room] });
  try {
    const { p, ws } = await joined(env, mods);
    ws.recv({ t: 'state', state: gstate({ units: [unit(1, 'ぼく', { restNow: true }), unit(2, '魔王1', { side: 'e', isBoss: true })] }) });
    ws.recv({ t: 'open', q: 1, chain: true, eligible: [] });
    assert.equal(p.bannerText, '受付中（今回は押せません）'); assert.equal(p.buzzLabel, '休み');
    ws.recv({ t: 'open', q: 1, chain: true, eligible: ['me'] });
    ws.recv({ t: 'winner', q: 1, pid: 'x', name: 'ライバル', ranking: [{ pid: 'x', name: 'ライバル', ms: 0 }, { pid: 'me', name: 'ぼく', ms: 30 }] });
    assert.equal(p.bannerKind, 'other'); assert.equal(p.bannerText, '回答権：ライバル');
    assert.equal(p.buzzLabel, '押す！', '連チャンでは控えとして押せる（文言は同じ）'); assert.equal(p.canBuzz, true);
    p.buzz(); assert.equal(ws.of('buzz').length, 1);
    ws.recv({ t: 'ranking', q: 1, all: [{ pid: 'x', ms: 0 }, { pid: 'me', ms: 55 }] });
    assert.equal(p.ranks.me.t, '2着 +55ms');
    ws.recv({ t: 'open', q: 2, chain: false, eligible: [] });
    ws.recv({ t: 'state', state: gstate({ q: 2, units: [unit(1, 'ぼく', { alive: false, hp: 0 }), unit(2, '魔王1', { side: 'e', isBoss: true })] }) });
    assert.equal(p.hasWinner, false, '問題が変われば前の勝者は無効');
    assert.equal(p.buzzLabel, '戦闘不能');
    p.destroy();
  } finally { env.restore(); }
});
test('[参加者] 結果の文言: 魔王戦・対戦・引き分け・観戦', async () => {
  const mods = await loadStores(); const env = fakeEnv({ rooms: [room] });
  try {
    const { p, ws } = await joined(env, mods);
    const put = (over, units) => { ws.recv({ t: 'state', state: gstate({ ...over, ...(units ? { units } : {}) }) }); return p.overText; };
    assert.equal(put({ over: 'win', cpu: false }), '勝利！'); assert.equal(p.lost, false);
    assert.equal(put({ over: 'lose' }), '全滅…'); assert.equal(p.lost, true);
    assert.equal(put({ over: 'teamp', cpu: true }), '勝利！');
    assert.equal(put({ over: 'teame', cpu: true }), '全滅…');
    assert.equal(put({ over: 'draw', cpu: false }), '引き分け');
    assert.equal(put({ over: 'teame', cpu: false }, [unit(1, 'ぼく'), unit(2, 'B', { side: 'e' })]), '敗北…');
    assert.equal(put({ over: 'teamp', cpu: false }, [unit(1, 'ぼく'), unit(2, 'B', { side: 'e' })]), '勝利！');
    assert.equal(put({ over: 'teamc', cpu: false, pids: {} }), 'チームCの勝利');
    assert.equal(p.bannerText, 'バトル終了');
    p.destroy();
  } finally { env.restore(); }
});
test('[参加者] 選択ダイアログ: ask で req が入り、answer で番号を送って閉じる。選べない選択肢は送らない。ask_close で閉じる', async () => {
  const mods = await loadStores(); const env = fakeEnv({ rooms: [room] });
  try {
    const { p, ws } = await joined(env, mods);
    ws.recv({ t: 'ask', qid: 9, title: '行動', sub: '', options: [{ label: '通常攻撃' }, { label: '不可', disabled: true }, { label: '何もしない' }] });
    assert.equal(p.req.qid, 9);
    p.answer(1); assert.equal(ws.of('answer').length, 0); assert.ok(p.req);
    p.answer(2); assert.deepEqual(ws.of('answer')[0], { t: 'answer', qid: 9, i: 2 }); assert.equal(p.req, null);
    p.answer(0); assert.equal(ws.of('answer').length, 1, '閉じたあとは送れない');
    ws.recv({ t: 'ask', qid: 10, title: 'x', options: [{ label: 'a' }] });
    ws.recv({ t: 'ask_close', qid: 99 }); assert.ok(p.req, '別の質問の閉じは無視');
    ws.recv({ t: 'ask_close', qid: 10 }); assert.equal(p.req, null);
    p.destroy();
  } finally { env.restore(); }
});
test('[参加者] 設定の送信: 職業・チーム・ディレイ（0〜3000にそろえる）・名前・チャット・チャット回答・退室', async () => {
  const mods = await loadStores(); const env = fakeEnv({ rooms: [room] });
  try {
    const { p, ws } = await joined(env, mods);
    p.pickJob('bm'); assert.deepEqual(ws.of('profile').at(-1), { t: 'profile', job: 'bm', team: 'p' });
    p.pickTeam('c'); assert.deepEqual(ws.of('profile').at(-1), { t: 'profile', job: 'bm', team: 'c' });
    p.setDelay(99999); assert.equal(p.delay, 3000); p.setDelay(-5); assert.equal(p.delay, 0); p.setDelay('abc'); assert.equal(p.delay, 0);
    p.setDelay(250.6); assert.equal(p.delay, 251); assert.equal(ws.of('profile').at(-1).delay, 251); assert.equal(env.local.getItem((await import('../../app/src/lib/storage.js')).KEY.delay), '251');
    p.saveProfile('  ', 'x'); assert.equal(ws.of('profile').filter(m => m.name).length, 0, '空の名前は送らない');
    p.saveProfile(' じろう ', ' ひとこと '); assert.deepEqual(ws.of('profile').at(-1), { t: 'profile', name: 'じろう', flavor: 'ひとこと' });
    p.sendChat('  '); assert.equal(ws.of('chat').length, 0);
    p.sendChat('やあ'); assert.deepEqual(ws.of('chat').at(-1), { t: 'chat', text: 'やあ' });
    p.sendAnswer('こたえ'); assert.deepEqual(ws.of('chat').at(-1), { t: 'chat', text: 'こたえ', answer: true });
    ws.recv({ t: 'chat', name: 'B', text: 'hi' }); assert.equal(p.chat.length, 1);
    for (let i = 0; i < 120; i++) ws.recv({ t: 'chat', name: 'B', text: String(i) });
    assert.equal(p.chat.length, 100, 'チャットは直近100件だけ');
    p.rename(); assert.equal(ws.of('leave').length, 1); assert.equal(p.phase, 'join'); assert.equal(p.pid, null);
  } finally { env.restore(); }
});
test('[参加者] 進行役の引き継ぎ: host_granted で鍵を保存して進行役画面へ', async () => {
  const mods = await loadStores(); const env = fakeEnv({ rooms: [room] });
  try {
    const { p, ws } = await joined(env, mods);
    ws.recv({ t: 'host_granted', hostKey: 'KEY' });
    assert.equal(env.local.getItem('qr_hk_3'), 'KEY'); assert.equal(globalThis.location.href, '/host?id=3');
    p.destroy();
  } finally { env.restore(); }
});

/* ======================= HostStore（進行役） ======================= */
const lobbyPlayers = (online = [true, true]) => online.map((o, i) => ({ pid: 'p' + i, name: 'P' + i, flavor: '', job: ['warrior', 'monk', 'mage'][i % 3], team: 'p', delay: 0, online: o, rtt: 20 }));

async function hostReady(env, mods, { key = 'HK', players = lobbyPlayers(), think = 0 } = {}) {
  env.local.setItem('qr_hk_3', key);
  const h = new mods.host.HostStore(3);
  h.cpuThinkMs = think;
  h.connect();
  const ws = env.ws(); ws.open();
  ws.recv({ t: 'created', room: '3', name: '部屋', password: 'pw' });
  ws.recv({ t: 'lobby', players, foes: ['boss1'], level: 'normal' });
  return { h, ws };
}
test('[進行役] 接続: 鍵がなければ一覧へ戻る。あれば host_resume を送り、created で準備完了', async () => {
  const mods = await loadStores(); let env = fakeEnv();
  try {
    const h = new mods.host.HostStore(3);
    h.connect(); assert.equal(globalThis.location.href, '/');
  } finally { env.restore(); }
  env = fakeEnv();
  try {
    const { h, ws } = await hostReady(env, mods);
    assert.deepEqual(ws.of('host_resume')[0], { t: 'host_resume', id: 3, hostKey: 'HK' });
    assert.equal(h.status, 'ready'); assert.equal(h.roomName, '部屋'); assert.equal(h.password, 'pw');
    h.destroy();
  } finally { env.restore(); }
});
test('[進行役] 名簿: lobby から名簿を作り、開始条件を判定。切断中の人は数えない', async () => {
  const mods = await loadStores(); const env = fakeEnv();
  try {
    const { h, ws } = await hostReady(env, mods, { players: lobbyPlayers([false, false]) });
    assert.match(h.startBlock, /オンラインの参加者/);
    ws.recv({ t: 'lobby', players: lobbyPlayers([true, false]), foes: ['boss2'], level: 'strong' });
    assert.equal(h.startBlock, ''); assert.equal(h.playersNamed.length, 1); assert.equal(h.online, 1);
    assert.deepEqual(h.foes, ['boss2']); assert.equal(h.level, 'strong');
    h.mode = 'pvp'; assert.match(h.startBlock, /2つ以上のチーム/);
    h.removeOffline(); assert.equal(h.roster.length, 1); assert.equal(ws.of('kick')[0].pid, 'p1');
    h.randomizeJobs(); assert.ok(h.roster.every(p => p.touchedJob));
    h.destroy();
  } finally { env.restore(); }
});
test('[進行役] 開始: バトルを始めて、全員の状態・持ち物（本人だけ）・早押しの受付を送る', async () => {
  const mods = await loadStores(); const env = fakeEnv();
  try {
    const { h, ws } = await hostReady(env, mods);
    h.start();
    await tick(30);
    assert.ok(h.G && h.G.units.length === 3, '2人＋魔王');
    const st = ws.of('state').at(-1).state;
    assert.equal(st.q, 1); assert.equal(Object.keys(st.pids).length, 2);
    assert.ok(!JSON.stringify(st).includes('"items"'), '公開の状態に持ち物の中身は含まない');
    const privs = ws.of('priv');
    assert.deepEqual([...new Set(privs.map(m => m.to))].sort(), ['p0', 'p1']);
    assert.ok(privs.every(m => m.items.length === 1), '開始時は1個ずつ');
    const open = ws.of('open')[0];
    assert.equal(open.q, 1); assert.deepEqual(Object.keys(open.eligible).sort(), ['p0', 'p1']);
    // 魔王戦の体力は、人数に応じた倍率がかかる
    assert.ok(h.G.units.find(u => u.isBoss).maxHp > 5);
    h.destroy();
  } finally { env.restore(); }
});
test('[進行役] 早押しの勝者を回答者に選び、正解で選択ダイアログを本人の端末へ送る。答えが届くと進行する', async () => {
  const mods = await loadStores(); const env = fakeEnv();
  try {
    const { h, ws } = await hostReady(env, mods);
    h.start(); await tick(30);
    ws.recv({ t: 'winner', q: 1, pid: 'p0', name: 'P0', ranking: [{ pid: 'p0', name: 'P0', ms: 0 }], all: [{ pid: 'p0', name: 'P0', ms: 0 }] });
    await tick(20);
    assert.equal(h.G.sel, h.G.pids.p0, '回答者に選ばれた');
    assert.match(h.rank, /1\. P0/);
    const done = h.correct();
    await tick(40);
    const ask = ws.of('ask').find(m => /の行動/.test(m.title));
    assert.ok(ask, '行動メニューを送った'); assert.equal(ask.to, 'p0');
    assert.ok(ask.options.every(o => !('value' in o)), '送る選択肢に value は含めない');
    assert.deepEqual(h.waiting, { name: 'P0' });
    ws.recv({ t: 'answer', pid: 'p1', qid: ask.qid, i: 0 });                // 別の人の答えは無視
    assert.ok(h.waiting);
    ws.recv({ t: 'answer', pid: 'p0', qid: ask.qid + 100, i: 0 });          // 別の質問の答えは無視
    assert.ok(h.waiting);
    ws.recv({ t: 'answer', pid: 'p0', qid: ask.qid, i: ask.options.length - 1 });   // 「何もしない」
    await done;
    assert.equal(h.waiting, null); assert.equal(ws.of('ask_close').length >= 1, true);
    assert.equal(h.G.q, 2, '問題が進んだ');
    assert.ok(ws.of('open').length >= 2, '次の問題の受付を出した');
    h.destroy();
  } finally { env.restore(); }
});
test('[進行役] 誤答: ルールごとの動き（次の問題へ／再受付／連チャン）', async () => {
  const mods = await loadStores();
  for (const rule of ['next', 'retry', 'chain']) {
    const env = fakeEnv();
    try {
      const { h, ws } = await hostReady(env, mods, { players: lobbyPlayers([true, true, true]) });
      h.buzzRule = rule; h.start(); await tick(30);
      const opens = ws.of('open').length;
      ws.recv({ t: 'winner', q: 1, pid: 'p0', name: 'P0', ranking: [{ pid: 'p0', name: 'P0', ms: 0 }] });
      await h.wrong(); await tick(30);
      if (rule === 'next') { assert.equal(h.G.q, 2); assert.ok(ws.of('open').length > opens); }
      if (rule === 'retry') { assert.equal(h.G.q, 1); assert.deepEqual(h.G.wrongOn, [h.G.pids.p0]); const o = ws.of('open').at(-1); assert.ok(!('p0' in o.eligible)); assert.ok('p1' in o.eligible); }
      if (rule === 'chain') { assert.equal(h.G.q, 1); assert.deepEqual(ws.of('next')[0], { t: 'next', exclude: ['p0'] }); }
      h.destroy();
    } finally { env.restore(); }
  }
});
test('[進行役] 再受付で押せる人がいなくなったら、その問題を終える', async () => {
  const mods = await loadStores(); const env = fakeEnv();
  try {
    const { h, ws } = await hostReady(env, mods, { players: lobbyPlayers([true]) });
    h.buzzRule = 'retry'; h.start(); await tick(30);
    ws.recv({ t: 'winner', q: 1, pid: 'p0', name: 'P0', ranking: [{ pid: 'p0', name: 'P0', ms: 0 }] });
    await h.wrong(); await tick(60);
    assert.equal(h.G.q, 2);
    h.destroy();
  } finally { env.restore(); }
});
test('[進行役] 途中参戦・離脱: 入室した人は戦闘に加わって受付に入り、退室した人は戦闘から外れる', async () => {
  const mods = await loadStores(); const env = fakeEnv();
  try {
    const { h, ws } = await hostReady(env, mods);
    h.start(); await tick(30);
    ws.recv({ t: 'lobby', players: [...lobbyPlayers(), { pid: 'p9', name: '新入り', flavor: '', job: 'tank', team: 'p', delay: 0, online: true, rtt: 10 }], foes: ['boss1'], level: 'normal' });
    await tick(30);
    assert.ok(h.G.pids.p9 != null, '途中参戦');
    assert.deepEqual(ws.of('add_eligible')[0], { t: 'add_eligible', pid: 'p9', delay: 0 });
    assert.ok(ws.of('priv').some(m => m.to === 'p9' && m.items.length === 1), '途中参戦の人にも持ち物');
    ws.recv({ t: 'lobby', players: lobbyPlayers().slice(0, 1), foes: ['boss1'], level: 'normal' });
    await tick(30);
    assert.equal(h.G.pids.p1, undefined, '退室した人は外れる');
    assert.equal(h.G.pids.p9, undefined);
    h.destroy();
  } finally { env.restore(); }
});
test('[進行役] 回答者が切断したら、進行役の画面で選ぶ。オフラインの人の選択は最初から進行役', async () => {
  const mods = await loadStores(); const env = fakeEnv();
  try {
    const { h, ws } = await hostReady(env, mods);
    h.start(); await tick(30);
    ws.recv({ t: 'winner', q: 1, pid: 'p0', name: 'P0', ranking: [{ pid: 'p0', name: 'P0', ms: 0 }] });
    const done = h.correct(); await tick(40);
    assert.ok(h.waiting);
    ws.recv({ t: 'lobby', players: lobbyPlayers([false, true]), foes: ['boss1'], level: 'normal' });
    await tick(20);
    assert.equal(h.waiting, null);
    assert.ok(mods.ui.modal.req, '進行役の画面に選択が出る');
    assert.match(mods.ui.modal.req.title, /の行動/);
    mods.ui.answerModal(mods.ui.modal.req.options.length - 1);      // 何もしない
    await done;
    assert.equal(h.G.q, 2);
    h.destroy();
  } finally { env.restore(); }
});
test('[進行役] 選択待ちのキャンセル: 処理が元に戻り、受付がやり直せる', async () => {
  const mods = await loadStores(); const env = fakeEnv();
  try {
    const { h, ws } = await hostReady(env, mods);
    h.start(); await tick(30);
    ws.recv({ t: 'winner', q: 1, pid: 'p0', name: 'P0', ranking: [{ pid: 'p0', name: 'P0', ms: 0 }] });
    const done = h.correct(); await tick(40);
    h.abortWaiting();
    assert.equal(await done, false);
    assert.equal(h.G.q, 1); assert.equal(h.waiting, null);
    h.deselect();
    assert.ok(ws.of('open').length >= 2);
    h.destroy();
  } finally { env.restore(); }
});
test('[進行役] 部屋の操作: 設定・ディレイ・戦う相手・難易度・チャット・進行役の交代・退出・部屋を閉じる', async () => {
  const mods = await loadStores(); const env = fakeEnv();
  try {
    const { h, ws } = await hostReady(env, mods);
    h.saveRoom('新', 'pw2'); assert.deepEqual(ws.of('settings').at(-1), { t: 'settings', name: '新', password: 'pw2' });
    h.setDelay('p0', 400); assert.deepEqual(ws.of('set_delay')[0], { t: 'set_delay', pid: 'p0', delay: 400 });
    h.setFoes(['boss4', 'monk']); assert.deepEqual(h.foes, ['boss4', 'monk']); assert.deepEqual(ws.of('set_foes')[0].foes, ['boss4', 'monk']);
    h.setLevel('extreme'); assert.equal(h.level, 'extreme'); assert.equal(ws.of('set_level')[0].level, 'extreme');
    h.sendChat('  '); assert.equal(ws.of('chat').length, 0); h.sendChat('開始'); assert.equal(ws.of('chat')[0].text, '開始');
    ws.recv({ t: 'chat', name: 'P0', text: 'こたえ', answer: true }); assert.equal(h.chat.length, 1);
    ws.recv({ t: 'settings', name: '改名', password: '' }); assert.equal(h.roomName, '改名');
    h.closeRoom();
    assert.equal(ws.of('close').length, 1); assert.equal(env.local.getItem('qr_hk_3'), null);
    ws.recv({ t: 'replaced' }); assert.equal(h.status, 'replaced', '別の画面に進行役を奪われた');
  } finally { env.restore(); }
});
test('[進行役] 保存と再開: バトル中の状態は保存され、再開で続きから。終わった保存は読まない', async () => {
  const mods = await loadStores(); const env = fakeEnv();
  try {
    const { h } = await hostReady(env, mods);
    h.start(); await tick(30);
    const saved = env.local.getItem('qr_save_3');
    assert.ok(saved, '開始時に保存される');
    h.destroy();
    const h2 = new mods.host.HostStore(3);
    assert.ok(h2.saved, '保存された途中のバトルがある');
    h2.discardSaved(); assert.equal(h2.saved, null); assert.equal(env.local.getItem('qr_save_3'), null);
    const over = JSON.parse(saved); over.over = 'win'; env.local.setItem('qr_save_3', JSON.stringify(over));
    assert.equal(new mods.host.HostStore(3).saved, null, '終わった戦闘は再開の対象にしない');
    env.local.setItem('qr_save_3', saved);
    const h3 = new mods.host.HostStore(3);
    h3.connect(); env.ws().open(); env.ws().recv({ t: 'created', room: '3', name: 'x' });
    h3.resume(); await tick(30);
    assert.ok(h3.G && h3.G.q === 1); assert.equal(h3.saved, null);
    h3.quit(); await tick(20); assert.equal(h3.G, null); assert.equal(env.ws().of('endgame').length, 1); assert.equal(env.local.getItem('qr_save_3'), null);
    h3.destroy();
  } finally { env.restore(); }
});
test('[進行役] 1つ戻す・スルー・手直しが画面の状態に反映される', async () => {
  const mods = await loadStores(); const env = fakeEnv();
  try {
    const { h } = await hostReady(env, mods);
    h.start(); await tick(30);
    assert.equal(h.canUndo, false);
    await h.skip(); await tick(60);
    assert.equal(h.G.q, 2); assert.equal(h.canUndo, true);
    h.undo(); await tick(20);
    assert.equal(h.G.q, 1);
    const id = h.G.units[0].id;
    assert.equal(h.editUnit(id, { hp: 1 }), true); await tick(20);
    assert.equal(h.G.units[0].hp, 1);
    h.destroy();
  } finally { env.restore(); }
});

test('[双方向] 進行役が名簿で変えた職業・チームは本人の画面に届き、本人が選び直せば進行役の名簿にも反映される', async () => {
  const mods = await loadStores(); const env = fakeEnv({ rooms: [room] });
  try {
    const { h, ws: hws } = await hostReady(env, mods, { players: lobbyPlayers() });
    const row = h.roster[0];
    row.job = 'tank'; row.touchedJob = true; h.pushProfile(row, { job: 'tank' });
    assert.deepEqual(hws.of('set_profile')[0], { t: 'set_profile', pid: 'p0', job: 'tank' });
    // 本人の画面
    const { p, ws } = await joined(env, mods);
    ws.recv({ t: 'profile_set', job: 'tank', team: 'e', name: '改名' });
    assert.equal(p.myJob, 'tank'); assert.equal(p.myTeam, 'e'); assert.equal(p.name, '改名');
    // サーバーから同じ値が返ってきたら、進行役の「手で変えた」印は外れる → その後の本人の選び直しが反映される
    hws.recv({ t: 'lobby', players: lobbyPlayers().map((x, i) => (i === 0 ? { ...x, job: 'tank' } : x)), foes: ['boss1'], level: 'normal' });
    assert.equal(h.roster[0].touchedJob, false);
    hws.recv({ t: 'lobby', players: lobbyPlayers().map((x, i) => (i === 0 ? { ...x, job: 'bm' } : x)), foes: ['boss1'], level: 'normal' });
    assert.equal(h.roster[0].job, 'bm');
    // 手動追加の行（pid なし）は送らない
    const before = hws.of('set_profile').length;
    h.pushProfile({ pid: null, job: 'bm' }, { job: 'bm' });
    assert.equal(hws.of('set_profile').length, before);
    p.destroy(); h.destroy();
  } finally { env.restore(); }
});

test('[持ち物] 進行役は、本人と同じ陣営の仲間にだけ名前を教える。相手チームには教えない。参加者は仲間の持ち物を受け取って保持する', async () => {
  const mods = await loadStores(); const env = fakeEnv({ rooms: [room] });
  try {
    const { h, ws } = await hostReady(env, mods, { players: [...lobbyPlayers(), { pid: 'p2', name: 'P2', flavor: '', job: 'monk', team: 'e', delay: 0, online: true, rtt: 5 }] });
    h.mode = 'pvp'; h.start(); await tick(30);
    const last = pid => ws.of('priv').filter(m => m.to === pid).at(-1);
    const uid = pid => h.G.pids[pid];
    assert.deepEqual(Object.keys(last('p0').allies), [String(uid('p1'))], 'p0 の仲間は p1 だけ');
    assert.deepEqual(Object.keys(last('p2').allies), [], '相手チームの持ち物は含まない');
    assert.deepEqual(last('p0').allies[uid('p1')], h.G.units.find(u => u.id === uid('p1')).items);
    h.destroy();
    const { p, ws: pws } = await joined(env, mods);
    pws.recv({ t: 'priv', items: ['bomb'], allies: { 2: ['potion'] } });
    assert.deepEqual(p.allyItems, { 2: ['potion'] });
    pws.recv({ t: 'ended' }); assert.deepEqual(p.allyItems, {});
    p.destroy();
  } finally { env.restore(); }
});

test('[進行役] 1つ進める: 戻した操作を進められる。画面の canRedo が追従する', async () => {
  const mods = await loadStores(); const env = fakeEnv();
  try {
    const { h } = await hostReady(env, mods);
    h.start(); await tick(30);
    assert.equal(h.canRedo, false);
    await h.skip(); await tick(60);
    h.undo(); await tick(20);
    assert.equal(h.G.q, 1); assert.equal(h.canRedo, true);
    h.redo(); await tick(20);
    assert.equal(h.G.q, 2); assert.equal(h.canRedo, false);
    h.destroy();
  } finally { env.restore(); }
});

test('[参加者] 早押しボタン: 回答権が決まったあとも、順位や控えのために「押す！」で押せる。押せないときは文言なしの非活性', async () => {
  const mods = await loadStores(); const env = fakeEnv({ rooms: [room] });
  try {
    const { p, ws } = await joined(env, mods);
    ws.recv({ t: 'state', state: gstate() });
    assert.equal(p.buzzLabel, '', '受付前は文言なし'); assert.equal(p.canBuzz, false);
    ws.recv({ t: 'open', q: 1, chain: false, eligible: ['me'] });
    assert.equal(p.canBuzz, true); assert.equal(p.buzzLabel, '押す！');
    ws.recv({ t: 'winner', q: 1, pid: 'x', name: 'ライバル', ranking: [{ pid: 'x', name: 'ライバル', ms: 0 }] });
    assert.equal(p.canBuzz, true, '順位のためだけにも押せる'); assert.equal(p.buzzLabel, '押す！');
    p.buzz(); assert.equal(ws.of('buzz').length, 1);
    assert.equal(p.canBuzz, false); assert.equal(p.buzzLabel, '', '押したあと（他の人が回答権）は文言なしの非活性');
    p.destroy();
  } finally { env.restore(); }
});

/* ===== 進行役が替わっても、バトルを続けられる ===== */
test('[引き継ぎ] 新しい進行役は、サーバーが預かっていたバトルを続きから進める。参加者の一覧が届く前に、全員を退室扱いにしない', async () => {
  const mods = await loadStores(); const env = fakeEnv();
  try {
    const old = await hostReady(env, mods);
    old.h.start(); await tick(30);
    const saved = old.ws.of('save').at(-1).G;                        // 進行役が預けた全状態
    assert.ok(saved.units.length === 3 && saved.log.length <= 40);
    old.h.destroy();
    env.local.clear();                                               // 別の端末（保存なし）が、新しい進行役になる
    env.local.setItem('qr_hk_3', 'NEWKEY');
    const h = new mods.host.HostStore(3);
    h.connect(); const ws = env.ws(); ws.open();
    ws.recv({ t: 'created', room: '3', name: '部屋', hostKey: 'NEWKEY', battle: saved });
    await tick(30);
    assert.ok(h.G && h.G.q === saved.q, 'バトルを続きから読み込んだ');
    assert.ok(Object.keys(h.G.pids).length === 2, '一覧が届く前に、参加者を外していない');
    ws.recv({ t: 'lobby', players: lobbyPlayers(), foes: ['boss1'], level: 'normal' });
    await tick(30);
    assert.equal(Object.keys(h.G.pids).length, 2);
    assert.ok(ws.of('state').length >= 1 && ws.of('open').length >= 1, '参加者に、状態と早押しの受付を出し直した');
    h.destroy();
  } finally { env.restore(); }
});
test('[引き継ぎ] 同じ進行役が再接続しただけなら、バトルを読み込み直さない。終わったバトルは引き継がない', async () => {
  const mods = await loadStores(); const env = fakeEnv();
  try {
    const { h, ws } = await hostReady(env, mods);
    h.start(); await tick(30);
    const before = h.G.q; await h.skip(); await tick(60);
    ws.recv({ t: 'created', room: '3', name: '部屋', battle: { ...ws.of('save').at(-1).G, q: 1 } });     // 古い預かり
    await tick(20);
    assert.equal(h.G.q, before + 1, '手元のバトルが優先');
    h.destroy();
    const h2 = new mods.host.HostStore(3); env.local.setItem('qr_hk_3', 'K'); h2.connect(); const w2 = env.ws(); w2.open();
    w2.recv({ t: 'created', room: '3', name: 'x', battle: { ...ws.of('save').at(-1).G, over: 'win' } });
    await tick(20);
    assert.equal(h2.G, null, '終わったバトルは引き継がない');
    h2.destroy();
  } finally { env.restore(); }
});
test('[引き継ぎ] 参加者: 進行役が替わったら、途中だった選択ダイアログは閉じる。進行役がいないことが分かる', async () => {
  const mods = await loadStores(); const env = fakeEnv({ rooms: [room] });
  try {
    const { p, ws } = await joined(env, mods);
    ws.recv({ t: 'state', state: gstate() });
    ws.recv({ t: 'ask', qid: 4, title: '行動', options: [{ label: 'a' }] });
    assert.ok(p.req);
    ws.recv({ t: 'ask_close', all: true });
    assert.equal(p.req, null);
    ws.recv({ t: 'members', players: [], hasHost: true, hostOnline: false });
    assert.equal(p.hostOnline, false);
    p.claimHost(); assert.equal(ws.of('claim_host').length, 1);
    p.destroy();
  } finally { env.restore(); }
});

/* ======================= 問題集・問読み・CPUの早押し ======================= */
/** 実時間で待つ（偽の環境では200ms以上の待ちが即座に終わるため、100msずつ待つ） */
const wait = async ms => { for (let t = 0; t < ms; t += 100) await tick(100); };
const BANK = JSON.stringify({ questions: [
  { q: 'あいうえおかきくけこ', a: '答え1', cuts: [2, 5, 8], sure: 5, wrong: ['誤1'] },
  { q: 'さしすせそたちつてと', a: '答え2', cuts: [3, 6], sure: 6 },
] });
/** 登場の演出(busy)が終わるまで待ってから、問題をスルーする */
async function skipQ(h) { for (let i = 0; i < 100; i++) { if (!h.busy && (await h.skip())) { await tick(30); return; } await tick(20); } throw new Error('スルーできない'); }

test('[進行役] 問題集: 取り込み・保存・塊ごとの移動。バトルの第N問に合わせて出題が進む', async () => {
  const mods = await loadStores(); const env = fakeEnv();
  try {
    const { h } = await hostReady(env, mods);
    assert.equal(h.quiz.has, false);
    assert.equal(h.quiz.importFrom(BANK).questions.length, 2);
    h.quiz.setCpuOn(false);                                    // この確認では、CPUの早押しで問題が進まないようにする
    assert.ok(env.local.getItem('qk_bank').includes('答え1'), 'この端末に保存される');
    h.start(); await tick(30);
    const qz = h.quiz;
    assert.equal(qz.index, 0); assert.equal(qz.cur.a, '答え1');
    assert.equal(qz.chars, 0); assert.equal(qz.reading, false);
    assert.equal(qz.advance(), true); assert.equal(qz.chars, 2, '次の塊の終わりまで進む');
    qz.advance(); assert.equal(qz.chars, 5);
    qz.back(); assert.equal(qz.chars, 2, '前の塊の初めに戻る');
    qz.back(); assert.equal(qz.chars, 0);
    qz.revealAll(); assert.equal(qz.done, true); assert.equal(qz.advance(), false);
    qz.restart(); assert.equal(qz.chars, 0);
    qz.jump(1); assert.equal(qz.cur.a, '答え2', '手動で次の問題へ');
    qz.jump(-1);
    // 第2問になると2問目が出て、読み始めに戻る。第3問は1問目に戻る（周回）
    qz.advance();
    await skipQ(h);
    assert.equal(h.G.q, 2); assert.equal(qz.cur.a, '答え2'); assert.equal(qz.chars, 0);
    await skipQ(h);
    assert.equal(qz.cur.a, '答え1');
    // 新しい進行役の画面でも、保存した問題集が読める
    assert.equal(new mods.host.HostStore(3).quiz.questions.length, 2);
    // 壊れた保存は無視して空で始まる
    env.local.setItem('qk_bank', '{broken'); assert.equal(new mods.host.HostStore(3).quiz.has, false);
    h.destroy();
  } finally { env.restore(); }
});
test('[進行役] 問読み: 一定の速さで進み、一時停止・再開・速さの変更ができる。速さは保存される', async () => {
  const mods = await loadStores(); const env = fakeEnv();
  try {
    const { h } = await hostReady(env, mods);
    h.quiz.importFrom(BANK); h.quiz.setCpuOn(false); h.start(); await tick(30);
    const qz = h.quiz;
    assert.equal(qz.speed, 7);
    qz.setSpeed(20); assert.equal(env.local.getItem('qk_read_speed'), '20');
    assert.equal(new mods.host.HostStore(3).quiz.speed, 20, '次回も同じ速さ');
    qz.setSpeed(999); assert.equal(qz.speed, 20, '範囲外は上限に丸める');
    qz.setSpeed(1); assert.equal(qz.speed, 2);
    qz.setSpeed(20);
    assert.equal(qz.start(), true); assert.equal(qz.reading, true);
    await wait(250);
    qz.pause();
    const p1 = qz.chars;
    assert.ok(p1 >= 2 && p1 <= 9, `250ms で ${p1} 字（20字/秒なら約5字）`);
    assert.equal(qz.reading, false);
    await wait(150); assert.equal(qz.chars, p1, '停止中は進まない');
    qz.start(); await wait(600);
    assert.equal(qz.done, true, '最後まで読むと自動で止まる'); assert.equal(qz.reading, false); assert.equal(qz.chars, 10);
    assert.equal(qz.start(), false, '読み終えたら始められない');
    qz.restart(); assert.equal(qz.chars, 0);
    // 読み進めている最中に塊を飛ばしても、そこから読み続ける
    qz.setSpeed(2); qz.start(); qz.advance(); assert.equal(qz.chars, 2); assert.equal(qz.reading, true);
    qz.toggle(); assert.equal(qz.reading, false);
    h.destroy();
  } finally { env.restore(); }
});
test('[進行役] 早押しで問読みが止まる: 勝者の押した時刻の位置（文字）で止まり、続きを読める', async () => {
  const mods = await loadStores(); const env = fakeEnv();
  try {
    const { h, ws } = await hostReady(env, mods);
    h.quiz.importFrom(BANK); h.quiz.setCpuOn(false); h.start(); await tick(30);
    const qz = h.quiz, off = h.conn.offset;
    qz.setSpeed(10); qz.start();
    const t0 = performance.now();
    const pressAt = t0 + 250;                                   // 250ms 時点（約2〜3字）に押された
    await wait(600);                                            // その後も読み進めて約6字まで進んでいた
    assert.ok(qz.chars >= 5, `進んでいる: ${qz.chars}`);
    ws.recv({ t: 'winner', q: 1, pid: 'p0', name: 'P0', at: pressAt + off, ranking: [{ pid: 'p0', name: 'P0', ms: 0 }], all: [] });
    await tick(20);
    assert.equal(qz.reading, false);
    assert.ok(qz.frozen >= 2 && qz.frozen <= 3, `押した時刻の位置: ${qz.frozen}`);
    assert.equal(qz.chars, qz.frozen);
    // 続きを読む
    assert.equal(qz.start(), true); assert.equal(qz.frozen, null); assert.equal(qz.reading, true);
    qz.pause();
    // 時刻が無い（古い形式）ときは、いま読んでいる位置で止まる
    const here = qz.chars;
    ws.recv({ t: 'winner', q: 1, pid: 'p0', name: 'P0', ranking: [{ pid: 'p0', name: 'P0', ms: 0 }], all: [] });
    assert.equal(qz.frozen, here);
    // 止まっている間に押された（停止中の位置）なら、その位置のまま
    qz.restart(); qz.advance(); qz.freezeAt(performance.now() + off, off); assert.equal(qz.frozen, 2);
    h.destroy();
  } finally { env.restore(); }
});
test('[進行役] CPUの早押し: 確定ポイントまで読まれるとCPUが先に押し、正解なら問題が終わる／誤答なら続く／オフなら押さない', async () => {
  const mods = await loadStores(); const env = fakeEnv();
  const rnd = Math.random; Math.random = () => 0.5;      // 当てずっぽうにも押さないにも入らない
  try {
    const { h, ws } = await hostReady(env, mods);
    h.level = 'strong';
    h.quiz.importFrom(BANK); h.start(); await tick(30);
    const qz = h.quiz;
    const cpuWins = async (n) => {       // 偽のサーバー: CPUの押下を受け取って、勝者として返す
      for (let i = 0; i < 100 && ws.of('cpu_buzz').length < n; i++) await tick(20);
      const cb = ws.of('cpu_buzz')[n - 1];
      assert.ok(cb, 'CPUの押下がサーバーに送られる');
      assert.match(cb.name, /魔王/); assert.equal(typeof cb.ts, 'number');
      const r = [{ pid: 'cpu:' + cb.id, name: cb.name, ms: 0 }];
      ws.recv({ t: 'winner', q: h.G.q, pid: 'cpu:' + cb.id, name: cb.name, at: cb.ts, ranking: r, all: r });
      await tick(20);
    };
    assert.equal(qz.plans.length, 1, '魔王が押す予定');
    const at = qz.plans[0].at; assert.ok(at >= 5 && qz.plans[0].ok);
    qz.advance(); assert.equal(h.G.q, 1, '確定ポイントの手前では押さない');
    qz.setSpeed(20); qz.start();
    for (let i = 0; i < 100 && !ws.of('cpu_buzz').length; i++) await tick(20);
    assert.equal(qz.reading, false, 'CPUが押した時点で問読みは止まる');
    assert.equal(h.G.q, 1, '勝者が決まるまでは進まない');
    await cpuWins(1);
    for (let i = 0; i < 100 && h.G.q === 1; i++) await tick(20);
    assert.equal(h.G.q, 2, 'CPUが正解して次の問題へ');
    assert.equal(h.G.stats[h.G.units.find(u => u.isBoss).id].correct, 1, 'CPUの成績に数えられる');
    assert.equal(qz.reading, false, '次の問題では読み始めに戻る');
    // オフにすれば押さない
    qz.setCpuOn(false); assert.equal(env.local.getItem('qk_cpu_buzz'), '0');
    qz.revealAll(); await tick(40);
    assert.equal(h.G.q, 2);
    // 誤答になる押し方: 魔王の罰を有効にして確かめる
    qz.setCpuOn(true); qz.restart();
    qz.plans = [{ id: qz.plans[0].id, name: '魔王1', at: 2, ok: false, used: false }];
    h.battle.G.cfg.bossPenalty = true;
    const hp = h.G.units.find(u => u.isBoss).hp;
    const opens = ws.of('open').length;
    qz.advance(); await cpuWins(2); await tick(60);
    assert.equal(h.G.q, 2, '誤答なら問題は続く'); assert.equal(h.G.units.find(u => u.isBoss).hp, hp - 2);
    assert.equal(ws.of('open').length, opens + 1, '参加者がもう一度早押しできるよう、受付を出し直す');
    qz.advance(); qz.advance(); await tick(40);
    assert.equal(ws.of('cpu_buzz').length, 2, '同じ予定は1回だけ');
    assert.equal(h.G.units.find(u => u.isBoss).hp, hp - 2);
    h.destroy();
  } finally { Math.random = rnd; env.restore(); }
});
test('[進行役] CPUが押したあとでも、人間の押下のほうが早ければ人間が回答者になる（CPUは回答しない）', async () => {
  const mods = await loadStores(); const env = fakeEnv();
  const rnd = Math.random; Math.random = () => 0.5;
  try {
    const { h, ws } = await hostReady(env, mods);
    h.level = 'strong'; h.quiz.importFrom(BANK); h.start(); await tick(30);
    h.quiz.setSpeed(20); h.quiz.start();
    for (let i = 0; i < 100 && !ws.of('cpu_buzz').length; i++) await tick(20);
    assert.ok(ws.of('cpu_buzz').length);
    const cb = ws.of('cpu_buzz')[0];
    const all = [{ pid: 'p0', name: 'P0', ms: 0 }, { pid: 'cpu:' + cb.id, name: cb.name, ms: 30 }];
    ws.recv({ t: 'winner', q: 1, pid: 'p0', name: 'P0', at: cb.ts - 30, ranking: all, all });
    await tick(40);
    assert.equal(h.G.q, 1); assert.equal(h.G.sel, h.G.pids.p0, '人間が回答者');
    assert.equal(h.G.stats?.[cb.id]?.correct ?? 0, 0, 'CPUは回答していない');
    h.destroy();
  } finally { Math.random = rnd; env.restore(); }
});
test('[進行役] CPUが早押しに勝ったら、少し「考えている時間」をおいてから答える。その間に問題が進んだら答えない', async () => {
  const mods = await loadStores(); const env = fakeEnv();
  const rnd = Math.random; Math.random = () => 0.5;
  try {
    const { h, ws } = await hostReady(env, mods, { think: 180 });
    h.level = 'strong'; h.quiz.importFrom(BANK); h.start(); await tick(30);
    h.quiz.setSpeed(20); h.quiz.start();
    for (let i = 0; i < 100 && !ws.of('cpu_buzz').length; i++) await tick(20);
    const cb = ws.of('cpu_buzz')[0];
    const r = [{ pid: 'cpu:' + cb.id, name: cb.name, ms: 0 }];
    ws.recv({ t: 'winner', q: 1, pid: 'cpu:' + cb.id, name: cb.name, at: cb.ts, ranking: r, all: r });
    await tick(40);
    assert.equal(h.G.q, 1, '考えている間は、まだ答えていない');
    assert.equal(h.G.stats?.[cb.id]?.correct ?? 0, 0);
    await wait(300);
    for (let i = 0; i < 50 && h.G.q === 1; i++) await tick(20);
    assert.equal(h.G.q, 2, '考えたあとで答える');
    h.destroy();
  } finally { Math.random = rnd; env.restore(); }
});
test('[進行役] サーバーにつながっていないときは、CPUがすぐに回答する', async () => {
  const mods = await loadStores(); const env = fakeEnv();
  const rnd = Math.random; Math.random = () => 0.5;
  try {
    const { h, ws } = await hostReady(env, mods);
    h.level = 'strong'; h.quiz.importFrom(BANK); h.start(); await tick(30);
    ws.readyState = 3;                                          // 切断
    h.quiz.revealAll();
    for (let i = 0; i < 100 && h.G.q === 1; i++) await tick(20);
    assert.equal(h.G.q, 2);
    h.destroy();
  } finally { Math.random = rnd; env.restore(); }
});
test('[進行役] CPUは「わかって」から反応の遅れ（ms）のあとで押す。その間に人間が押していたら、CPUは押さない', async () => {
  const mods = await loadStores(); const env = fakeEnv();
  try {
    const { h, ws } = await hostReady(env, mods);
    h.quiz.importFrom(BANK); h.start(); await tick(30);
    const qz = h.quiz, id = h.G.units.find(u => u.isBoss).id;
    qz.plans = [{ id, name: '魔王1', persona: '慎重', kind: 'know', at: 2, ok: true, answer: null, react: 150, used: false }];
    qz.advance();                                              // 2文字に達した（CPUが「わかった」）
    await tick(30);
    assert.equal(ws.of('cpu_buzz').length, 0, '反応の遅れの間は、まだ押していない');
    await wait(300);
    assert.equal(ws.of('cpu_buzz').length, 1, '遅れのあとで押す');
    // 人間が先に押した場合: 反応している間に勝者が決まったら、CPUは押さない
    ws.sent.length = 0;
    qz.restart();
    qz.plans = [{ id, name: '魔王1', persona: '慎重', kind: 'know', at: 2, ok: true, answer: null, react: 150, used: false }];
    h.reopen(); await tick(20);
    qz.advance(); await tick(20);
    ws.recv({ t: 'winner', q: 1, pid: 'p0', name: 'P0', ranking: [{ pid: 'p0', name: 'P0', ms: 0 }], all: [] });
    await wait(300);
    assert.equal(ws.of('cpu_buzz').length, 0, '人間が押したので、CPUは押さない');
    h.destroy();
  } finally { env.restore(); }
});
test('[進行役] CPUの誤答は答えが演出に出る。誤答するとCPUは慎重になり、次の問題の押し方に反映される', async () => {
  const mods = await loadStores(); const env = fakeEnv();
  const rnd = Math.random; Math.random = () => 0.5;
  try {
    const { h, ws } = await hostReady(env, mods);
    h.level = 'strong'; h.quiz.importFrom(BANK); h.start(); await tick(30);
    const qz = h.quiz, id = h.G.units.find(u => u.isBoss).id;
    h.battle.G.cfg.bossPenalty = true;
    qz.plans = [{ id, name: '魔王1', persona: 'せっかち', kind: 'trap', at: 2, ok: false, answer: '罠の答え', react: 0, used: false }];
    qz.advance();
    for (let i = 0; i < 100 && !ws.of('cpu_buzz').length; i++) await tick(20);
    const cb = ws.of('cpu_buzz')[0];
    ws.recv({ t: 'winner', q: 1, pid: 'cpu:' + cb.id, name: cb.name, at: cb.ts, ranking: [{ pid: 'cpu:' + cb.id, name: cb.name, ms: 0 }], all: [] });
    await tick(80);
    assert.equal(h.G.event?.kind, 'answer'); assert.equal(h.G.event.text, '罠の答え'); assert.equal(h.G.event.ok, false);
    assert.ok(h.G.log.some(l => /「罠の答え」と答え、誤答/.test(l.m)));
    // 次の問題へ（スルー）。慎重になっているので、先走り・知ったかぶりが出ない
    await skipQ(h);
    for (let i = 0; i < 30; i++) {
      h.quiz.sync(h.G.q + i + 1, [{ id, name: '魔王1' }], 'weak');
      const p = h.quiz.plans[0];
      if (i === 0) assert.ok(!p || p.kind === 'know', `慎重な直後: ${p?.kind}`);
    }
    h.destroy();
  } finally { Math.random = rnd; env.restore(); }
});
test('[進行役] 問題集があり「CPUも早押しする」がオンなら、CPUは早押しに勝った問題でだけ行動する（押し負け・スルーでは動かない）', async () => {
  const mods = await loadStores(); const env = fakeEnv();
  try {
    const { h } = await hostReady(env, mods);
    h.start(); await tick(30);
    assert.ok(!h.G.cfg.cpuBuzz, '問題集がなければ、これまでどおり');
    h.quiz.importFrom(BANK); h.syncQuiz();
    assert.equal(h.battle.G.cfg.cpuBuzz, true, '問題集があればオン');
    h.quiz.setCpuOn(false); h.syncQuiz();
    assert.equal(h.battle.G.cfg.cpuBuzz, false, 'CPUが早押ししない設定なら、これまでどおり');
    h.quiz.setCpuOn(true); h.syncQuiz();
    assert.equal(h.battle.G.cfg.cpuBuzz, true);
    h.quiz.clear(); h.syncQuiz();
    assert.equal(h.battle.G.cfg.cpuBuzz, false, '問題集を消せば、元に戻る');
    h.destroy();
  } finally { env.restore(); }
});
test('[進行役] 人間が先に押していたら、CPUは押さない（回答者が決まっている間）', async () => {
  const mods = await loadStores(); const env = fakeEnv();
  const rnd = Math.random; Math.random = () => 0.5;
  try {
    const { h, ws } = await hostReady(env, mods);
    h.level = 'strong'; h.quiz.importFrom(BANK); h.start(); await tick(30);
    h.quiz.advance();
    ws.recv({ t: 'winner', q: 1, pid: 'p0', name: 'P0', ranking: [{ pid: 'p0', name: 'P0', ms: 0 }], all: [] });
    await tick(20);
    h.quiz.revealAll(); await tick(40);
    assert.equal(h.G.q, 1); assert.equal(h.G.sel, h.G.pids.p0, '人間の回答のまま');
    h.destroy();
  } finally { Math.random = rnd; env.restore(); }
});
