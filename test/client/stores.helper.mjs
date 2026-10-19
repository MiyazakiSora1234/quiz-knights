// 画面の状態クラス（PlayStore・HostStore）を、ブラウザなしでテストするための道具。
// Vite でルーン付きの .svelte.js を読み込み、通信・保存領域・時計は偽物に差し替える。
import path from 'node:path';
import { createServer } from 'vite';

export class FakeWS {
  static all = [];
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeWS.all.push(this); }
  send(s) { this.sent.push(JSON.parse(s)); }
  close() { this.readyState = 3; this.onclose?.({ code: 1000, reason: '' }); }
  open() { this.readyState = 1; this.onopen?.(); }
  recv(m) { this.onmessage?.({ data: JSON.stringify(m) }); }
  /** 種類 t で送ったメッセージ */
  of(t) { return this.sent.filter(m => m.t === t); }
}

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear(), _m: m }; };

let server = null, mods = null;
/** 共通の準備（1回だけ）。モジュールと、毎回作り直せる偽の環境を返す */
export async function loadStores() {
  if (mods) return mods;
  server = await createServer({
    configFile: path.join(import.meta.dirname, '../../app/vite.config.js'),
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom', logLevel: 'silent', optimizeDeps: { noDiscovery: true },
  });
  mods = {
    play: await server.ssrLoadModule('/src/lib/stores/play.svelte.js'),
    host: await server.ssrLoadModule('/src/lib/stores/host.svelte.js'),
    ui: await server.ssrLoadModule('/src/lib/stores/ui.svelte.js'),
    titles: await server.ssrLoadModule('/src/lib/stores/titles.svelte.js'),
  };
  return mods;
}
export async function closeStores() { await server?.close(); server = null; mods = null; }

/** 偽の環境（保存領域・WebSocket・location・fetch）を作る。戻り値の restore() で元に戻す */
export function fakeEnv({ rooms = [] } = {}) {
  const saved = { l: globalThis.localStorage, s: globalThis.sessionStorage, ws: globalThis.WebSocket, loc: globalThis.location, f: globalThis.fetch, st: globalThis.setTimeout, nav: globalThis.navigator };
  FakeWS.all = [];
  const local = mem(), sess = mem(), timers = [];
  globalThis.localStorage = local; globalThis.sessionStorage = sess;
  globalThis.WebSocket = FakeWS;
  globalThis.location = { protocol: 'https:', host: 'example.test', href: 'https://example.test/', origin: 'https://example.test' };
  globalThis.fetch = async () => ({ json: async () => rooms });
  // 長い待ち（演出の間・画面の遷移・トーストの消去）は記録して、すぐ実行する。短い待ちは本物
  globalThis.setTimeout = (f, ms = 0, ...a) => { if (ms >= 200) { timers.push({ ms }); return saved.st(f, 0, ...a); } return saved.st(f, ms, ...a); };
  Object.defineProperty(globalThis, 'navigator', { value: { vibrate() {} }, configurable: true });
  return {
    local, sess, timers,
    ws: n => FakeWS.all[n ?? FakeWS.all.length - 1],
    restore() {
      Object.assign(globalThis, { localStorage: saved.l, sessionStorage: saved.s, WebSocket: saved.ws, location: saved.loc, fetch: saved.f, setTimeout: saved.st });
      Object.defineProperty(globalThis, 'navigator', { value: saved.nav, configurable: true });
    },
  };
}
export const tick = (ms = 10) => new Promise(r => setTimeout(r, ms));
