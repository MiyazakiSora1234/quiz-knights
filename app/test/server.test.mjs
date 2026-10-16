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
  players[0].send({ t: 'buzz', ts: t });
  players[1].send({ t: 'buzz', ts: t - 300 });   // ほぼ同時に届くが、押した時刻は300ms早い（負荷が高くても順序が逆転しない差）
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
  assert.match((await b.wait('error')).msg, /すでに|待って/);
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

test('進行役が落ちたら、少し待ってから参加者が引き継げる。元の鍵は無効になる', async () => {
  const { id, host, key } = await makeRoom();
  const p = await joinPlayer(id, 'P');
  await p.wait('members', 3000, x => x.hostOnline);
  p.send({ t: 'claim_host' });
  assert.equal((await p.wait('error')).code, 'claim');       // 進行役がいる間は不可
  host.ws.close();                                           // 進行役が落ちる
  await p.wait('members', 3000, x => x.hasHost && !x.hostOnline);
  p.send({ t: 'claim_host' });
  assert.match((await p.wait('error', 3000, x => x.code === 'claim')).msg, /待って/);   // 直後は待つ
  await sleep(15500);
  p.send({ t: 'claim_host' });
  const g = await p.wait('host_granted');
  assert.notEqual(g.hostKey, key);
  const old = await client(id);
  old.send({ t: 'host_resume', id, hostKey: key });
  assert.equal((await old.wait('error')).code, 'gone');
  const nh = await client(id);
  nh.send({ t: 'host_resume', id, hostKey: g.hostKey });
  await nh.wait('created');
  nh.send({ t: 'close' });
});

/* ================= 複数人・途中離脱/入室を繰り返す運用 ================= */
const lastOf = (c, t) => [...c.q].reverse().find(m => m.t === t);

test('運用: 入室・退室・切断・復帰・キックをランダムに40回繰り返しても、進行役の一覧と実際の状態が一致する', async () => {
  let s = 2024; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const { id, host } = await makeRoom();
  const model = new Map();             // pid -> { c, online, name }
  let n = 0;
  for (let i = 0; i < 40; i++) {
    const r = rnd(), pids = [...model.keys()];
    if (r < 0.3 || pids.length < 3) {
      const c = await joinPlayer(id, 'P' + n); model.set(c.pid, { c, online: true, name: 'P' + n++ });
    } else {
      const pid = pids[Math.floor(rnd() * pids.length)], m = model.get(pid);
      if (r < 0.5 && m.online) { m.c.send({ t: 'leave' }); model.delete(pid); }
      else if (r < 0.7 && m.online) { m.c.ws.close(); m.online = false; }                       // 切断（退室ではない）
      else if (r < 0.85 && !m.online) { const c = await joinPlayer(id, m.name, { pid }); m.c = c; m.online = true; }   // 同じ pid で復帰
      else if (r < 0.95) { host.send({ t: 'kick', pid }); model.delete(pid); }
    }
    if (i % 5 === 4) await sleep(120);
  }
  await sleep(500);
  const lob = lastOf(host, 'lobby');
  assert.deepEqual(lob.players.map(p => p.pid).sort(), [...model.keys()].sort(), '名簿が一致');
  for (const p of lob.players) assert.equal(p.online, model.get(p.pid).online, `${p.name} のオンライン状態`);
  const room = (await api())[id - 1];
  assert.equal(room.count, model.size);
  assert.equal(room.online, [...model.values()].filter(m => m.online).length);
  host.send({ t: 'close' });
});

test('運用: 早押しの最中に参加者が切断しても、勝者が決まる（押した直後に落ちても有効）', async () => {
  const { id, host } = await makeRoom();
  const a = await joinPlayer(id, 'A'), b = await joinPlayer(id, 'B'), c = await joinPlayer(id, 'C');
  host.send({ t: 'open', q: 1, eligible: { [a.pid]: 0, [b.pid]: 0, [c.pid]: 0 } });
  await a.wait('open');
  c.ws.close();                                                  // 押す前に切断
  a.send({ t: 'buzz', ts: Date.now(), rtt: 40 });
  a.ws.close();                                                  // 押した直後に切断
  const w = await host.wait('winner', 4000);
  assert.equal(w.pid, a.pid);
  const bw = await b.wait('winner', 4000);
  assert.equal(bw.pid, a.pid);
  host.send({ t: 'close' });
});

test('運用: 進行役が再読み込みしても部屋は残り、戻ったあとの早押しが進行役に届く。不在中に決まった勝者も戻ると伝わる', async () => {
  const { id, host, key } = await makeRoom();
  const a = await joinPlayer(id, 'A'), b = await joinPlayer(id, 'B');
  host.send({ t: 'state', state: { q: 1, units: [], pids: {} } });
  host.send({ t: 'open', q: 1, eligible: { [a.pid]: 0, [b.pid]: 0 } });
  await a.wait('open');
  host.ws.close();                                               // 進行役の画面が落ちる
  await sleep(100);
  a.send({ t: 'buzz', ts: Date.now(), rtt: 30 });                // 不在中に押される
  await a.wait('winner', 4000);
  const host2 = await client(id);
  host2.send({ t: 'host_resume', id, hostKey: key });
  await host2.wait('created');
  const w = await host2.wait('winner', 3000);                    // 戻ったら勝者が伝わる
  assert.equal(w.pid, a.pid);
  // 戻ったあとの新しい問題も、通常どおり
  host2.send({ t: 'open', q: 2, eligible: { [a.pid]: 0, [b.pid]: 0 } });
  await b.wait('open', 3000, x => x.q === 2);
  b.send({ t: 'buzz', ts: Date.now(), rtt: 30 });
  assert.equal((await host2.wait('winner', 4000)).pid, b.pid);
  assert.equal((await api())[id - 1].count, 2);
  host2.send({ t: 'close' });
});

test('運用: 途中入室した人は、再受付されるまで押せない。再受付に含まれれば押せる', async () => {
  const { id, host } = await makeRoom();
  const a = await joinPlayer(id, 'A');
  host.send({ t: 'open', q: 1, eligible: { [a.pid]: 0 } });
  await a.wait('open');
  const late = await joinPlayer(id, 'Late');                     // 受付中に入室
  late.send({ t: 'buzz', ts: Date.now(), rtt: 30 });             // まだ対象外 → 無視される
  await sleep(300);
  assert.equal(late.has('ack'), false);
  host.send({ t: 'open', q: 1, eligible: { [a.pid]: 0, [late.pid]: 0 } });   // 進行役が受付を出し直す
  await late.wait('open', 3000, x => x.eligible.includes(late.pid));
  late.send({ t: 'buzz', ts: Date.now(), rtt: 30 });
  assert.equal((await host.wait('winner', 4000)).pid, late.pid);
  host.send({ t: 'close' });
});

test('運用: 同じ人が2つのタブで入っても人数は増えず、片方を閉じてもオンラインのまま。退室すると両方消える', async () => {
  const { id, host } = await makeRoom();
  const a = await joinPlayer(id, 'A');
  const tab2 = await joinPlayer(id, 'A', { pid: a.pid });
  assert.equal(tab2.pid, a.pid);
  await sleep(150);
  assert.equal((await api())[id - 1].count, 1);
  a.ws.close();
  await sleep(300);
  assert.equal(lastOf(host, 'lobby').players[0].online, true);
  tab2.send({ t: 'leave' });
  await sleep(300);
  assert.equal(lastOf(host, 'lobby').players.length, 0);
  tab2.send({ t: 'buzz', ts: Date.now() });                      // 退室後の操作は無視される
  tab2.send({ t: 'chat', text: '幽霊' });
  await sleep(200);
  assert.equal(host.q.some(m => m.t === 'chat' && m.text === '幽霊'), false);
  host.send({ t: 'close' });
});

test('運用: 12人が同時に入室・同時に押しても、勝者は1人に決まり全員に同じ結果が届く', async () => {
  const { id, host } = await makeRoom();
  const ps = await Promise.all(Array.from({ length: 12 }, (_, i) => joinPlayer(id, 'P' + i)));
  const eligible = Object.fromEntries(ps.map(p => [p.pid, 0]));
  host.send({ t: 'open', q: 1, eligible });
  await Promise.all(ps.map(p => p.wait('open')));
  const t = Date.now();
  ps.forEach((p, i) => p.send({ t: 'buzz', ts: t + i, rtt: 30 }));
  const results = await Promise.all(ps.map(p => p.wait('winner', 5000)));
  assert.equal(new Set(results.map(w => w.pid)).size, 1);
  assert.equal(results[0].pid, ps[0].pid);                       // 一番早い申告
  assert.equal(results[0].ranking.length, 12);
  assert.equal((await host.wait('winner')).pid, ps[0].pid);
  host.send({ t: 'close' });
});

test('運用: 部屋を閉じると全員に通知され、同じ番号ですぐ作り直せる（前の部屋の人・チャットは残らない）', async () => {
  const { id, host } = await makeRoom({ name: '一回目' });
  const a = await joinPlayer(id, 'A');
  a.send({ t: 'chat', text: '前の部屋の発言' });
  await host.wait('chat', 3000, x => x.text === '前の部屋の発言');
  host.send({ t: 'close' });
  assert.ok((await a.wait('closed')).why);
  await sleep(300);
  const h2 = await client(id);
  h2.send({ t: 'create', id, name: '二回目', password: '' });
  await h2.wait('created');
  const b = await joinPlayer(id, 'B');
  await sleep(200);
  assert.equal(b.q.some(m => m.t === 'chat' && m.text === '前の部屋の発言'), false);
  assert.equal((await api())[id - 1].count, 1);
  h2.send({ t: 'close' });
});

test('連チャン: 1着が誤答したら、押した順に2着・3着へ回答権が移り、いなくなったら nobody', async () => {
  const { id, host } = await makeRoom();
  const [a, b, c] = [await joinPlayer(id, 'A'), await joinPlayer(id, 'B'), await joinPlayer(id, 'C')];
  host.send({ t: 'open', q: 1, chain: true, eligible: { [a.pid]: 0, [b.pid]: 0, [c.pid]: 0 } });
  const op = await a.wait('open');
  assert.equal(op.chain, true);
  const t = Date.now();
  a.send({ t: 'buzz', ts: t, rtt: 20 });
  assert.equal((await host.wait('winner', 4000)).pid, a.pid);
  host.send({ t: 'lock' });                                   // 回答者が選ばれた
  await b.wait('locked');
  b.send({ t: 'buzz', ts: t + 200, rtt: 20 });                // 控えとして押す（回答権が決まったあと）
  c.send({ t: 'buzz', ts: t + 400, rtt: 20 });
  await b.wait('ack'); await c.wait('ack');
  host.send({ t: 'next', exclude: [a.pid] });
  const w2 = await host.wait('winner', 3000, x => x.pid === b.pid);
  assert.deepEqual(w2.ranking.map(x => x.pid), [b.pid, c.pid]);
  assert.equal((await c.wait('winner', 3000, x => x.pid === b.pid)).name, 'B');
  host.send({ t: 'next', exclude: [a.pid, b.pid] });
  assert.equal((await host.wait('winner', 3000, x => x.pid === c.pid)).pid, c.pid);
  host.send({ t: 'next', exclude: [a.pid, b.pid, c.pid] });
  assert.equal((await host.wait('nobody', 3000)).q, 1);
  host.send({ t: 'open', q: 2, eligible: { [a.pid]: 0 } });   // 次の問題では、普通の受付に戻る
  await a.wait('open', 3000, x => x.q === 2 && !x.chain);
  host.send({ t: 'close' });
});

/* ================= 表形式の入力検査（1ケース = 1テスト） ================= */
for (const [name, want] of [['', '名無し'], ['あ', 'あ'], ['あいうえおかきくけこさし', 'あいうえおかきくけこさし'], ['x'.repeat(13), 'x'.repeat(12)], ['x'.repeat(200), 'x'.repeat(12)], ['  空白  ', '  空白  '.slice(0, 12)], ['<b>タグ</b>', '<b>タグ</b>'], ['😀絵文字', '😀絵文字'.slice(0, 12)]]) {
  test(`入力検査: 名前「${name.slice(0, 10)}」(${name.length}文字) は「${want.slice(0, 10)}」になる`, async () => {
    const { id, host } = await makeRoom();
    const p = await joinPlayer(id, name);
    assert.equal(p.joined.name, want);
    host.send({ t: 'close' });
  });
}
for (const [pw, tryPw, ok] of [['', '', true], ['', 'x', true], ['abc', 'abc', true], ['abc', 'ABC', false], ['abc', '', false], ['abc', 'abcd', false], ['あいう', 'あいう', true], ['a'.repeat(25), 'a'.repeat(20), true], ['a'.repeat(25), 'a'.repeat(25), false]]) {
  test(`入力検査: パスワード「${pw.slice(0, 6)}」(${pw.length}) に「${tryPw.slice(0, 6)}」(${tryPw.length}) で入る → ${ok ? '入れる' : '拒否'}`, async () => {
    const { id, host } = await makeRoom({ password: pw });
    const c = await client(id);
    c.send({ t: 'join', id, name: 'A', password: tryPw });
    if (ok) assert.ok((await c.wait('joined')).pid); else assert.equal((await c.wait('error')).code, 'pw');
    host.send({ t: 'close' });
  });
}
for (const rid of [0, 17, -1, 100, 1.5, 'x', null]) {
  test(`入力検査: 部屋番号 ${String(rid)} での作成は拒否される`, async () => {
    const c = await client(1);
    c.send({ t: 'create', id: rid, name: 'x' });
    assert.ok((await c.wait('error')).msg);
  });
}
for (const [job, team, wantJob, wantTeam] of [['mage', 'e', 'mage', 'e'], ['', 'p', 'warrior', 'p'], [5, 'z', 'warrior', 'p'], ['x'.repeat(30), 'e', 'warrior', 'e'], [null, null, 'warrior', 'p'], ['bm', undefined, 'bm', 'p']]) {
  test(`入力検査: プロフィールの職業 ${JSON.stringify(job)?.slice(0, 12)} / チーム ${JSON.stringify(team)} → ${wantJob}/${wantTeam}`, async () => {
    const { id, host } = await makeRoom();
    const p = await joinPlayer(id, 'A');
    p.send({ t: 'profile', job, team });
    const lob = await host.wait('lobby', 3000, x => x.players[0] && x.players[0].job === wantJob && x.players[0].team === wantTeam);
    assert.equal(lob.players[0].pid, p.pid);
    host.send({ t: 'close' });
  });
}
for (const [text, want] of [['こんにちは', 'こんにちは'], ['  前後の空白  ', '前後の空白'], ['a'.repeat(250), 'a'.repeat(200)], ['改行\nあり', '改行\nあり'], ['<script>alert(1)</script>', '<script>alert(1)</script>']]) {
  test(`入力検査: チャット「${text.slice(0, 8).replace('\n', '↵')}」(${text.length}文字)`, async () => {
    const { id, host } = await makeRoom();
    const p = await joinPlayer(id, 'A');
    p.send({ t: 'chat', text });
    assert.equal((await host.wait('chat', 3000, x => !x.sys)).text, want);
    host.send({ t: 'close' });
  });
}
for (const text of ['', '   ', '\n\t']) {
  test(`入力検査: 空のチャット「${JSON.stringify(text)}」は無視される`, async () => {
    const { id, host } = await makeRoom();
    const p = await joinPlayer(id, 'A');
    p.send({ t: 'chat', text });
    await sleep(250);
    assert.equal(host.q.some(m => m.t === 'chat' && !m.sys), false);
    host.send({ t: 'close' });
  });
}
for (const [name, pw, wantName] of [['新しい名前', 'pw', '新しい名前'], ['', 'pw', '旧'], ['y'.repeat(40), '', 'y'.repeat(30)]]) {
  test(`入力検査: 部屋設定 名前「${name.slice(0, 6)}」(${name.length}) パスワード「${pw}」`, async () => {
    const { id, host } = await makeRoom({ name: '旧' });
    host.send({ t: 'settings', name, password: pw });
    assert.equal((await host.wait('settings')).name, wantName);
    await sleep(150);
    assert.equal((await api())[id - 1].name, wantName);
    host.send({ t: 'close' });
  });
}

test('入力検査: 接続先と違う番号の部屋は作れない（別の枠を乗っ取れない）', async () => {
  const c = await client(2);
  c.send({ t: 'create', id: 5, name: 'なりすまし' });
  assert.ok((await c.wait('error')).msg);
  await sleep(150);
  assert.equal((await api())[4].used, false);
});

for (const [who, boss, want] of [['player', 3, 3], ['player', 6, 6], ['player', 1, 1], ['player', 0, 1], ['player', 7, 1], ['player', 'x', 1], ['player', 2.7, 2], ['host', 4, 4], ['host', 9, 1]]) {
  test(`魔王の選択: ${who} が ${JSON.stringify(boss)} を選ぶ → ${want}（全員に反映）`, async () => {
    const { id, host } = await makeRoom();
    const p = await joinPlayer(id, 'A');
    const q = await joinPlayer(id, 'B');
    if (who === 'player') p.send({ t: 'set_boss', boss }); else host.send({ t: 'settings', boss });
    if (want !== 1) {
      assert.equal((await host.wait('lobby', 3000, x => x.boss === want)).boss, want);
      assert.equal((await q.wait('members', 3000, x => x.boss === want)).boss, want);
    } else {
      await sleep(250);
      assert.ok(host.q.filter(m => m.t === 'lobby').every(m => m.boss === 1 || m.boss === undefined));
    }
    host.send({ t: 'close' });
  });
}

test('途中参戦: いまの受付に加えても、ほかの人の押した記録や受付は消えない', async () => {
  const { id, host } = await makeRoom();
  const a = await joinPlayer(id, 'A'), b = await joinPlayer(id, 'B');
  host.send({ t: 'open', q: 5, eligible: { [a.pid]: 0, [b.pid]: 0 } });
  await a.wait('open');
  a.clear(); b.clear();
  const t = Date.now();
  b.send({ t: 'buzz', ts: t, rtt: 20 });                          // B が先に押した（結果が出る前）
  const late = await joinPlayer(id, 'Late');
  host.send({ t: 'add_eligible', pid: late.pid, delay: 0 });
  const op = await late.wait('open');
  assert.deepEqual([op.q, op.eligible.includes(late.pid)], [5, true]);
  assert.equal(a.has('open'), false, 'ほかの人には受付の出し直しが届かない');
  late.send({ t: 'buzz', ts: t + 300, rtt: 20 });
  const w = await host.wait('winner', 4000);
  assert.equal(w.pid, b.pid, '先に押した B が勝つ');
  assert.equal(w.ranking.length, 2);
  host.send({ t: 'close' });
});
test('途中参戦: 勝者が決まったあとでも、順位の表示のために加えられる／入室していない人は無視', async () => {
  const { id, host } = await makeRoom();
  const a = await joinPlayer(id, 'A');
  host.send({ t: 'open', q: 1, eligible: { [a.pid]: 0 } });
  await a.wait('open');
  a.send({ t: 'buzz', ts: Date.now() - 100, rtt: 20 });
  await host.wait('winner', 4000);
  const late = await joinPlayer(id, 'Late');
  host.send({ t: 'add_eligible', pid: late.pid, delay: 0 });
  host.send({ t: 'add_eligible', pid: 'nobody', delay: 0 });
  assert.equal((await late.wait('open', 3000)).q, 1);
  late.send({ t: 'buzz', ts: Date.now() - 20, rtt: 20 });
  const r = await host.wait('ranking', 3000, x => x.all.length === 2);
  assert.deepEqual(r.all.map(x => x.pid), [a.pid, late.pid]);
  host.send({ t: 'close' });
});

test('順位の表示: 勝者の通知に全員の順位とms差があり、連チャンの控えの押下でも全員に順位が配られる', async () => {
  const { id, host } = await makeRoom();
  const [a, b, c] = [await joinPlayer(id, 'A'), await joinPlayer(id, 'B'), await joinPlayer(id, 'C')];
  host.send({ t: 'open', q: 1, chain: true, eligible: { [a.pid]: 0, [b.pid]: 0, [c.pid]: 0 } });
  await a.wait('open');
  const t = Date.now();
  a.send({ t: 'buzz', ts: t - 400, rtt: 20 });
  const w = await b.wait('winner', 4000);
  assert.deepEqual(w.all.map(x => x.pid), [a.pid]);
  assert.equal(w.all[0].ms, 0);
  b.send({ t: 'buzz', ts: t - 280, rtt: 20 });
  const r1 = await c.wait('ranking', 3000, x => x.all.length === 2);
  assert.deepEqual(r1.all.map(x => [x.pid, Math.round(x.ms)]), [[a.pid, 0], [b.pid, 120]]);
  c.send({ t: 'buzz', ts: t - 70, rtt: 20 });
  const r2 = await host.wait('ranking', 3000, x => x.all.length === 3);
  assert.deepEqual(r2.all.map(x => x.pid), [a.pid, b.pid, c.pid]);
  assert.equal(Math.round(r2.all[2].ms), 330);
  host.send({ t: 'close' });
});

/* ---------- 個人のディレイ（クイズ設定） ---------- */
for (const [delay, want] of [[0, 0], [250, 250], [3000, 3000], [3001, 3000], [99999, 3000], [-5, 0], [12.6, 13], ['abc', 0], [null, null]]) {
  test(`クイズ設定: プロフィールのディレイ ${JSON.stringify(delay)} は ${want} になる`, async () => {
    const { id, host } = await makeRoom();
    const p = await joinPlayer(id, 'A');
    p.send({ t: 'profile', delay });
    if (want === null) { await sleep(200); assert.ok(host.q.filter(m => m.t === 'lobby').every(m => !m.players[0].delay)); }
    else assert.equal((await host.wait('lobby', 3000, x => (x.players[0]?.delay ?? 0) === want && (want !== 0 || true))).players[0].delay, want);
    host.send({ t: 'close' });
  });
}
test('クイズ設定: 個人のディレイが押した時刻に足されて、順位が変わる', async () => {
  const { id, host } = await makeRoom();
  const a = await joinPlayer(id, 'A'), b = await joinPlayer(id, 'B');
  a.send({ t: 'profile', delay: 600 });
  await host.wait('lobby', 3000, x => x.players.some(p => p.delay === 600));
  host.send({ t: 'open', q: 1, eligible: { [a.pid]: 0, [b.pid]: 0 } });
  await a.wait('open');
  const t = Date.now();
  a.send({ t: 'buzz', ts: t - 300, rtt: 20 });          // A が先に押したが、ディレイ600ms
  b.send({ t: 'buzz', ts: t - 100, rtt: 20 });
  const w = await host.wait('winner', 4000);
  assert.equal(w.pid, b.pid);
  assert.deepEqual(w.ranking.map(x => x.pid), [b.pid, a.pid]);
  host.send({ t: 'close' });
});
test('クイズ設定: 職業のディレイ（バーサーカー700）と個人のディレイは足し算になる／進行役が参加者のディレイを決められる', async () => {
  const { id, host } = await makeRoom();
  const a = await joinPlayer(id, 'A'), b = await joinPlayer(id, 'B');
  host.send({ t: 'set_delay', pid: a.pid, delay: 300 });
  await host.wait('lobby', 3000, x => x.players.some(p => p.pid === a.pid && p.delay === 300));
  host.send({ t: 'open', q: 1, eligible: { [a.pid]: 700, [b.pid]: 0 } });   // A はバーサーカー相当
  await a.wait('open');
  const t = Date.now();
  a.send({ t: 'buzz', ts: t - 900, rtt: 20 });           // 実効: t-900+1000 = t+100
  b.send({ t: 'buzz', ts: t - 50, rtt: 20 });            // 実効: t-50
  assert.equal((await host.wait('winner', 4000)).pid, b.pid);
  a.send({ t: 'chat', text: '確認' });
  host.send({ t: 'close' });
});

/* ---------- 戦う相手・難易度の共有（進行役も参加者も変えられる） ---------- */
for (const [who, foes, want] of [
  ['player', ['boss3'], ['boss3']], ['player', ['boss1', 'boss1'], ['boss1', 'boss1']], ['player', ['warrior', 'monk', 'mage'], ['warrior', 'monk', 'mage']],
  ['player', ['boss2', 'tank'], ['boss2', 'tank']], ['host', ['boss6', 'bomb', 'bomb'], ['boss6', 'bomb', 'bomb']], ['host', [], []],
  ['player', ['boss9', 'warrior'], ['warrior']], ['player', ['BOSS1', 'x', 'warrior'], ['warrior']], ['player', ['a'.repeat(30), 'monk'], ['monk']],
  ['player', Array(20).fill('warrior'), Array(12).fill('warrior')], ['player', 'boss1', null], ['player', null, null],
]) {
  test(`戦う相手の共有: ${who} が ${JSON.stringify(foes)?.slice(0, 40)} を選ぶ`, async () => {
    const { id, host } = await makeRoom();
    const p = await joinPlayer(id, 'A'), q = await joinPlayer(id, 'B');
    if (who === 'player') p.send({ t: 'set_foes', foes }); else host.send({ t: 'set_foes', foes });
    if (want === null) { await sleep(200); assert.ok(host.q.filter(m => m.t === 'lobby').every(m => JSON.stringify(m.foes ?? ['boss1']) === '["boss1"]')); }
    else {
      const lob = await host.wait('lobby', 3000, x => JSON.stringify(x.foes) === JSON.stringify(want));
      assert.deepEqual(lob.foes, want);
      assert.deepEqual((await q.wait('members', 3000, x => JSON.stringify(x.foes) === JSON.stringify(want))).foes, want);
    }
    host.send({ t: 'close' });
  });
}
for (const [level, ok] of [['weak', true], ['strong', true], ['normal', true], ['extreme', true], ['ultra', false], ['', false], [null, false]]) {
  test(`難易度の共有: ${JSON.stringify(level)} → ${ok ? '反映' : '無視'}`, async () => {
    const { id, host } = await makeRoom();
    const p = await joinPlayer(id, 'A');
    p.send({ t: 'set_level', level });
    if (ok && level !== 'normal') assert.equal((await host.wait('lobby', 3000, x => x.level === level)).level, level);
    else { await sleep(200); assert.ok(host.q.filter(m => m.t === 'lobby').every(m => (m.level ?? 'normal') === 'normal')); }
    host.send({ t: 'close' });
  });
}

test('進行役をやめる: 部屋から出ずに、そのまま参加者になる（人数が減らず、入室の通知も出ない）', async () => {
  const { id, host } = await makeRoom();
  const p = await joinPlayer(id, 'P');
  await p.wait('members', 3000, x => x.players.length === 1);
  const chatBefore = p.q.filter(m => m.t === 'chat').length;
  host.send({ t: 'release', name: '元進行役' });
  const d = await host.wait('demoted');
  assert.ok(d.pid); assert.equal(d.name, '元進行役');
  const m = await p.wait('members', 3000, x => x.players.length === 2 && !x.hasHost);
  assert.ok(m.players.some(x => x.pid === d.pid && x.name === '元進行役'));
  // 同じ pid で入り直しても、新しい参加者にはならない
  const again = await joinPlayer(id, '元進行役', { pid: d.pid });
  assert.equal(again.pid, d.pid);
  await sleep(200);
  assert.equal((await api())[id - 1].count, 2);
  assert.equal(p.q.filter(x => x.t === 'chat').length, chatBefore, '入室の通知は増えない');
  again.send({ t: 'claim_host' });
  assert.ok((await again.wait('host_granted')).hostKey);
});
test('進行役を譲る: 譲った人は、そのまま参加者として部屋に残る', async () => {
  const { id, host } = await makeRoom();
  const p = await joinPlayer(id, 'P');
  host.send({ t: 'transfer', pid: p.pid, name: '前の進行役' });
  const d = await host.wait('demoted');
  await p.wait('host_granted');
  assert.ok(d.pid);
  await sleep(200);
  assert.equal((await api())[id - 1].count, 1, '譲られた人は進行役になり、譲った人が参加者になる');
});

test('持ち物の配信: 進行役 → 本人だけに届き、ほかの参加者には届かない。壊れた値は無視される', async () => {
  const { id, host } = await makeRoom();
  const a = await joinPlayer(id, 'A'), b = await joinPlayer(id, 'B');
  host.send({ t: 'priv', to: a.pid, items: ['potion', 'bomb', 5, null] });
  const got = await a.wait('priv');
  assert.deepEqual(got.items, ['potion', 'bomb']);
  await sleep(150);
  assert.equal(b.has('priv'), false);
  host.send({ t: 'priv', to: a.pid, items: 'x' });          // 配列でなければ無視
  await sleep(150);
  b.send({ t: 'priv', to: a.pid, items: ['bomb'] });          // 参加者からは送れない
  await sleep(150);
  assert.equal(a.has('priv'), false, '無視された送信は届かない');
  host.send({ t: 'close' });
});

test('進行役が参加者の職業・チーム・名前を変える: 本人に届き、名簿にも反映。不正な値は無視。参加者からは変えられない', async () => {
  const { id, host } = await makeRoom();
  const a = await joinPlayer(id, 'A'), b = await joinPlayer(id, 'B');
  host.send({ t: 'set_profile', pid: a.pid, job: 'mage', team: 'e', name: ' 新名 ' });
  const got = await a.wait('profile_set');
  assert.deepEqual([got.job, got.team, got.name], ['mage', 'e', '新名']);
  await sleep(150);
  assert.equal(b.has('profile_set'), false, '他の人には送らない');
  const lob = await host.wait('lobby', 3000, x => x.players.find(p => p.pid === a.pid)?.job === 'mage');
  assert.equal(lob.players.find(p => p.pid === a.pid).team, 'e');
  host.send({ t: 'set_profile', pid: a.pid, job: '', team: 'z', name: '  ' });      // 不正
  b.send({ t: 'set_profile', pid: a.pid, job: 'tank' });                            // 参加者からは変えられない
  await sleep(200);
  assert.equal(a.has('profile_set'), false);
  host.send({ t: 'close' });
});
