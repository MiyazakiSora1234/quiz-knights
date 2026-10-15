import { DurableObject } from 'cloudflare:workers';

/** 部屋一覧のサマリー（番号 → {name,count,online,hasPw,started}）を保持する。1つだけ存在する */
export class Lobby extends DurableObject {
  async list() { return (await this.ctx.storage.get('rooms')) || {}; }
  async upsert(id, v) { const m = await this.list(); m[id] = v; await this.ctx.storage.put('rooms', m); }
  async remove(id) { const m = await this.list(); delete m[id]; await this.ctx.storage.put('rooms', m); }
}

export const lobbyStub = env => env.LOBBY.get(env.LOBBY.idFromName('main'));
