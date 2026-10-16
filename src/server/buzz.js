// 早押し1問ぶんの判定（Cloudflare に依存しない純粋なクラス。Node だけでテストできる）
import { TOLERANCE_MIN_MS, TOLERANCE_MAX_MS, TOLERANCE_MARGIN_MS, DEFAULT_RTT_MS, TS_MAX_PAST_MS, RTT_MAX_MS } from './config.js';

export class BuzzRound {
  /** eligible: { pid: ディレイ(ms) } 押せる人とそのディレイ */
  constructor(q = 0, eligible = {}, open = false, chain = false, backup = false) {
    this.q = q;
    this.eligible = eligible;
    this.open = open;
    this.chain = chain;        // 連チャン: 勝者が決まったあとの押下（2着・3着…）も記録する
    this.backup = backup;      // 勝者が決まったあと、2着以降を受け付けている状態
    this.buzzes = {};          // pid -> 実効時刻 e（押した時刻 + ディレイ）
  }

  /** 次の問題の受付を始める */
  static start(q, eligible, chain = false) { return new BuzzRound(q, eligible || {}, true, !!chain); }

  canBuzz(pid) { return (this.open || this.backup) && pid in this.eligible && !(pid in this.buzzes); }

  /** 勝者が決まった。どのルールでも、2着以降の押下は順位の表示のために記録し続ける（連チャンでは回答権の移り先にもなる） */
  decided() { this.open = false; this.backup = true; }

  /**
   * 押下を記録する。arrival=サーバーに届いた時刻、ts=本人が申告した押した時刻（サーバー時刻換算）。
   * 申告は「到着より未来」にも「到着の2秒より前」にもできない。受け付けたら true。
   */
  record(pid, ts, arrival) {
    if (!this.canBuzz(pid)) return false;
    const claimed = Math.min(arrival, Math.max(arrival - TS_MAX_PAST_MS, +ts || arrival));
    this.buzzes[pid] = claimed + (this.eligible[pid] || 0);
    return true;
  }

  /** 最も早い実効時刻（まだ誰も押していなければ undefined） */
  get earliest() {
    const v = Object.values(this.buzzes);
    return v.length ? Math.min(...v) : undefined;
  }

  /** 遅れて届く押下を待つ時間。押せる人（isOnline が true）のうち最も遅い人の片道遅延 + 余裕 */
  tolerance(rttOf, isOnline = () => true) {
    let worst = 0;
    for (const pid of Object.keys(this.eligible)) {
      if (!isOnline(pid)) continue;
      worst = Math.max(worst, (rttOf(pid) ?? DEFAULT_RTT_MS) / 2);
    }
    return Math.min(TOLERANCE_MAX_MS, Math.max(TOLERANCE_MIN_MS, worst + TOLERANCE_MARGIN_MS));
  }

  /** 確定してよい時刻（これを過ぎたら勝者を決める） */
  deadline(rttOf, isOnline) { return this.earliest + this.tolerance(rttOf, isOnline); }

  /** 受付を止める */
  close() { this.open = false; }

  /** 実効時刻の順に並べた結果。誰も押していなければ空 */
  ranking(nameOf = () => undefined, exclude = []) {
    const all = Object.entries(this.buzzes)
      .map(([pid, e]) => ({ pid, e, name: nameOf(pid) }))
      .sort((x, y) => x.e - y.e);          // 同時刻なら先に届いた人（登録順）が先
    const first = all.length ? all[0].e : 0;
    return all.filter(x => !exclude.includes(x.pid)).map(x => ({ pid: x.pid, name: x.name, ms: x.e - first }));
  }

  /** 保存用（押下の記録は短時間しか持たないので含めない） */
  toJSON() { return { open: this.open, q: this.q, eligible: this.eligible, chain: this.chain, backup: this.backup }; }
  static from(saved) { return saved ? new BuzzRound(saved.q, saved.eligible, saved.open, saved.chain, saved.backup) : new BuzzRound(); }
}

/** 往復遅延の申告値を安全な範囲に収める */
export const clampRtt = v => Math.min(RTT_MAX_MS, Math.max(1, +v || 0));
