// キーボードでの早押し（Space / Enter）。画面に依存しない判定だけをここに置く（テストできるように）

/** このキー入力を、早押しとして扱うか。
 *  blocked: ダイアログが開いているなど、早押しを受け付けない状態
 *  文字入力欄・ボタン・リンクにフォーカスがあるときは、そのキーの本来の動きを優先する（早押しボタン自身は除く） */
export function isBuzzKey(e, blocked = false) {
  if (blocked || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
  if (e.key !== ' ' && e.key !== 'Enter' && e.code !== 'Space') return false;
  const t = e.target;
  if (!t || !t.tagName) return true;
  if (t.isContentEditable) return false;
  if (t.classList?.contains('buzz')) return true;
  return !/^(INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY)$/.test(t.tagName);
}
