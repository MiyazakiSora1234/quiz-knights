// 要素を <body> の直下へ移す（Svelte の use: アクション）。固定位置のドロップダウンが、親の重なり順（position: sticky など）に閉じ込められて、
// 画面下に固定したボタンの陰に隠れたり、暗くなったりしないようにする
export function portal(node) {
  document.body.appendChild(node);
  return { destroy() { node.remove(); } };
}
