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

/* ---------- 荒らし・負荷への備え（認証なしで公開するための上限） ---------- */
/** メッセージ1通の大きさの上限（文字数）。参加者は小さく、進行役は状態・バトルの預けがあるので大きく */
export const MAX_MSG_PLAYER = 4096;
export const MAX_MSG_HOST = 262144;
/** 1つの部屋につなげる数・同じ接続元（IP）からつなげる数。接続元が分からない開発環境では数えない */
export const MAX_SOCKETS_PER_ROOM = 150;
export const MAX_SOCKETS_PER_IP = 30;
/** 1つの部屋の参加者の数・同じ接続元から入れる参加者の数 */
export const MAX_PLAYERS = 60;
export const MAX_PLAYERS_PER_IP = 20;
/** 1つの接続のメッセージの回数制限（たまる量・1秒に回復する量）。超えた分は捨て、続けて超えたら切る */
export const RATE_PLAYER = { cap: 40, perSec: 20 };
export const RATE_HOST = { cap: 600, perSec: 200 };
export const RATE_STRIKES_MAX = 200;
/** チャット: 1人あたり、この回数まで連続で送れて、1秒に回復する量 */
export const RATE_CHAT = { cap: 5, perSec: 0.5 };
/** パスワード・鍵の入力に、これだけ失敗したら、しばらく受け付けない */
export const FAIL_MAX = 6;
export const FAIL_LOCK_MS = 60 * 1000;
/** 部屋を作る数: 同じ接続元が同時に持てる部屋・1時間に作れる部屋 */
export const MAX_ROOMS_PER_IP = 3;
export const MAX_CREATES_PER_HOUR = 6;
/** 入口（Worker）での回数制限: 同じ接続元から、この時間にできる接続・部屋一覧の取得の数（Worker 1つあたり） */
export const EDGE_WS_LIMIT = { limit: 30, windowMs: 10 * 1000 };
export const EDGE_LIST_LIMIT = { limit: 60, windowMs: 10 * 1000 };
/** 部屋一覧を、この時間だけ使い回す（Durable Object への問い合わせを減らす）。環境変数 LIST_CACHE_MS で変えられる */
export const LIST_CACHE_MS = 1000;
