// バトル画面の表示用の小さな関数（画面部品どうしで共有する）
import { JOB, ITEMS, bonusOf, statusTags } from '../../lib/engine.js';

/** ユニットのカードに出す印 */
export function tagsFor(u, G) {
  const t = [];
  if (u.restNow) t.push({ t: '💤 今回休み', cls: 'warn' });
  if (u.restNext) t.push({ t: '次は休み' });
  if (u.job === 'tank') t.push({ t: `🛡 守り×${u.guards}`, cls: 'warn' });
  if (u.job === 'bm') t.push({ t: u.used ? '必殺 使用済み' : '必殺 未使用' });
  if (JOB[u.job]?.tag && u.job !== 'tank') t.push({ t: JOB[u.job].tag });
  if (u.converted) t.push({ t: '魔王軍に寝返り', cls: 'warn' });
  if (u.isBoss && u.bossId === 1 && bonusOf(u)) t.push({ t: 'ダメージ+2', cls: 'warn' });
  t.push(...statusTags(u, true, G.q).filter(x => !x.t.startsWith('🎒')));         // 個数の印の代わりに、持ち物の名前を出す
  for (const k of u.items ?? []) if (ITEMS[k]) t.push({ t: `${ITEMS[k].ic} ${ITEMS[k].n}`, d: ITEMS[k].d });
  return t;
}

export const RESULT_TEXT = { win: '勝利！', lose: '全滅…', teamp: 'チームAの勝利！', teame: 'チームBの勝利！', teamc: 'チームCの勝利！', draw: '引き分け' };
/** CPU の職業チームと戦った場合の結果 */
export const RESULT_TEXT_CPU = { ...RESULT_TEXT, teamp: '勝利！', teame: '全滅…', teamc: '全滅…' };
