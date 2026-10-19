// 画面の文言の統一: 決めた用語以外の言い方が、画面の文字に混ざっていないかを確かめる（コメントは対象外）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'app/src');
function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, out); else if (/\.(svelte|js)$/.test(f.name)) out.push(p);
  }
  return out;
}
/** コメントと <style> を除いた、画面の文字を含むコード */
function visible(src) {
  return src
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/).map(l => (l.includes('://') ? l : l.replace(/(^|\s)\/\/.*$/, '$1'))).join('\n');
}
const files = walk(SRC);
const rel = f => path.relative(ROOT, f).replaceAll('\\', '/');

// [使わない言い方, 使う言い方]
const BANNED = [
  [/プレイヤー/, '「参加者」'],
  [/管理者|ホスト|司会/, '「進行役」'],
  [/ユニット/, '「カード」「人」「体」など（画面の文字では使わない）'],
  [/ターン/, '「問題」（次の問題休み）'],
  [/不正解/, '「誤答」'],
  [/与ダメ(?!ージ)/, '「ダメージ」'],
  [/敵1体に/, '「敵1人に」（対象は「人」で数える）'],
  [/閉じる ✕/, '「閉じる」'],
  [/(^|[^ぁ-ん])やめる<\/button>/, '「キャンセル」（取りやめるボタンは、キャンセルにそろえる）'],
];

test('[表記] 画面の文字に、決めた用語以外の言い方が混ざっていない', () => {
  const bad = [];
  for (const f of files) {
    const src = visible(fs.readFileSync(f, 'utf8'));
    for (const [re, use] of BANNED) {
      const m = re.exec(src);
      if (m) bad.push(`${rel(f)}: 「${m[0].trim()}」→ ${use}`);
    }
  }
  assert.deepEqual(bad, [], '統一していない言い方');
});

test('[表記] ページの題名は「ページ名 - QUIZ KNIGHTS」の形にそろっている', () => {
  const titles = [];
  for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/document\.title\s*=\s*([^;]+);|<title>([^<]+)<\/title>/g)) titles.push((m[1] ?? m[2]).trim());
  assert.ok(titles.length >= 4, titles.join());
  for (const t of titles) {
    const s = t.replace(/^['"`]|['"`]$/g, '');
    if (s.startsWith('(') || s.includes('${') || s.includes('?')) continue;       // 動的な題名（押せ！の通知など）は対象外
    assert.ok(/ - QUIZ KNIGHTS$/.test(s), `題名「${s}」が「… - QUIZ KNIGHTS」でない`);
  }
});

test('[表記] 確認ダイアログの題は「？」で終わり、説明は「。」で終わる', () => {
  const bad = [];
  for (const f of files) {
    const src = visible(fs.readFileSync(f, 'utf8'));
    for (const m of src.matchAll(/confirmAsk\(\s*'([^']*)'\s*(?:,\s*'([^']*)')?/g)) {
      if (!m[1].endsWith('？')) bad.push(`${rel(f)}: 題「${m[1]}」`);
      if (m[2] && !m[2].endsWith('。')) bad.push(`${rel(f)}: 説明「${m[2]}」`);
    }
  }
  assert.deepEqual(bad, []);
});
