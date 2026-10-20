// デザインの基本: 文字の色と背景のコントラスト（WCAG AA: 小さい文字は4.5:1以上）、押せる大きさ、絵文字の位置の補正
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'app/src/theme.css'), 'utf8');
const vars = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map(m => [m[1], m[2]]));
const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

test('[デザイン] 文字の色（本文・補助・淡い文字・金）は、どの背景の面の上でも、コントラスト4.5:1以上', () => {
  const surfaces = ['bg', 's1', 's2', 's3'];
  for (const t of ['tx', 'mut', 'dim', 'gold']) for (const s of surfaces) assert.ok(ratio(vars[t], vars[s]) >= 4.5, `--${t} on --${s}: ${ratio(vars[t], vars[s]).toFixed(2)}`);
  assert.ok(lum(vars.tx) > lum(vars.mut) && lum(vars.mut) > lum(vars.dim), '明るさの順（本文 > 補助 > 淡い）が保たれる');
});

test('[デザイン] 押せるボタンの大きさ: スマホでは44px・小さいボタンも40px以上、キーの小さな表示も11px以上', () => {
  assert.match(css, /@media\(max-width:900px\)\{\.btn\{min-height:44px\}\.btn\.sm\{min-height:40px;min-width:40px\}\}/);
  assert.match(css, /kbd\{[^}]*font-size:max\(\.72em,11px\)/);
  const tt = fs.readFileSync(path.join(ROOT, 'app/src/components/TopTools.svelte'), 'utf8');
  assert.match(tt, /min-width:40px;height:40px/, '上のアイコンボタンは、40px角以上');
  assert.match(tt, /NUDGE/, '絵文字の上下の位置を補正している');
});

test('[デザイン] 右上のボタン列: 狭い画面で2段に折り返さないよう、使用頻度の低いボタンは☰へ移る（全画面で同じ指定）', () => {
  const need = { 'app/src/pages/host/GameHeader.svelte': ['log', 'bank', 'rules'], 'app/src/pages/host/Setup.svelte': ['bank', 'rules'], 'app/src/pages/play/PlayGame.svelte': ['log', 'rules'], 'app/src/pages/play/RoomView.svelte': ['bank', 'rules'] };
  for (const [f, keys] of Object.entries(need)) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const k of keys) assert.match(s, new RegExp(`key: '${k}',[^}]*narrowMenu: true`), `${f} の ${k}`);
  }
});
