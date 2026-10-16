// 通信部品 Conn のテスト: 偽の WebSocket と偽の時計で、時計ずれの補正・再接続・送信を確かめる
import test from 'node:test';
import assert from 'node:assert/strict';
import { Conn, wsUrl } from '../src/lib/net.js';

class FakeWS {
  static all = [];
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeWS.all.push(this); }
  send(s) { this.sent.push(JSON.parse(s)); }
  close() { this.readyState = 3; this.onclose?.({ code: 1000, reason: '' }); }
  open() { this.readyState = 1; this.onopen?.(); }
  recv(m) { this.onmessage?.({ data: JSON.stringify(m) }); }
}
function env() {
  const saved = { WebSocket: globalThis.WebSocket, location: globalThis.location, now: performance.now.bind(performance), st: globalThis.setTimeout, ct: globalThis.clearTimeout, si: globalThis.setInterval, ci: globalThis.clearInterval };
  FakeWS.all = [];
  let t = 1000;
  const timers = [];
  globalThis.WebSocket = FakeWS;
  globalThis.location = { protocol: 'https:', host: 'example.test' };
  performance.now = () => t;
  globalThis.setTimeout = (f, ms = 0) => { const id = timers.length + 1; timers.push({ id, f, at: t + ms, live: true }); return id; };
  globalThis.clearTimeout = id => { const x = timers.find(y => y.id === id); if (x) x.live = false; };
  globalThis.setInterval = (f, ms) => { const id = timers.length + 1; timers.push({ id, f, at: t + ms, every: ms, live: true }); return id; };
  globalThis.clearInterval = globalThis.clearTimeout;
  return {
    advance(ms) {
      const end = t + ms;
      for (;;) {
        const next = timers.filter(x => x.live && x.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        t = next.at; if (next.every) next.at += next.every; else next.live = false;
        next.f();
      }
      t = end;
    },
    get now() { return t; },
    set now(v) { t = v; },
    restore() { Object.assign(globalThis, { WebSocket: saved.WebSocket, setTimeout: saved.st, clearTimeout: saved.ct, setInterval: saved.si, clearInterval: saved.ci }); globalThis.location = saved.location; performance.now = saved.now; },
  };
}

test('[通信] 接続先のURL: https なら wss、http なら ws。部屋番号が付く', () => {
  const e = env();
  try {
    assert.equal(wsUrl(5), 'wss://example.test/ws?id=5');
    globalThis.location = { protocol: 'http:', host: 'localhost:8787' };
    assert.equal(wsUrl(16), 'ws://localhost:8787/ws?id=16');
  } finally { e.restore(); }
});

test('[通信] 接続するとステータスが変わり、最初に時計合わせの ping を16回送る。メッセージは種類ごとに渡る', () => {
  const e = env(); const st = [], msgs = [];
  try {
    const c = new Conn(3, { status: s => st.push(s), message: m => msgs.push(m), open: () => msgs.push({ t: 'OPEN' }) });
    c.connect();
    assert.deepEqual(st, ['connecting']);
    const ws = FakeWS.all[0]; ws.open();
    assert.deepEqual(st, ['connecting', 'open']);
    e.advance(1200);
    assert.equal(ws.sent.filter(m => m.t === 'ping').length, 16);
    ws.recv({ t: 'chat', text: 'こんにちは' });
    ws.recv({ t: 'pong', c: 0, s: 0 });                // pong は部品の中で使い、外へは渡さない
    assert.deepEqual(msgs.map(m => m.t), ['OPEN', 'chat']);
    ws.onmessage({ data: 'これはJSONではない' });        // 壊れたメッセージは無視する
    assert.equal(msgs.length, 2);
    assert.equal(c.send({ t: 'x' }), true);
    c.close();
    assert.equal(c.send({ t: 'x' }), false, '閉じたら送れない');
  } finally { e.restore(); }
});

test('[通信] 時計ずれ: 往復が短いサンプルを採用し、中央値でサーバー時刻に直す。往復が異常に長いものは捨てる', () => {
  const e = env(); const clocks = [];
  try {
    const c = new Conn(1, { clock: k => clocks.push(k) });
    c.connect(); FakeWS.all[0].open();
    // 端末の performance.now = 1000 のとき、サーバー時刻は 51000（ずれ +50000）。往復は 40ms（行き20・帰り20）
    const pong = (sent, rtt, serverAtMid) => { e.now = sent + rtt; c._pong({ c: sent, s: serverAtMid }); };
    for (let i = 0; i < 5; i++) pong(1000 + i * 1000, 40, 51020 + i * 1000);
    assert.equal(Math.round(c.offset), 50000);
    assert.equal(Math.round(c.rtt), 40);
    // 往復の長いサンプル（ずれが大きく見える）は、短いサンプルが5つあれば採用されない
    pong(7000, 300, 57000 + 300 + 250);
    assert.equal(Math.round(c.rtt), 40);
    assert.ok(Math.abs(c.offset - 50000) <= 1, '短い往復のずれを採用');
    // 5000ms 超の往復と、負の往復は無視
    const n = c.samples.length; e.now = 9000; c._pong({ c: 1000, s: 1 }); c._pong({ c: 9500, s: 1 });
    assert.equal(c.samples.length, n);
    // now() / stamp() はずれを足した値
    e.now = 3000;
    assert.equal(Math.round(c.now()), 3000 + Math.round(c.offset));
    assert.equal(Math.round(c.stamp(2500)), 2500 + Math.round(c.offset));
    assert.ok(clocks.length >= 2 && clocks.every(k => typeof k.rtt === 'number' && typeof k.jitter === 'number'));
  } finally { e.restore(); }
});

test('[通信] 往復の遅延を、3サンプル以上たまったら約4秒おきにサーバーへ知らせる', () => {
  const e = env();
  try {
    const c = new Conn(1, {}); c.connect(); const ws = FakeWS.all[0]; ws.open();
    for (let i = 0; i < 6; i++) { e.now = 10000 + i * 100; c._pong({ c: e.now - 60, s: e.now + 30 }); }
    const rtts = ws.sent.filter(m => m.t === 'rtt');
    assert.equal(rtts.length, 1, '4秒以内に何度も送らない');
    assert.equal(rtts[0].rtt, 60);
    e.now = 20000; c._pong({ c: 19940, s: 20030 });
    assert.equal(ws.sent.filter(m => m.t === 'rtt').length, 2);
  } finally { e.restore(); }
});

test('[通信] 切れたら、少しずつ間隔をあけて自動で再接続する。close() したら再接続しない', () => {
  const e = env(); const st = [];
  try {
    const c = new Conn(2, { status: s => st.push(s) });
    c.connect(); FakeWS.all[0].open(); FakeWS.all[0].close();
    assert.equal(st.at(-1), 'reconnecting');
    e.advance(900); assert.equal(FakeWS.all.length, 2, '800ms後に再接続');
    FakeWS.all[1].close(); e.advance(1600); assert.equal(FakeWS.all.length, 3, '次は1500ms後');
    FakeWS.all[2].open(); FakeWS.all[2].close(); e.advance(900); assert.equal(FakeWS.all.length, 4, '繋がったら間隔は元に戻る');
    c.close(); e.advance(10000); assert.equal(FakeWS.all.length, 4, '閉じたあとは再接続しない');
  } finally { e.restore(); }
});
