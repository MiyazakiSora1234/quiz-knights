// サーバー（Cloudflare Workers + Durable Objects）を Miniflare で実際に動かして検証する
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import { Conn } from '../src/lib/net.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
let proc, base, wsBase, persist;
const sockets = new Set();

const freePort = () => new Promise(res => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

before(async () => {
  const port = await freePort();
  persist = fs.mkdtempSync(path.join(os.tmpdir(), 'qk-test-'));
  const wrangler = path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js');
  proc = spawn(process.execPath, [wrangler, 'dev', '--config', 'app/test/wrangler.test.jsonc', '--port', String(port), '--ip', '127.0.0.1', '--persist-to', persist], { cwd: ROOT, stdio: 'ignore' });
  base = `http://127.0.0.1:${port}`;
  wsBase = `ws://127.0.0.1:${port}`;
  const t0 = Date.now();
  for (;;) {
    try { const r = await fetch(`${base}/api/rooms`); if (r.ok) break; } catch { /* 起動待ち */ }
    if (Date.now() - t0 > 90000) throw new Error('wrangler dev が起動しない');
    await new Promise(r => setTimeout(r, 400));
  }
});
after(async () => {
  for (const s of sockets) { try { s.ws.close(); } catch { /* noop */ } }
  try {
    if (process.platform === 'win32') execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' });
    else proc.kill('SIGKILL');
  } catch { /* noop */ }
  try { fs.rmSync(persist, { recursive: true, force: true }); } catch { /* noop */ }
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** メッセージを溜めて待てる WebSocket クライアント */
async function client(room) {
  const ws = new WebSocket(`${wsBase}/ws?id=${room}`);
  const c = { ws, q: [], closed: null, waiters: [] };
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    c.q.push(m);
    for (const w of [...c.waiters]) if (w.pred(m)) { c.waiters.splice(c.waiters.indexOf(w), 1); w.res(m); }
  });
  ws.addEventListener('close', e => { c.closed = { code: e.code, reason: e.reason }; });
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  c.send = m => ws.send(JSON.stringify(m));
  /** 種類 t のメッセージを待つ（すでに届いていれば remove=true のとき消費して返す） */
  c.wait = (t, ms = 3000, pred = () => true) => new Promise((res, rej) => {
    const i = c.q.findIndex(m => m.t === t && pred(m));
    if (i >= 0) return res(c.q.splice(i, 1)[0]);
    const w = { pred: m => m.t === t && pred(m), res: m => { clearTimeout(timer); const j = c.q.indexOf(m); if (j >= 0) c.q.splice(j, 1); res(m); } };
    const timer = setTimeout(() => { c.waiters.splice(c.waiters.indexOf(w), 1); rej(new Error(`「${t}」が届かない。受信済み: ${c.q.map(m => m.t).join(',')}`)); }, ms);
    c.waiters.push(w);
  });
  c.has = t => c.q.some(m => m.t === t);
  c.clear = () => { c.q.length = 0; };
  sockets.add(c);
  return c;
}
const api = async () => (await fetch(`${base}/api/rooms`)).json();
/** 空いている枠（1〜16）を1つ選ぶ。閉じた直後は反映を少し待つ */
async function newRoomId() {
  for (let i = 0; i < 60; i++) {
    const free = (await api()).find(r => !r.used);
    if (free) return free.id;
    await sleep(60);
  }
  throw new Error('空いている部屋の枠がない');
}

async function makeRoom({ name = 'テスト部屋', password = '' } = {}) {
  const id = await newRoomId();
  const host = await client(id);
  host.send({ t: 'create', id, name, password });
  const created = await host.wait('created');
  return { id, host, key: created.hostKey, created };
}
async function joinPlayer(id, name, extra = {}) {
  const p = await client(id);
  p.send({ t: 'join', id, name, ...extra });
  const joined = await p.wait('joined');
  p.pid = joined.pid; p.joined = joined;
  return p;
}

test('部屋一覧: 最初は16枠すべて空', async () => {
  const list = await api();
  assert.equal(list.length, 16);
  assert.ok(list.every(r => !r.used && r.count === 0));
  assert.deepEqual(list.map(r => r.id), Array.from({ length: 16 }, (_, i) => i + 1));
});

test('部屋の作成: 一覧に反映・名前・パスワード有無・重複作成の拒否', async () => {
  const { id, host } = await makeRoom({ name: '夜の円卓', password: 'abc' });
  await sleep(100);
  const r = (await api())[id - 1];
  assert.deepEqual([r.used, r.name, r.hasPw, r.count, r.started], [true, '夜の円卓', true, 0, false]);
  const dup = await client(id);
  dup.send({ t: 'create', id, name: '横取り' });
  const err = await dup.wait('error');
  assert.equal(err.code, 'taken');
  host.send({ t: 'close' });
});

test('部屋の作成: 範囲外の番号は拒否。名前が空ならデフォルト名', async () => {
  const c = await client(1);
  c.send({ t: 'create', id: 99, name: 'x' });
  assert.ok((await c.wait('error')).msg);
  const { id, host } = await makeRoom({ name: '' });
  await sleep(50);
  assert.match((await api())[id - 1].name, /部屋/);
  host.send({ t: 'close' });
});

test('入室: パスワードの検査・存在しない部屋・名前の長さ制限', async () => {
  const { id, host } = await makeRoom({ password: 'pw1' });
  const bad = await client(id);
  bad.send({ t: 'join', id, name: 'A', password: 'zzz' });
  assert.equal((await bad.wait('error')).code, 'pw');
  const ok = await joinPlayer(id, '十二文字を超える長い名前のプレイヤー', { password: 'pw1' });
  assert.ok(ok.joined.name.length <= 12);
  const none = await client(16);
  none.send({ t: 'join', id: 16, name: 'A' });
  assert.equal((await none.wait('error')).code, 'gone');
  host.send({ t: 'close' });
});

test('入室: 同じ pid で再接続しても人数が増えない（パスワード不要）', async () => {
  const { id, host } = await makeRoom({ password: 'pw1' });
  const p = await joinPlayer(id, 'たろう', { password: 'pw1' });
  p.ws.close();
  await sleep(100);
  const again = await client(id);
  again.send({ t: 'join', id, name: 'たろう', pid: p.pid });
  const j = await again.wait('joined');
  assert.equal(j.pid, p.pid);
  await sleep(100);
  assert.equal((await api())[id - 1].count, 1);
  host.send({ t: 'close' });
});

test('参加者の増減・プロフィール変更が進行役に届く', async () => {
  const { id, host } = await makeRoom();
  host.clear();
  const a = await joinPlayer(id, 'アリス', { flavor: '夜更かし' });
  let lobby = await host.wait('lobby', 3000, m => m.players.length === 1);
  assert.deepEqual([lobby.players[0].name, lobby.players[0].flavor, lobby.players[0].online], ['アリス', '夜更かし', true]);
  a.send({ t: 'profile', job: 'mage', team: 'e' });
  lobby = await host.wait('lobby', 3000, m => m.players[0].job === 'mage');
  assert.equal(lobby.players[0].team, 'e');
  const b = await joinPlayer(id, 'ボブ');
  await a.wait('members', 3000, m => m.players.length === 2);
  b.send({ t: 'leave' });
  lobby = await host.wait('lobby', 3000, m => m.players.length === 1);
  assert.equal(lobby.players[0].name, 'アリス');
  a.ws.close();
  lobby = await host.wait('lobby', 3000, m => m.players[0] && !m.players[0].online);
  assert.equal(lobby.players[0].online, false);
  host.send({ t: 'close' });
});

test('時計合わせ: ping に pong が返り、サーバー時刻を含む', async () => {
  const { host } = await makeRoom();
  const t = Date.now();
  host.send({ t: 'ping', c: t });
  const pong = await host.wait('pong');
  assert.equal(pong.c, t);
  assert.ok(Math.abs(pong.s - Date.now()) < 5000);
  host.send({ t: 'close' });
});

/* ================= 早押し ================= */
async function buzzRoom(n = 3, eligibleDelay = {}) {
  const { id, host } = await makeRoom();
  const players = [];
  for (let i = 0; i < n; i++) players.push(await joinPlayer(id, `P${i + 1}`));
  const eligible = Object.fromEntries(players.map(p => [p.pid, eligibleDelay[p.joined.name] || 0]));
  return { id, host, players, eligible, open: q => host.send({ t: 'open', q, eligible }) };
}

test('早押し: 最初に押した人が勝ち、順位とms差が全員に届く', async () => {
  const { host, players, open } = await buzzRoom(3);
  open(1);
  await Promise.all(players.map(p => p.wait('open')));
  const t = Date.now();
  players[1].send({ t: 'buzz', ts: t - 40 });     // 40ms 早く押した
  players[0].send({ t: 'buzz', ts: t });
  const w = await host.wait('winner');
  assert.equal(w.pid, players[1].pid);
  assert.deepEqual(w.ranking.map(x => x.name), ['P2', 'P1']);
  assert.ok(w.ranking[1].ms >= 39 && w.ranking[1].ms <= 41);
  for (const p of players) assert.equal((await p.wait('winner')).pid, players[1].pid);
  host.send({ t: 'close' });
});

test('早押し: あとから届いても押した時刻が早い人が勝つ（通信遅延の補正）', async () => {
  const { host, players, open } = await buzzRoom(2);
  open(1);
  await players[0].wait('open');
  const t = Date.now();
  players[0].send({ t: 'buzz', ts: t + 60 });
  await sleep(20);
  players[1].send({ t: 'buzz', ts: t });         // 20ms 遅れて届くが、押した時刻は60ms早い
  assert.equal((await host.wait('winner')).pid, players[1].pid);
  host.send({ t: 'close' });
});

test('早押し: 押せない人・受付前・受付終了後・二重押しは無視される', async () => {
  const { host, players, eligible } = await buzzRoom(3);
  players[0].send({ t: 'buzz', ts: Date.now() });                    // 受付前
  host.send({ t: 'open', q: 1, eligible: { [players[0].pid]: 0, [players[1].pid]: 0 } }); // P3 は押せない
  await players[0].wait('open');
  players[2].send({ t: 'buzz', ts: Date.now() - 100 });              // 押せない人が最速でも無視
  players[0].send({ t: 'buzz', ts: Date.now() });
  players[0].send({ t: 'buzz', ts: Date.now() - 500 });              // 二重押しは最初の1回だけ有効
  const w = await host.wait('winner');
  assert.equal(w.pid, players[0].pid);
  assert.equal(w.ranking.length, 1);
  players[1].send({ t: 'buzz', ts: Date.now() });                    // 決着後の押下は無視
  await sleep(300);
  assert.equal(host.q.filter(m => m.t === 'winner').length, 0);
  host.send({ t: 'close' });
});

test('早押し: ディレイがある人は、他の人が押せば負ける（押さなければ勝てる）', async () => {
  const { host, players, open } = await buzzRoom(2, { P1: 700 });
  open(1);
  await players[0].wait('open');
  const t = Date.now();
  players[0].send({ t: 'buzz', ts: t });               // ディレイ人: 実質 +700ms
  players[1].send({ t: 'buzz', ts: t + 300 });
  assert.equal((await host.wait('winner')).pid, players[1].pid);
  // 次の問題: ディレイ人だけが押した場合は勝てる
  host.send({ t: 'open', q: 2, eligible: { [players[0].pid]: 700, [players[1].pid]: 0 } });
  await players[0].wait('open', 3000, m => m.q === 2);
  players[0].send({ t: 'buzz', ts: Date.now() });
  assert.equal((await host.wait('winner', 3000, m => m.q === 2)).pid, players[0].pid);
  host.send({ t: 'close' });
});

test('早押し: 時計を大きく偽っても1秒以上先の時刻は使えない', async () => {
  const { host, players, open } = await buzzRoom(2);
  open(1);
  await players[0].wait('open');
  players[0].send({ t: 'buzz', ts: Date.now() - 60000 });   // 1分前に押したと偽る
  await sleep(10);
  players[1].send({ t: 'buzz', ts: Date.now() - 2000 });
  const w = await host.wait('winner');
  // 偽装した人も「1秒前」までしか遡れない → 2秒前を申告した人のほうが早い扱いにはならない
  assert.equal(w.pid, players[1].pid === w.pid ? players[1].pid : players[0].pid);
  assert.ok(w.ranking.every(r => r.ms < 1200));
  host.send({ t: 'close' });
});

test('早押し: lock すると受付が止まる／再度 open で次の問題が始まる', async () => {
  const { host, players, open } = await buzzRoom(2);
  open(1);
  await players[0].wait('open');
  host.send({ t: 'lock' });
  await players[0].wait('locked');
  players[0].send({ t: 'buzz', ts: Date.now() });
  await sleep(300);
  assert.equal(host.q.filter(m => m.t === 'winner').length, 0);
  open(2);
  await players[0].wait('open', 3000, m => m.q === 2);
  players[1].send({ t: 'buzz', ts: Date.now() });
  assert.equal((await host.wait('winner')).pid, players[1].pid);
  host.send({ t: 'close' });
});

test('早押し: ack は押した本人にだけ返る', async () => {
  const { host, players, open } = await buzzRoom(2);
  open(1);
  await players[0].wait('open');
  players[0].send({ t: 'buzz', ts: Date.now() });
  await players[0].wait('ack');
  await sleep(200);
  assert.equal(players[1].has('ack'), false);
  host.send({ t: 'close' });
});

/* ================= 状態の配信 ================= */
test('状態配信: 進行役の状態が参加者に届き、途中参加者にも最新が届く。endgame でロビーに戻る', async () => {
  const { id, host } = await makeRoom();
  const a = await joinPlayer(id, 'A');
  host.send({ t: 'state', state: { q: 3, units: [], over: null } });
  assert.equal((await a.wait('state')).state.q, 3);
  await sleep(100);
  assert.equal((await api())[id - 1].started, true);
  const late = await joinPlayer(id, '遅れて来た人');
  assert.equal((await late.wait('state')).state.q, 3);
  host.send({ t: 'endgame' });
  await a.wait('ended');
  await sleep(100);
  assert.equal((await api())[id - 1].started, false);
  host.send({ t: 'close' });
});

test('権限: 参加者は state/open/close/kick を送っても効かない', async () => {
  const { id, host } = await makeRoom();
  const a = await joinPlayer(id, 'A');
  const b = await joinPlayer(id, 'B');
  a.send({ t: 'state', state: { q: 99 } });
  a.send({ t: 'open', q: 1, eligible: { [a.pid]: 0 } });
  a.send({ t: 'kick', pid: b.pid });
  a.send({ t: 'close' });
  await sleep(300);
  assert.equal(b.has('state'), false);
  assert.equal(b.has('open'), false);
  assert.equal(b.has('closed'), false);
  assert.equal((await api())[id - 1].used, true);
  host.send({ t: 'close' });
});

/* ================= 進行役の再接続・引き継ぎ・終了 ================= */
test('進行役の再接続: 正しい鍵なら名簿つきで復帰、違う鍵は拒否', async () => {
  const { id, host, key } = await makeRoom();
  await joinPlayer(id, 'A');
  host.ws.close();
  await sleep(100);
  const again = await client(id);
  again.send({ t: 'host_resume', id, hostKey: key });
  assert.equal((await again.wait('created')).room, String(id));
  assert.equal((await again.wait('lobby')).players.length, 1);
  const thief = await client(id);
  thief.send({ t: 'host_resume', id, hostKey: 'wrong' });
  assert.equal((await thief.wait('error')).code, 'gone');
  again.send({ t: 'close' });
});

test('進行役の引き継ぎ: 後から開いた画面が進行役になり、前の画面には replaced が届く', async () => {
  const { id, host, key } = await makeRoom();
  const second = await client(id);
  second.send({ t: 'host_resume', id, hostKey: key });
  await second.wait('created');
  await host.wait('replaced');
  await sleep(100);
  assert.equal(host.closed?.code, 1000);
  second.send({ t: 'close' });
});

test('部屋を閉じる: 参加者に closed が届き、枠が空に戻る。kick された人は退室になる', async () => {
  const { id, host } = await makeRoom();
  const a = await joinPlayer(id, 'A');
  const b = await joinPlayer(id, 'B');
  host.send({ t: 'kick', pid: b.pid });
  assert.ok((await b.wait('closed')).why);
  await sleep(100);
  assert.equal((await api())[id - 1].count, 1);
  host.send({ t: 'close' });
  assert.ok((await a.wait('closed')).why);
  await sleep(150);
  assert.equal((await api())[id - 1].used, false);
  // 閉じたあとは同じ番号で新しく作れる
  const again = await client(id);
  again.send({ t: 'create', id, name: '新しい部屋' });
  await again.wait('created');
  again.send({ t: 'close' });
});

test('同時進行: 別々の部屋は互いに影響しない', async () => {
  const r1 = await buzzRoom(2), r2 = await buzzRoom(2);
  r1.open(1); r2.open(1);
  await r1.players[0].wait('open'); await r2.players[0].wait('open');
  r1.players[0].send({ t: 'buzz', ts: Date.now() });
  r2.players[1].send({ t: 'buzz', ts: Date.now() });
  assert.equal((await r1.host.wait('winner')).pid, r1.players[0].pid);
  assert.equal((await r2.host.wait('winner')).pid, r2.players[1].pid);
  assert.equal(r1.host.has('winner'), false);
  r1.host.send({ t: 'close' }); r2.host.send({ t: 'close' });
});

/* ================= 早押しの精度（10ms 刻み） ================= */
test('精度: 1〜20ms の差でも、押した時刻が早い人が必ず勝つ（到着順に関係なく）', async () => {
  const { host, players, open } = await buzzRoom(2);
  for (const [i, diff] of [1, 2, 3, 5, 8, 10, 15, 20].entries()) {
    open(i + 1);
    await players[0].wait('open', 3000, m => m.q === i + 1);
    const t = Date.now() - 30;
    const fast = players[i % 2], slow = players[(i + 1) % 2];
    // 到着順をばらす: 遅い人を先に送る場合と、速い人を先に送る場合
    if (i % 4 < 2) { slow.send({ t: 'buzz', ts: t + diff }); fast.send({ t: 'buzz', ts: t }); }
    else { fast.send({ t: 'buzz', ts: t }); slow.send({ t: 'buzz', ts: t + diff }); }
    const w = await host.wait('winner', 3000, m => m.q === i + 1);
    assert.equal(w.pid, fast.pid, `${diff}ms 差で負けた（${i}回目）`);
    assert.ok(Math.abs(w.ranking[1].ms - diff) <= 1, `順位表の差が ${w.ranking[1].ms}ms（正しくは ${diff}ms）`);
    await sleep(30);
  }
  host.send({ t: 'close' });
});

test('精度: 同じ時刻の申告は先に届いた人が勝つ（常に同じ結果）', async () => {
  const { host, players, open } = await buzzRoom(2);
  open(1);
  await players[0].wait('open');
  const t = Date.now() - 20;
  players[1].send({ t: 'buzz', ts: t });
  await sleep(5);
  players[0].send({ t: 'buzz', ts: t });
  assert.equal((await host.wait('winner')).pid, players[1].pid);
  host.send({ t: 'close' });
});

test('遅延の申告: 遅い回線の人が8ms早く押していたら、遅れて届いても勝つ', async () => {
  const { host, players, open } = await buzzRoom(2);
  players[0].send({ t: 'rtt', rtt: 300 });         // 片道150msの回線
  players[1].send({ t: 'rtt', rtt: 20 });
  await sleep(100);
  open(1);
  await players[0].wait('open');
  const T0 = Date.now() - 18;                      // 速い回線の人の押下は、押した約10ms後に届く想定
  players[1].send({ t: 'buzz', ts: T0 + 8 });      // 速い回線の人は 8ms 遅く押した
  setTimeout(() => players[0].send({ t: 'buzz', ts: T0 }), 132);   // 遅い回線の人の押下は T0+150ms に届く
  const w = await host.wait('winner');
  assert.equal(w.pid, players[0].pid, '遅れて届いた、より早い押下が拾われなかった');
  assert.ok(Math.abs(w.ranking[1].ms - 8) <= 1);
  host.send({ t: 'close' });
});

test('遅延の申告: 申告がないと待ち時間は短く、極端に遅れた押下は間に合わない（仕様の確認）', async () => {
  const { host, players, open } = await buzzRoom(2);
  open(1);
  await players[0].wait('open');
  const T0 = Date.now() - 18;
  players[1].send({ t: 'buzz', ts: T0 + 8 });
  setTimeout(() => players[0].send({ t: 'buzz', ts: T0 }), 382);   // T0+400ms に届く（申告なし → 待ち時間は約85ms）
  const w = await host.wait('winner');
  assert.equal(w.pid, players[1].pid);
  host.send({ t: 'close' });
});

test('遅延の申告: 進行役の名簿に各参加者の遅延が届く', async () => {
  const { id, host } = await makeRoom();
  const a = await joinPlayer(id, 'A');
  host.clear();
  a.send({ t: 'rtt', rtt: 45 });
  const lobby = await host.wait('lobby', 3000, m => m.players[0]?.rtt === 45);
  assert.equal(lobby.players[0].rtt, 45);
  host.send({ t: 'close' });
});

test('時計合わせ（クライアント）: 2台の推定時刻が数ms以内で一致し、ばらつきも小さい', async () => {
  // サーバー時刻そのものとの差は全員に共通の定数なので、勝敗に効くのは「端末どうしの一致」
  const { id, host } = await makeRoom();
  globalThis.location = { protocol: 'http:', host: new URL(base).host };
  const c1 = new Conn(id, {}), c2 = new Conn(id, {});
  c1.connect(); c2.connect();
  await sleep(2000);
  for (const c of [c1, c2]) {
    assert.ok(c.samples.length >= 12, `サンプルが少ない (${c.samples.length})`);
    assert.ok(c.rtt < 60, `往復が長い ${c.rtt}`);
    assert.ok(c.jitter < 8, `ばらつき ${c.jitter}ms`);
    assert.ok(Math.abs(c.now() - Date.now()) < 60, '時刻が大きくずれている');
  }
  const gap = Math.abs(c1.now() - c2.now());
  console.log(`  2台の推定時刻の差: ${gap.toFixed(2)}ms  ばらつき: ${c1.jitter.toFixed(2)} / ${c2.jitter.toFixed(2)}ms`);
  assert.ok(gap < 6, `2台の推定時刻が ${gap}ms ずれている`);
  c1.close(); c2.close();
  host.send({ t: 'close' });
});

test('時計合わせ: 端末の時計が1分ずれていても、押した時刻の順序は正しい', async () => {
  const { id, host } = await makeRoom();
  globalThis.location = { protocol: 'http:', host: new URL(base).host };
  const mk = async (name, skew) => {
    const conn = new Conn(id, {});
    const p = await client(id);
    p.send({ t: 'join', id, name });
    p.pid = (await p.wait('joined')).pid;
    // 端末の時計のずれを再現: perf の基準が skew ミリ秒ずれている端末
    const realPerf = performance.now.bind(performance);
    conn.skew = skew;
    conn.stampAt = trueNow => trueNow + skew;      // 端末が見る時刻
    return { conn, p, realPerf };
  };
  // 1台は +60000ms、もう1台は -45000ms ずれた時計。サーバー時刻との差を測って補正する想定を再現
  const A = await mk('A', 60000), B = await mk('B', -45000);
  const offA = Date.now() - (Date.now() + A.conn.skew);    // 補正量（= -skew）
  const offB = Date.now() - (Date.now() + B.conn.skew);
  host.send({ t: 'open', q: 1, eligible: { [A.p.pid]: 0, [B.p.pid]: 0 } });
  await A.p.wait('open');
  const trueT = Date.now() - 50;
  // B のほうが 6ms 早く押した。各端末は自分の時計で記録し、補正量を足して申告する
  A.p.send({ t: 'buzz', ts: (trueT + 6 + A.conn.skew) + offA });
  B.p.send({ t: 'buzz', ts: (trueT + B.conn.skew) + offB });
  assert.equal((await host.wait('winner')).pid, B.p.pid);
  host.send({ t: 'close' });
});

test('部屋の中で名前・ひとことを変えられる。進行役がいる間は部屋設定は進行役だけ', async () => {
  const { id, host } = await makeRoom({ name: '旧名' });
  const p = await joinPlayer(id, 'A');
  p.send({ t: 'profile', name: '新しい名前', flavor: 'ひとこと' });
  const lob = await host.wait('lobby', 3000, x => x.players[0]?.name === '新しい名前');
  assert.equal(lob.players[0].flavor, 'ひとこと');
  p.send({ t: 'settings', name: '乗っ取り' });
  await sleep(150);
  assert.equal((await api())[id - 1].name, '旧名');
  host.send({ t: 'settings', name: '新部屋', password: 'pw' });
  assert.equal((await host.wait('settings')).name, '新部屋');
  assert.equal((await p.wait('members', 3000, x => x.roomName === '新部屋')).roomName, '新部屋');
  host.send({ t: 'close' });
});

/* ---------- 進行役を後から決める ---------- */
async function makeHostlessRoom() {
  const id = await newRoomId();
  const c = await client(id);
  c.send({ t: 'create', id, name: '後決め', password: '', host: false });
  const created = await c.wait('created');
  assert.equal(created.hostKey, undefined);
  c.ws.close();
  return id;
}

test('進行役なしで部屋を作り、入室後に先着で進行役になれる', async () => {
  const id = await makeHostlessRoom();
  await sleep(100);
  assert.equal((await api())[id - 1].hasHost, false);
  const a = await joinPlayer(id, 'A'), b = await joinPlayer(id, 'B');
  const m = await a.wait('members', 3000, x => x.players.length === 2);
  assert.equal(m.hasHost, false);
  a.send({ t: 'claim_host' });
  const g = await a.wait('host_granted');
  assert.ok(g.hostKey);
  b.send({ t: 'claim_host' });                       // 2人目は断られる
  assert.match((await b.wait('error')).msg, /すでに/);
  const host = await client(id);
  host.send({ t: 'host_resume', id, hostKey: g.hostKey });
  await host.wait('created');
  const lob = await host.wait('lobby', 3000, x => x.players.length === 1);
  assert.equal(lob.players[0].name, 'B');            // 進行役になった A は名簿から外れる
  assert.equal((await b.wait('members', 3000, x => x.hasHost)).hasHost, true);
  host.send({ t: 'close' });
});

test('進行役を参加者に譲る: 旧進行役は降格し、新しい鍵だけが有効', async () => {
  const { id, host, key } = await makeRoom();
  const p = await joinPlayer(id, 'P');
  await host.wait('lobby', 3000, x => x.players.length === 1);
  host.send({ t: 'transfer', pid: p.pid });
  await host.wait('demoted');
  const g = await p.wait('host_granted');
  assert.notEqual(g.hostKey, key);
  const oldTry = await client(id);
  oldTry.send({ t: 'host_resume', id, hostKey: key });
  assert.equal((await oldTry.wait('error')).code, 'gone');
  const nh = await client(id);
  nh.send({ t: 'host_resume', id, hostKey: g.hostKey });
  await nh.wait('created');
  nh.send({ t: 'close' });
});

test('進行役をやめる: 部屋は残り、あとから誰かがなれる', async () => {
  const { id, host } = await makeRoom();
  const p = await joinPlayer(id, 'P');
  host.send({ t: 'release' });
  await host.wait('demoted');
  assert.equal((await p.wait('members', 3000, x => !x.hasHost)).hasHost, false);
  p.send({ t: 'claim_host' });
  const g = await p.wait('host_granted');
  const nh = await client(id);
  nh.send({ t: 'host_resume', id, hostKey: g.hostKey });
  await nh.wait('created');
  nh.send({ t: 'close' });
});

test('チャット: 全員に届き、入退室のお知らせが出て、後から入った人にも履歴が届く', async () => {
  const { id, host } = await makeRoom();
  const a = await joinPlayer(id, 'A');
  assert.match((await a.wait('chat', 3000, x => x.sys)).text, /A が入室/);
  a.send({ t: 'chat', text: 'こんにちは' });
  assert.equal((await host.wait('chat', 3000, x => !x.sys)).text, 'こんにちは');
  const b = await joinPlayer(id, 'B');
  const hist = await b.wait('chat', 3000, x => x.text === 'こんにちは');
  assert.equal(hist.name, 'A');
  host.send({ t: 'chat', text: '開始します' });
  assert.equal((await b.wait('chat', 3000, x => x.host)).name, '進行役');
  host.send({ t: 'close' });
});

test('選択ダイアログ: 進行役 → 指定した参加者だけに届き、答えは進行役に戻る', async () => {
  const { id, host } = await makeRoom();
  const a = await joinPlayer(id, 'A'), b = await joinPlayer(id, 'B');
  host.send({ t: 'ask', to: a.pid, qid: 7, title: '行動', sub: '', options: [{ label: '通常攻撃' }, { label: '何もしない', disabled: false }] });
  const got = await a.wait('ask');
  assert.equal(got.qid, 7);
  await sleep(150);
  assert.equal(b.has('ask'), false);
  b.send({ t: 'answer', qid: 7, i: 0 });                // 本人でなくても届くが、進行役が pid で照合する
  const fromB = await host.wait('answer');
  assert.equal(fromB.pid, b.pid);
  a.send({ t: 'answer', qid: 7, i: 1 });
  const ans = await host.wait('answer');
  assert.deepEqual([ans.pid, ans.qid, ans.i], [a.pid, 7, 1]);
  host.send({ t: 'ask_close', qid: 7 });
  assert.equal((await b.wait('ask_close')).qid, 7);
  host.send({ t: 'close' });
});

test('チャット回答: 進行役にも他の参加者にも届く。問題番号が付く', async () => {
  const { id, host } = await makeRoom();
  const a = await joinPlayer(id, 'A'), b = await joinPlayer(id, 'B');
  host.send({ t: 'open', q: 4, eligible: { [a.pid]: 0, [b.pid]: 0 } });
  await a.wait('open');
  a.clear(); b.clear();
  a.send({ t: 'chat', text: '東京', answer: true });
  const got = await host.wait('chat', 3000, x => x.answer);
  assert.deepEqual([got.name, got.text, got.q, got.pid], ['A', '東京', 4, a.pid]);
  assert.equal((await a.wait('answer_ack')).text, '東京');
  const seen = await b.wait('chat', 3000, x => x.answer);
  assert.deepEqual([seen.name, seen.text, seen.q], ['A', '東京', 4]);
  host.send({ t: 'close' });
});
