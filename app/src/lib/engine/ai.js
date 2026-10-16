// CPUの頭脳の、画面にも状態にも依存しない部分（盤面の採点）。先読みの本体は battle.js

/** 盤面の良さ（side から見て）: 味方の体力が多く、敵の体力が少ないほど高い。敵の全滅・味方の全滅は決定的 */
export function evaluate(g, side) {
  let v = 0;
  const foes = g.units.filter(u => u.alive && u.side !== side), mine = g.units.filter(u => u.alive && u.side === side);
  if (!foes.length) v += 500;
  if (!mine.length) v -= 500;
  for (const u of g.units) {
    const sign = u.side === side ? 1 : -1;
    if (!u.alive) { v -= sign * 5; continue; }       // 倒した敵は大きな得点、倒された味方は大きな失点（倒せる手を最優先する）
    v += sign * (u.hp + 2 + (u.isBoss ? 3 : 0) + u.atk * 0.4);
    if (sign < 0) {                                            // 敵への状態異常は得点
      if (u.poison > 0) v += 1.5;
      if (u.restNext) v += 2;
      if (u.mine) v += 1;
      if (u.barrier > 0) v -= 1.5;
    } else if (u.barrier > 0) v += 1.5;
  }
  return v;
}
