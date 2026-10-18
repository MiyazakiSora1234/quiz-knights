// QUIZ KNIGHTS - Cloudflare Workers 版サーバー（入口）
//  - 静的ファイル（dist/）は Workers Assets が配信（無制限・無料）
//  - GET  /api/rooms : 部屋一覧（Lobby Durable Object）
//  - WS   /ws?id=N   : 部屋 N の Durable Object（早押しの時計を1か所に集約）
//  - ゲーム処理は進行役のブラウザ側。サーバーは「部屋」「状態の中継」「早押し判定」だけを担当する。
//
//  server/config.js  設定値        server/buzz.js   早押しの判定（純粋なクラス）
//  server/lobby.js   部屋一覧      server/room.js   部屋（WebSocket・参加者・配信）
//  server/safe.js    入力の掃除・回数制限などの道具
//
//  入口でも、荒らしを止める: 別のサイトからの WebSocket は断る。同じ接続元からの短時間の大量アクセスは、Durable Object に届く前に断る
//  （Durable Object への問い合わせは、無料枠では1日10万回までなので、無駄に使わせない）
import { SLOTS, EDGE_WS_LIMIT, EDGE_LIST_LIMIT, LIST_CACHE_MS } from './config.js';
import { lobbyStub } from './lobby.js';
import { WindowLimiter, sameOrigin } from './safe.js';

export { Room } from './room.js';
export { Lobby } from './lobby.js';

const wsLimiter = new WindowLimiter(EDGE_WS_LIMIT.limit, EDGE_WS_LIMIT.windowMs);
const listLimiter = new WindowLimiter(EDGE_LIST_LIMIT.limit, EDGE_LIST_LIMIT.windowMs);
let listMemo = null;       // { at, body } 部屋一覧の使い回し（この Worker の中だけ）

/** 部屋一覧: 1〜SLOTS番の全ての枠を、空き・使用中どちらでも返す */
async function listRooms(env) {
  const map = await lobbyStub(env).list();
  return Array.from({ length: SLOTS }, (_, i) => {
    const r = map[i + 1];
    return { id: i + 1, used: !!r, name: r?.name || '', count: r?.count || 0, online: r?.online || 0, hasPw: !!r?.hasPw, started: !!r?.started, hasHost: r ? r.hasHost !== false : false };
  });
}

const tooMany = () => new Response('too many requests', { status: 429, headers: { 'Retry-After': '10', 'Cache-Control': 'no-store' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ip = request.headers.get('CF-Connecting-IP') || '';
    if (url.pathname === '/api/rooms') {
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
      if (ip && !listLimiter.hit(ip)) return tooMany();
      const ttl = Number(env.LIST_CACHE_MS ?? LIST_CACHE_MS);
      const now = Date.now();
      if (!(listMemo && ttl > 0 && now - listMemo.at < ttl)) listMemo = { at: now, body: JSON.stringify(await listRooms(env)) };
      return new Response(listMemo.body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (url.pathname === '/ws') {
      const id = +url.searchParams.get('id');
      if (!(id >= 1 && id <= SLOTS)) return new Response('bad id', { status: 400 });
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
      if (!sameOrigin(request, url)) return new Response('forbidden origin', { status: 403 });
      if (ip && !wsLimiter.hit(ip)) return tooMany();
      return env.ROOM.get(env.ROOM.idFromName(String(id))).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
