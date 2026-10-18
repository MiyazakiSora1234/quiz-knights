// 画面側の安全性: 外から届く文字列で、画面が壊れたり、HTML が差し込まれたりしない
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { icon, ICON_KEYS } from '../../app/src/lib/icons.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

test('icon: 知らないキー・特別な名前では、既定のアイコン（戦士）になり、Object の中身は出ない', () => {
  const base = icon('warrior');
  for (const k of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', 'zzz', '', null, undefined, 5, {}, ['warrior'], '<img src=x onerror=alert(1)>']) {
    const out = icon(k);
    assert.equal(out, base, String(k));
    assert.ok(!/\[object|function|native code|<img|onerror/.test(out), String(k));
  }
  for (const k of ICON_KEYS.slice(0, 8)) assert.match(icon(k), /^<svg class="ic"/);
});

test('画面: {@html ...} は、icon() の結果だけ。ほかに、外から届く文字列を HTML として差し込む場所がない', () => {
  const bad = [];
  for (const f of walk(path.join(ROOT, 'app/src')).filter(f => f.endsWith('.svelte'))) {
    for (const m of fs.readFileSync(f, 'utf-8').matchAll(/\{@html\s+([^}]*)\}/g)) if (!/^icon\(/.test(m[1].trim())) bad.push(`${path.relative(ROOT, f)}: ${m[0]}`);
  }
  assert.deepEqual(bad, []);
});

test('画面: innerHTML・outerHTML・insertAdjacentHTML・document.write・eval・new Function を使っていない', () => {
  const bad = [];
  for (const f of walk(path.join(ROOT, 'app/src')).filter(f => /\.(js|svelte)$/.test(f))) {
    const t = fs.readFileSync(f, 'utf-8');
    for (const re of [/\.innerHTML\s*=/, /\.outerHTML\s*=/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new Function\s*\(/]) if (re.test(t)) bad.push(`${path.relative(ROOT, f)}: ${re}`);
  }
  assert.deepEqual(bad, []);
});

test('配信: セキュリティヘッダー（CSP・クリックジャッキング・MIME・参照元）が設定されている', () => {
  const h = fs.readFileSync(path.join(ROOT, 'app/public/_headers'), 'utf-8');
  for (const want of ['X-Content-Type-Options: nosniff', 'X-Frame-Options: DENY', 'Referrer-Policy:', 'Permissions-Policy:', 'Strict-Transport-Security:', 'Content-Security-Policy:']) assert.ok(h.includes(want), want);
  const csp = h.match(/Content-Security-Policy: (.*)/)[1];
  assert.match(csp, /default-src 'self'/); assert.match(csp, /script-src 'self'(;|$)/, 'スクリプトは自分のものだけ（inline・外部なし）');
  assert.match(csp, /frame-ancestors 'none'/); assert.match(csp, /object-src 'none'/); assert.match(csp, /base-uri 'self'/);
  assert.ok(!/script-src[^;]*unsafe-/.test(csp), 'script に unsafe-inline / unsafe-eval を許さない');
  const html = fs.readFileSync(path.join(ROOT, 'app/index.html'), 'utf-8');
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), 'index.html に inline スクリプトがない');
  assert.ok(!/\son\w+\s*=/.test(html), 'index.html に inline のイベントがない');
});

test('設定: 秘密の鍵・トークンがソースに入っていない', () => {
  const hits = [];
  for (const f of [...walk(path.join(ROOT, 'app/src')), ...walk(path.join(ROOT, 'server')), ...walk(path.join(ROOT, '.github'))].filter(f => /\.(js|mjs|svelte|yml|jsonc?)$/.test(f))) {
    const t = fs.readFileSync(f, 'utf-8');
    if (/(CLOUDFLARE_API_TOKEN\s*[:=]\s*['"][A-Za-z0-9_-]{20,}|api[_-]?key\s*[:=]\s*['"][A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16})/i.test(t)) hits.push(path.relative(ROOT, f));
  }
  assert.deepEqual(hits, []);
});
