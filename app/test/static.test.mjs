// 静的な検査（リファクタリングの安全網）: すべての Svelte ファイルがコンパイルでき、import の行き先と名前が存在し、
// 使われていないファイルや、壊れたCSSの参照がない。ブラウザを使わず、ファイルを読むだけで確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compile, compileModule } from 'svelte/compiler';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SRC = path.join(ROOT, 'app/src');
const SERVER = path.join(ROOT, 'src');

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const files = [...walk(SRC), ...walk(SERVER)].filter(f => /\.(svelte|js)$/.test(f));
const rel = f => path.relative(ROOT, f).replaceAll('\\', '/');
const read = f => fs.readFileSync(f, 'utf8');

/** import 'x' / import a from 'x' / import { a, b as c } from 'x' / export ... from 'x' の指定を取り出す */
function importsOf(src) {
  const out = [];
  const re = /(?:^|\n)\s*(?:import|export)\s+([^'"`;]*?)\s*from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[3]) { out.push({ spec: m[3], names: [], star: false, def: false }); continue; }
    const clause = m[1].trim();
    const names = []; let def = false, star = false;
    const braces = /\{([^}]*)\}/.exec(clause);
    if (braces) for (const part of braces[1].split(',')) { const n = part.trim().split(/\s+as\s+/)[0].trim(); if (n) names.push(n); }
    const head = clause.replace(/\{[^}]*\}/, '').replace(/,/g, ' ').trim();
    if (/^\*/.test(head)) star = true; else if (head && !/^\*/.test(head)) def = true;
    out.push({ spec: m[2], names, star, def });
  }
  return out;
}
/** ファイルが外へ出している名前（簡易）。`export * from` は先の名前も含める */
function exportsOf(file, seen = new Set()) {
  if (seen.has(file)) return { names: new Set(), def: false };
  seen.add(file);
  const src = read(file);
  const names = new Set(); let def = /\bexport\s+default\b/.test(src);
  for (const m of src.matchAll(/\bexport\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/\bexport\s*\{([^}]*)\}(?!\s*from)/g)) for (const part of m[1].split(',')) { const n = part.trim().split(/\s+as\s+/).pop().trim(); if (n) names.add(n); }
  for (const m of src.matchAll(/\bexport\s*\{([^}]*)\}\s*from/g)) for (const part of m[1].split(',')) { const n = part.trim().split(/\s+as\s+/).pop().trim(); if (n) names.add(n); }
  for (const m of src.matchAll(/\bexport\s*\*\s*from\s*['"]([^'"]+)['"]/g)) {
    const t = resolve(file, m[1]);
    if (t) for (const n of exportsOf(t, seen).names) names.add(n);
  }
  return { names, def };
}
function resolve(from, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const cand of [base, base + '.js', base + '.svelte', base + '.svelte.js', path.join(base, 'index.js')]) if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  return undefined;
}

for (const f of files.filter(x => x.endsWith('.svelte'))) {
  test(`[静的] ${rel(f)}: Svelte としてコンパイルできる`, () => {
    const out = compile(read(f), { filename: f, generate: 'client' });
    assert.ok(out.js.code.length > 0);
    const bad = out.warnings.filter(w => /^(a11y_|attribute_|element_|node_invalid|state_|css_unused_selector)/.test(w.code) === false && !/^(state_referenced_locally|a11y_|css_unused_selector)/.test(w.code));
    assert.deepEqual(bad.map(w => `${w.code}: ${w.message}`), [], '想定外の警告');
  });
}
for (const f of files.filter(x => x.endsWith('.svelte.js'))) {
  test(`[静的] ${rel(f)}: Svelte のルーン付きモジュールとしてコンパイルできる`, () => {
    assert.ok(compileModule(read(f), { filename: f, generate: 'client' }).js.code.length > 0);
  });
}
for (const f of files) {
  test(`[静的] ${rel(f)}: import の行き先と名前がすべて存在する`, () => {
    const src = f.endsWith('.svelte') ? [...read(f).matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n') : read(f);
    for (const imp of importsOf(src)) {
      if (!imp.spec.startsWith('.')) continue;                          // 外部パッケージ・仮想モジュールは対象外
      const target = resolve(f, imp.spec);
      assert.ok(target, `${rel(f)} の import「${imp.spec}」が見つからない`);
      if (target.endsWith('.svelte')) { assert.ok(!imp.names.length, `${imp.spec} は Svelte 部品なので名前付きでは取り込めない`); continue; }
      if (/\.(css|json)$/.test(target)) continue;
      const ex = exportsOf(target);
      for (const n of imp.names) assert.ok(ex.names.has(n), `${rel(f)} が「${n}」を ${rel(target)} から取り込んでいるが、存在しない`);
      if (imp.def) assert.ok(ex.def, `${rel(target)} に default export がない`);
    }
  });
}

test('[静的] どの部品・ライブラリも、どこかから使われている（孤立したファイルがない）', () => {
  const entries = new Set([path.join(SRC, 'main.js'), path.join(SERVER, 'worker.js')]);
  const used = new Set(entries);
  const queue = [...entries];
  while (queue.length) {
    const f = queue.pop();
    const src = f.endsWith('.svelte') ? [...read(f).matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n') : read(f);
    for (const imp of importsOf(src)) { const t = resolve(f, imp.spec); if (t && !used.has(t)) { used.add(t); queue.push(t); } }
    for (const m of src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) { const t = resolve(f, m[1]); if (t && !used.has(t)) { used.add(t); queue.push(t); } }
  }
  const orphans = files.filter(f => !used.has(f)).map(rel);
  assert.deepEqual(orphans, [], '使われていないファイル');
});

test('[静的] サーバーのコードはブラウザ側の部品（Svelte・DOM）に依存せず、ブラウザ側はサーバーのコードを直接 import しない', () => {
  for (const f of files.filter(x => x.startsWith(SERVER))) {
    for (const imp of importsOf(read(f))) assert.ok(!/\.svelte|app\/src/.test(imp.spec), `${rel(f)} がブラウザ側を import している`);
  }
  for (const f of files.filter(x => x.startsWith(SRC))) {
    const src = f.endsWith('.svelte') ? [...read(f).matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n') : read(f);
    for (const imp of importsOf(src)) { const t = resolve(f, imp.spec); assert.ok(!t || !t.startsWith(SERVER), `${rel(f)} がサーバーのコードを import している`); }
  }
});

test('[静的] 画面が使う CSS 変数は、テーマで定義されている', () => {
  const theme = read(path.join(SRC, 'theme.css'));
  const defined = new Set([...theme.matchAll(/--([\w-]+)\s*:/g)].map(m => m[1]));
  for (const f of files.filter(x => x.endsWith('.svelte'))) {
    const local = new Set([...read(f).matchAll(/--([\w-]+)\s*:/g)].map(m => m[1]));
    for (const m of read(f).matchAll(/var\(--([\w-]+)/g)) assert.ok(defined.has(m[1]) || local.has(m[1]), `${rel(f)} が未定義の CSS 変数 --${m[1]} を使っている`);
  }
});
