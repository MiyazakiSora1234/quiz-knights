// 画面共通の状態: トースト・選択/確認ダイアログ・ルール表示
import { CANCEL } from './engine.js';

export const toasts = $state([]);
let tid = 0;
export function toast(msg, ms = 2600) {
  const id = ++tid;
  toasts.push({ id, msg });
  while (toasts.length > 3) toasts.shift();
  setTimeout(() => { const i = toasts.findIndex(t => t.id === id); if (i >= 0) toasts.splice(i, 1); }, ms);
}

/** ask(title, options, {sub, cancel}) → 選んだ value。キャンセルは CANCEL で reject */
export const modal = $state({ req: null });
export function ask(title, options, { sub = '', cancel = true } = {}) {
  return new Promise((resolve, reject) => { modal.req = { title, options, sub, cancel, resolve, reject }; });
}
/** はい/いいえの確認（ブラウザ標準のconfirmは使わない） */
export async function confirmAsk(title, sub = '', yes = 'はい', danger = true) {
  try {
    return await ask(title, [{ label: yes, value: true, cls: danger ? 'foe' : 'ok' }, { label: 'キャンセル', value: false, cls: 'ghost' }], { sub, cancel: false });
  } catch { return false; }
}
export function answerModal(i) {
  const r = modal.req; if (!r) return;
  const o = r.options[i]; if (!o || o.disabled) return;
  modal.req = null; r.resolve(o.value);
}
export function cancelModal() {
  const r = modal.req; if (!r || !r.cancel) return;
  modal.req = null; r.reject(CANCEL);
}

export const panel = $state({ rules: false, log: false });
