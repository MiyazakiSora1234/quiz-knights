// Svelte の use: アクション（画面部品の小さな共通動作）

/** 表示されたときに入力欄へフォーカスする。when=false なら何もしない。select=true なら中身も選択 */
export function focusOnMount(node, { when = true, select = false } = {}) {
  if (!when) return;
  node.focus();
  if (select && node.select) node.select();
}
