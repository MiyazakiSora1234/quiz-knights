// バトル画面の表示用の小さな関数（画面部品どうしで共有する）
import { JOB, bonusOf, statusTags } from '../../lib/engine.js';

/** 席の番号（両隣の判定に使われる）。魔王は席なし。対戦ではチーム内の並び */
export function seatOf(u, G) {
  if (u.isBoss) return null;
  const row = G.units.filter(x => !x.isBoss && (G.mode !== 'pvp' || x.side === u.side));
  return row.indexOf(u) + 1;
}

/** ユニットのカードに出す印 */
export function tagsFor(u, G) {
  const t = [];
  if (u.restNow) t.push({ t: '💤 今回休み', cls: 'warn' });
  if (u.restNext) t.push({ t: '次は休み' });
  if (u.job === 'tank') t.push({ t: `🛡 守り×${u.guards}`, cls: 'warn' });
  if (u.job === 'bm') t.push({ t: u.used ? '技使用済' : '技未使用' });
  if (JOB[u.job]?.tag && u.job !== 'tank') t.push({ t: JOB[u.job].tag });
  if (u.converted) t.push({ t: '魔王軍に寝返り', cls: 'warn' });
  if (u.isBoss && u.bossId === 1 && bonusOf(u)) t.push({ t: '与ダメ+2', cls: 'warn' });
  if (u.isBoss && u.bossId === 4) t.push({ t: '通常/ディレイ' });
  t.push(...statusTags(u, true, G.q));
  return t;
}

export const RESULT_TEXT = { win: '勝利！', lose: '全滅…', teamp: 'チームAの勝利！', teame: 'チームBの勝利！', draw: '引き分け' };
