<script>
  import { fade, fly } from 'svelte/transition';
  import { panel } from '../lib/stores/ui.svelte.js';

  // バトルログ（メニューから開く）。lines = [{m, c}]、新しいものが上
  let { lines = [] } = $props();
  const close = () => { panel.log = false; };
</script>

<svelte:window onkeydown={(e) => { if (panel.log && e.key === 'Escape') close(); }} />

{#if panel.log}
  <div class="back" role="presentation" onclick={(e) => e.target === e.currentTarget && close()} transition:fade={{ duration: 120 }}>
    <div class="sheet parch" in:fly={{ y: 14, duration: 180 }} role="dialog" aria-label="バトルログ">
      <div class="head"><b>バトルログ</b><button class="btn ghost sm" onclick={close}>閉じる</button></div>
      <div class="log">
        {#each lines.slice(0, 120) as l}<p class={l.c}>{l.m}</p>{:else}<p>まだ記録はありません</p>{/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .back{position:fixed;inset:0;background:#000b;z-index:80;display:flex;align-items:center;justify-content:center;padding:14px}
  .sheet{width:100%;max-width:520px;max-height:84dvh;display:flex;flex-direction:column;border-radius:14px;padding:12px 16px;box-shadow:inset 0 0 40px #8a6a3566,0 20px 60px #000}
  .head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;color:#7a1f26;font-family:var(--serif);font-size:1.05rem;letter-spacing:.15em}
  .log{overflow:auto}
  p{margin:0 0 6px;padding-bottom:6px;border-bottom:1px dotted #8a6a3577;font-size:.86rem;color:#2a2018}
  p.sys{color:#7a1f26;font-weight:700}p.dmg{color:#9a2630}p.heal{color:#2f6a2a}
</style>
