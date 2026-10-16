// QUIZ KNIGHTS - Cloudflare Workers 版サーバー（入口）
//  - 静的ファイル（dist/）は Workers Assets が配信（無制限・無料）
//  - GET  /api/rooms : 部屋一覧（Lobby Durable Object）
//  - WS   /ws?id=N   : 部屋 N の Durable Object（早押しの時計を1か所に集約）
//  - ゲーム処理は進行役のブラウザ側。サーバーは「部屋」「状態の中継」「早押し判定」だけを担当する。
//
//  server/config.js  設定値        server/buzz.js   早押しの判定（純粋なクラス）
//  server/lobby.js   部屋一覧      server/room.js   部屋（WebSocket・参加者・配信）
import { SLOTS } from './config.js';
import { lobbyStub } from './lobby.js';

export { Room } from './room.js';
export { Lobby } from './lobby.js';

/** 部屋一覧: 1〜SLOTS番の全ての枠を、空き・使用中どちらでも返す */
async function listRooms(env) {
  const map = await lobbyStub(env).list();
  return Array.from({ length: SLOTS }, (_, i) => {
    const r = map[i + 1];
    return { id: i + 1, used: !!r, name: r?.name || '', count: r?.count || 0, online: r?.online || 0, hasPw: !!r?.hasPw, started: !!r?.started, hasHost: r ? r.hasHost !== false : false };
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/rooms') return Response.json(await listRooms(env), { headers: { 'Cache-Control': 'no-store' } });
    if (url.pathname === '/ws') {
      const id = +url.searchParams.get('id');
      if (!(id >= 1 && id <= SLOTS)) return new Response('bad id', { status: 400 });
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
      return env.ROOM.get(env.ROOM.idFromName(String(id))).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
