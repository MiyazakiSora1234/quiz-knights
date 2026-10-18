import { DurableObject } from 'cloudflare:workers';
import { MAX_ROOMS_PER_IP, MAX_CREATES_PER_HOUR } from './config.js';

/** 部屋一覧のサマリー（番号 → {name,count,online,hasPw,started}）を保持する。1つだけ存在する */
export class Lobby extends DurableObject {
  async list() { return (await this.ctx.storage.get('rooms')) || {}; }
  async upsert(id, v) { const m = await this.list(); m[id] = v; await this.ctx.storage.put('rooms', m); }
  async remove(id) {
    const m = await this.list(); delete m[id]; await this.ctx.storage.put('rooms', m);
    const o = (await this.ctx.storage.get('owners')) || {};
    if (id in o) { delete o[id]; await this.ctx.storage.put('owners', o); }
  }
  /**
   * 部屋を作ってよいか。同じ接続元（tag）が、部屋をたくさん占領したり、短い間に作り続けたりするのを止める。
   * 作ってよければ、持ち主として記録して true。tag が空（接続元が分からない）なら、制限しない
   */
  async reserve(tag, id) {
    if (!tag) return true;
    const now = Date.now();
    const rooms = await this.list();
    const owners = (await this.ctx.storage.get('owners')) || {};
    for (const k of Object.keys(owners)) if (!(k in rooms) && k !== String(id)) delete owners[k];      // 閉じた部屋の持ち主は忘れる
    const active = Object.entries(owners).filter(([k, t]) => t === tag && k !== String(id)).length;
    const times = ((await this.ctx.storage.get('creates')) || {});
    const recent = (times[tag] || []).filter(t => now - t < 3600e3);
    if (active >= MAX_ROOMS_PER_IP || recent.length >= MAX_CREATES_PER_HOUR) return false;
    owners[id] = tag; recent.push(now); times[tag] = recent;
    for (const k of Object.keys(times)) if (!times[k].some(t => now - t < 3600e3)) delete times[k];
    await this.ctx.storage.put('owners', owners);
    await this.ctx.storage.put('creates', times);
    return true;
  }
}

export const lobbyStub = env => env.LOBBY.get(env.LOBBY.idFromName('main'));
