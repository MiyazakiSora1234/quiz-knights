// 進行役の準備画面で使う純粋なロジック（名簿の同期・開始条件・ジャンルの解析）。画面に依存しないのでテストできる
import { SELECTABLE } from './engine.js';

/** 職業名が不正なときは戦士にする（サーバーから届く値の安全対策） */
export const validJob = j => (SELECTABLE.includes(j) ? j : 'warrior');

/**
 * サーバーの参加者一覧(lobby)を名簿(roster)に反映する。roster は配列そのものを書き換える。
 *  - 退室した人は消す
 *  - 新しい人は追加。すでにいる人は、オンライン・ひとこと・遅延を更新する
 *  - 進行役が手で変えた職業・チーム（touchedJob / touchedTeam）は、参加者の選び直しで上書きしない
 * nextKey は、新しい行に付ける一意なキーを返す関数。
 */
export function syncRoster(roster, lobby, nextKey) {
  const ids = new Set(lobby.map(p => p.pid));
  for (let i = roster.length - 1; i >= 0; i--) if (roster[i].pid && !ids.has(roster[i].pid)) roster.splice(i, 1);
  for (const lp of lobby) {
    const row = roster.find(p => p.pid === lp.pid);
    if (!row) {
      roster.push({ key: nextKey(), name: lp.name, flavor: lp.flavor || '', job: validJob(lp.job), team: lp.team || 'p', pid: lp.pid, online: lp.online, rtt: lp.rtt ?? null });
      continue;
    }
    if (!row.touchedName) row.name = lp.name;
    row.online = lp.online; row.flavor = lp.flavor || ''; row.rtt = lp.rtt ?? null;
    if (!row.touchedJob) row.job = validJob(lp.job);
    if (!row.touchedTeam) row.team = lp.team || row.team;
  }
}

/** 開始できない理由（開始できるなら空文字） */
export function startBlock(roster, mode) {
  const named = roster.filter(p => p.name.trim());
  if (!named.length) return '参加者が入室すると開始できます';
  if (mode === 'pvp' && (!named.some(p => p.team === 'p') || !named.some(p => p.team === 'e'))) return '両チームに1人以上が必要です';
  return '';
}
