// 問題情報生成ツール: 「問題文＜タブ＞正解」の一覧から、クイズアプリに取り込める問題集 JSON を作る（設計: docs/QUESTION_DESIGN.md）
//   使い方:  node tools/make-bank.mjs 問題.tsv > 問題集.json
//   入力は1行1問。「問題文<タブ>正解」。正解の（）の中は別表記として使う。問題文に / があれば、その位置を区切りとして使う
//   区切りは BudouX（日本語の文節分割）で作り、確定ポイントは「最後の読点のあと〜問いかけの直前」の6割あたりにする（下書き。アプリの問題集画面で直せる）
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadDefaultJapaneseParser } from 'budoux';
import { parseSlashed, normalizeBank, exportBank } from '../app/src/lib/questions.js';

const parser = loadDefaultJapaneseParser();
const OPEN = '（(', CLOSE = '）)';

/** 各文字が、読みの括弧の内側にあるか（括弧の深さ） */
export function parenDepth(t) {
  let d = 0;
  return [...t].map(ch => { if (OPEN.includes(ch)) d++; const r = d; if (CLOSE.includes(ch)) d = Math.max(0, d - 1); return r; });
}

/** 区切りの位置。文節を、8文字前後（読点のあとなら5文字以上）にまとめる。読みの括弧の途中では切らない */
export function autoCuts(t) {
  const depth = parenDepth(t);
  let pos = 0, last = 0;
  const cuts = [];
  for (const ph of parser.parse(t)) {
    pos += ph.length;
    if (pos >= t.length) break;
    if (depth[pos - 1] > 0 && !CLOSE.includes(t[pos - 1])) continue;
    const seg = pos - last;
    if (seg >= 8 || (seg >= 5 && '、，'.includes(t[pos - 1]))) { cuts.push(pos); last = pos; }
  }
  if (cuts.length && t.length - cuts.at(-1) < 4) cuts.pop();      // 最後の塊が短すぎるときは前の塊に入れる
  return cuts;
}

const QPHRASE = /(は|を|が|の|に|で|と)?(第?何|誰|どこ|どれ|いくつ|いつ|なんと|なに)/g;
/** 確定ポイント（文字数）。答えがほぼ決まるあたりの目安。最も近い区切りの位置に合わせる */
export function autoSure(t, cuts = autoCuts(t)) {
  const depth = parenDepth(t);
  let segStart = 0;
  [...t].forEach((ch, i) => { if ('、，'.includes(ch) && depth[i] === 0) segStart = i + 1; });
  let qStart = null;
  QPHRASE.lastIndex = segStart;
  for (let m; (m = QPHRASE.exec(t));) qStart = m.index;
  if (qStart == null || qStart <= segStart) qStart = Math.max(segStart + 1, t.length - 7);
  let sure = segStart + Math.ceil(((qStart - segStart) * 6) / 10);
  sure = Math.max(1, Math.min(t.length - 1, sure));
  const marks = [...cuts, t.length];
  return marks.reduce((best, c) => (Math.abs(c - sure) < Math.abs(best - sure) ? c : best), marks[0]);
}

/** 正解の文字列 → { a, alt }。（）の中は別表記に入れる */
export function splitAnswer(raw) {
  const alt = [];
  for (const m of raw.matchAll(/[（(]([^）)]*)[）)]/g)) {
    for (const part of m[1].split(/[/／]/)) { const p = part.trim(); if (p && !alt.includes(p)) alt.push(p); }
  }
  const a = raw.replace(/[（(][^）)]*[）)]/g, '').replace(/[『』「」]/g, '').trim();
  return { a, alt: alt.map(x => x.replace(/[『』「」]/g, '').trim()).filter(x => x && x !== a).slice(0, 8) };
}

/** 1行1問のテキスト → 問題集のオブジェクト（検査つき）。戻り値 { bank, errors, warnings } */
export function buildBank(text, title = '') {
  const rows = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [q0, a0 = ''] = line.split('\t').map(s => s.trim());
    const slashed = /[\/／]/.test(q0) ? parseSlashed(q0) : null;
    const q = slashed ? slashed.q : q0;
    const cuts = slashed?.cuts.length ? slashed.cuts : autoCuts(q);
    const { a, alt } = splitAnswer(a0);
    rows.push({ q, a, alt, cuts, sure: q.length > 3 ? autoSure(q, cuts) : null });
  }
  const r = normalizeBank({ title, questions: rows });
  return { bank: JSON.parse(exportBank(r.title, r.questions)), errors: r.errors, warnings: r.warnings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) { console.error('使い方: node tools/make-bank.mjs 問題.tsv > 問題集.json'); process.exit(1); }
  const { bank, errors, warnings } = buildBank(fs.readFileSync(file, 'utf-8'), process.argv[3] || '');
  for (const e of errors) console.error('⚠', e);
  for (const w of warnings) console.error('・', w);
  console.error(`${bank.questions.length}問を作りました`);
  process.stdout.write(JSON.stringify(bank, null, 1));
}
