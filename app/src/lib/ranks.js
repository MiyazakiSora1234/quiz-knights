// 早押しの順位の表示用: 「1着」「2着 +120ms」のような短い文字にする（1着からの遅れ）
export function rankTag(entry, index) {
  if (!entry) return null;
  const place = index + 1;
  const ms = Math.round(entry.ms);
  return { t: place === 1 ? '🥇 1着' : `${place}着 +${ms}ms`, cls: place === 1 ? 'rank1' : 'rank' };
}

/** 順位表 [{pid,ms}] から、pid → タグ の表を作る */
export function rankTags(all) {
  const out = {};
  (all ?? []).forEach((e, i) => { out[e.pid] = rankTag(e, i); });
  return out;
}
