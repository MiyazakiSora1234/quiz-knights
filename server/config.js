// サーバーの設定値（数値の調整はここだけ触ればOK）
export const SLOTS = 16;                  // 部屋の数（1〜16番）
export const HOST_GRACE_MS = 30 * 60e3;   // 進行役が切断してから部屋を解放するまで

// 早押し判定: 「押した時刻」が最も早い人が勝つ。ただし遅れて届く押下を拾うため、
// 押せる人のうち最も遅延の大きい人の片道遅延ぶん（＋余裕）だけ待ってから確定する。
export const TOLERANCE_MIN_MS = 40;       // これより短くは待たない
export const TOLERANCE_MAX_MS = 600;      // これより長くは待たない（遅い回線に引きずられすぎない）
export const TOLERANCE_MARGIN_MS = 25;    // 測定誤差の余裕
export const DEFAULT_RTT_MS = 120;        // 遅延が未報告の参加者の仮定値
export const TS_MAX_PAST_MS = 2000;       // 押下時刻の申告は、到着の2秒前までしか遡れない（偽装対策）
export const RTT_MAX_MS = 3000;
/** 進行役の接続が切れてから、参加者が進行役を引き継げるようになるまでの時間（再読み込みで戻る人を待つ） */
export const HOST_TAKEOVER_MS = 15 * 1000;
export const BATTLE_MAX_CHARS = 100000;      // 預かるバトルの全状態の大きさの上限（Durable Object の保存の上限に収める）
/** 魔王の種類の数（部屋で選べる魔王の番号は 1〜この数） */
export const BOSS_COUNT = 6;
/** 自分で設定できる早押しのディレイ（ms）の上限 */
export const PERSONAL_DELAY_MAX = 3000;
/** 接続が切れたままの参加者を名簿から外すまでの時間 */
export const OFFLINE_PRUNE_MS = 6 * 3600e3;
