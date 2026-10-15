// 進行役 → サーバー → 参加者へ送る内容を作る純粋な関数（画面に依存しないのでテストできる）
import { BERSERKER_DELAY_MS, jobName, statusTags } from './engine.js';

/** 参加者の画面に表示する状態。秘密の情報（地雷）は含めない */
export function publicState(G) {
  return {
    mode: G.mode, cpu: !!G.cpu, q: G.q, over: G.over, pids: G.pids, sel: G.sel,
    genre: (G.genre && G.genreFor === G.q) ? `ジャンル：${G.genre}` : '',
    units: G.units.map(u => ({
      id: u.id, name: u.name, job: u.job, jobName: jobName(u), bossId: u.bossId, side: u.side, hp: u.hp, maxHp: u.maxHp,
      alive: u.alive, ghost: !!u.ghost, restNow: u.restNow, guards: u.guards, isBoss: u.isBoss, atk: u.atk,
      st: statusTags(u, false, G.q),
    })),
    log: G.log.slice(0, 14).map(l => l.m),
    stats: G.stats || {},
  };
}

/**
 * 今の問題で押せる人と、そのディレイ(ms)。{ pid: ディレイ }
 * 押せるのは、生きている人か幽霊で、今回休みでない人。バーサーカーと、預言者に狙われた人はディレイがつく。
 */
export function eligibleDelays(G) {
  const out = {};
  for (const [pid, uid] of Object.entries(G.pids || {})) {
    const u = G.units.find(x => x.id === uid);
    if (u && (u.alive || u.ghost) && !u.restNow) out[pid] = (u.job === 'berserker' || u.delayQ === G.q) ? BERSERKER_DELAY_MS : 0;
  }
  return out;
}
