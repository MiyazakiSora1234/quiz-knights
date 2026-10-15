// 画面共通の状態: トースト・確認ダイアログ・ルール表示・効果音
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

export const panel = $state({ rules: false });

/* ---------- 効果音（Web Audio。ファイル不要） ---------- */
let actx = null;
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* noop */ } },
};
export { store };
export const sound = $state({ on: store.get('qk_sound') !== '0' });
export function toggleSound() { sound.on = !sound.on; store.set('qk_sound', sound.on ? '1' : '0'); unlockAudio(); }
export function unlockAudio() {
  try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch { /* noop */ }
}
function tone(f, d = .12, type = 'sine', vol = .15, when = 0) {
  if (!sound.on || !actx) return;
  const t = actx.currentTime + when, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
  o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d);
}
export const sfx = {
  open: () => tone(660, .18),
  press: () => tone(240, .07, 'square', .1),
  win: () => { tone(523, .12, 'triangle'); tone(659, .12, 'triangle', .15, .1); tone(784, .3, 'triangle', .15, .2); },
  other: () => tone(330, .15, 'sine', .08),
  buzz: () => { tone(880, .12, 'triangle', .18); tone(1175, .18, 'triangle', .15, .1); },
  hit: () => tone(120, .2, 'square', .14),
  heal: () => { tone(784, .1); tone(988, .15, 'sine', .12, .08); },
  victory: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, .25, 'triangle', .16, i * .13)); },
  defeat: () => { [392, 330, 262].forEach((f, i) => tone(f, .3, 'sawtooth', .08, i * .2)); },
};
export const vib = p => { try { navigator.vibrate && navigator.vibrate(p); } catch { /* noop */ } };
