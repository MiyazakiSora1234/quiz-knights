<script>
  // 数字を増減する部品: 大きな ー / ＋ ボタン（押し続けると連続で変わる）と、直接入力もできる欄
  let { value = $bindable(0), min = 0, max = 99, label = '', step: unit = 1, onchange = null } = $props();
  let timer = null, rep = null;

  const clamp = v => Math.min(max, Math.max(min, Math.round(+v || 0)));
  const step = d => { const v = clamp(value + d * unit); if (v !== value) { value = v; onchange?.(v); } };
  function hold(d) {
    step(d);
    timer = setTimeout(() => { rep = setInterval(() => step(d), 90); }, 380);
  }
  function release() { clearTimeout(timer); clearInterval(rep); timer = rep = null; }
  function onkey(e) {
    if (e.key === 'ArrowUp') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); step(-1); }
  }
</script>

<svelte:window onpointerup={release} onpointercancel={release} />

<div class="st" role="group" aria-label={label}>
  <button type="button" class="b" disabled={value <= min} aria-label="{label}を減らす" onpointerdown={(e) => { e.preventDefault(); hold(-1); }} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); step(-1); } }}>−</button>
  <input class="v" inputmode="numeric" aria-label={label} value={value} onfocus={(e) => e.currentTarget.select()} onkeydown={onkey}
    oninput={(e) => { const n = parseInt(e.currentTarget.value, 10); if (!Number.isNaN(n)) { value = clamp(n); onchange?.(value); } }}
    onblur={(e) => { e.currentTarget.value = String(value); }}>
  <button type="button" class="b" disabled={value >= max} aria-label="{label}を増やす" onpointerdown={(e) => { e.preventDefault(); hold(1); }} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); step(1); } }}>＋</button>
</div>

<style>
  .st{display:flex;align-items:stretch;border:1px solid var(--line2);border-radius:10px;background:var(--s1);overflow:hidden}
  .b{flex:none;width:40px;border:0;background:var(--s2);color:var(--tx);font-size:1.25rem;font-weight:800;cursor:pointer;padding:0;line-height:1;touch-action:manipulation;user-select:none}
  .b:hover:not(:disabled){background:var(--s3);color:var(--gold)}
  .b:active:not(:disabled){background:#3a2f1a}
  .b:disabled{opacity:.3;cursor:default}
  .v{flex:1;min-width:0;width:100%;text-align:center;font-size:1.1rem;font-weight:800;border:0;background:transparent;padding:8px 2px;outline:none}
  .st:focus-within{border-color:var(--gold)}
</style>
