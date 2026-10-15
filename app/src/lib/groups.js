// 選択肢をグループ（敵・味方・チームごと）に分けて見せるための小さな関数
/**
 * options の group / gorder を見て、[{ label, cls, items: [{ o, i }] }] にする（i は元の番号。答えは元の番号で返す）。
 * group のない選択肢（「何もしない」など）は、最後にまとめる。グループは gorder の小さい順（敵 → 味方）。
 */
export function groupOptions(options) {
  const map = new Map();
  const rest = [];
  options.forEach((o, i) => {
    if (!o.group) { rest.push({ o, i }); return; }
    if (!map.has(o.group)) map.set(o.group, { label: o.group, cls: o.gcls ?? '', order: o.gorder ?? 9, items: [] });
    map.get(o.group).items.push({ o, i });
  });
  const groups = [...map.values()].sort((a, b) => a.order - b.order);
  if (rest.length) groups.push({ label: '', cls: '', order: 99, items: rest });
  // グループが1つだけなら見出しは不要
  return groups.length === 1 ? [{ ...groups[0], label: '' }] : groups;
}
