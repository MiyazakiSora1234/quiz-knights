// 効果音（Web Audio。ファイル不要）と振動。既定はオフ（通話アプリと音が重ならないように）
import { store, KEY } from '../storage.js';

export const sound = $state({ on: store.get(KEY.sound) === '1' });
export function toggleSound() { sound.on = !sound.on; store.set(KEY.sound, sound.on ? '1' : '0'); unlockAudio(); }

let actx = null;
/** ブラウザは、人が操作するまで音を出せない。最初の操作で呼んで有効にする */
export function unlockAudio() {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch { /* noop */ }
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
