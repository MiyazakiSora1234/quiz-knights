<script>
  import { flip } from 'svelte/animate';
  import { fly } from 'svelte/transition';
  import { toasts } from '../lib/stores/ui.svelte.js';
</script>

<div class="stack" aria-live="polite">
  {#each toasts as t (t.id)}
    <div class="t" animate:flip={{ duration: 160 }} in:fly={{ y: -14, duration: 180 }} out:fly={{ y: -10, duration: 160 }}>{t.msg}</div>
  {/each}
</div>

<style>
  .stack{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:95;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;width:min(92vw,440px)}
  .t{background:#000e;border:1px solid var(--gold);color:var(--tx);padding:9px 18px;border-radius:99px;font-size:.9rem;box-shadow:0 6px 20px #000a;text-align:center}
</style>
