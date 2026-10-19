// 称号の保存と、バトル終了時の判定。この端末のブラウザに、取った称号と積み重ねを保存する（ログインなし）
import { store } from '../storage.js';
import { TITLES, evaluateTitles, addToTotals, isTitleId } from '../titles.js';

const KEY = 'qk_titles';
const EMPTY = () => ({ earned: {}, equipped: '', totals: { plays: 0, chat: 0, hosted: 0, bankSent: 0, winJobs: [], bosses: [] }, lastAt: 0, lastHostAt: 0 });

function load() {
  try {
    const d = JSON.parse(store.get(KEY) || 'null');
    if (!d || typeof d !== 'object') return EMPTY();
    const e = EMPTY();
    const earned = {};
    if (d.earned && typeof d.earned === 'object') for (const [k, t] of Object.entries(d.earned)) if (isTitleId(k)) earned[k] = +t || 0;
    return { earned, equipped: isTitleId(d.equipped) && earned[d.equipped] != null ? d.equipped : '', totals: { ...e.totals, ...(d.totals || {}) }, lastAt: +d.lastAt || 0, lastHostAt: +d.lastHostAt || 0 };
  } catch { return EMPTY(); }
}

export class TitleStore {
  earned = $state({});        // 取った称号 { id: 取った時刻 }
  equipped = $state('');      // 名前の横に出す称号の id
  totals = $state(EMPTY().totals);
  fresh = $state([]);         // 直近のバトルで新しく取った称号の id
  #lastAt = 0; #lastHostAt = 0;

  constructor() {
    const d = load();
    this.earned = d.earned; this.equipped = d.equipped; this.totals = d.totals; this.#lastAt = d.lastAt; this.#lastHostAt = d.lastHostAt;
  }
  get count() { return Object.keys(this.earned).length; }
  get total() { return TITLES.length; }
  #save() { store.set(KEY, JSON.stringify({ earned: this.earned, equipped: this.equipped, totals: this.totals, lastAt: this.#lastAt, lastHostAt: this.#lastHostAt })); }

  /**
   * 参加者として遊んだバトルが終わった。同じバトルは1回だけ数える（result.at で見分ける）。新しく取った称号の id を返す
   * s: 自分の記録 / u: 自分のユニット / all: [{u, s}] 参加者全員 / result: バトルの結果 / flags: { reconnected }
   */
  record({ s, u, all, result, flags = {} }) {
    if (!result || !result.at || result.at === this.#lastAt) return [];
    this.#lastAt = result.at;
    this.totals = addToTotals(this.totals, { s, u, result });
    const got = evaluateTitles({ s, u, all, result, totals: this.totals, flags });
    const now = Date.now();
    const added = got.filter(id => this.earned[id] == null);
    if (added.length) this.earned = { ...this.earned, ...Object.fromEntries(added.map(id => [id, now])) };
    this.fresh = added;
    this.#save();
    return added;
  }
  /** 進行役としてバトルを終えた（同じバトルは1回） */
  addHosted(resultAt) {
    if (!resultAt || resultAt === this.#lastHostAt) return [];
    this.#lastHostAt = resultAt;
    this.totals = { ...this.totals, hosted: (this.totals.hosted || 0) + 1 };
    return this.#recheck();
  }
  addChat() { this.totals = { ...this.totals, chat: (this.totals.chat || 0) + 1 }; return this.#recheck(); }
  markBank() { this.totals = { ...this.totals, bankSent: (this.totals.bankSent || 0) + 1 }; return this.#recheck(); }
  /** 積み重ねだけで決まる称号（チャット・進行役・問題集）を判定し直す */
  #recheck() {
    const got = evaluateTitles({ s: {}, u: null, all: [], result: null, totals: this.totals, flags: {} })
      .filter(id => ['t091', 't097', 't098'].includes(id));
    const added = got.filter(id => this.earned[id] == null);
    if (added.length) { const now = Date.now(); this.earned = { ...this.earned, ...Object.fromEntries(added.map(id => [id, now])) }; this.fresh = [...this.fresh, ...added]; }
    this.#save();
    return added;
  }
  equip(id) {
    if (id !== '' && !(isTitleId(id) && this.earned[id] != null)) return false;
    this.equipped = id; this.#save();
    return true;
  }
}

export const titles = new TitleStore();
