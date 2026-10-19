<script>
  import { portal } from '../lib/portal.js';
  import { fade } from 'svelte/transition';

  // 汎用のドロップダウン。options = [{ v, n, d? }]。value は選んだ v
  let { value = $bindable(), options = [], onchange, label = '' } = $props();
  let open = $state(false), btn = $state(), listEl = $state(), pos = $state({ top: 0, left: 0, width: 0, up: false });
  const cur = $derived(options.find(o => o.v === value));

  function toggle() {
    if (open) { open = false; return; }
    const r = btn.getBoundingClientRect();
    const up = innerHeight - r.bottom < 220 && r.top > innerHeight - r.bottom;
    pos = { top: up ? r.top : r.bottom, left: r.left, width: Math.max(r.width, 200), up };
    open = true;
  }
  function pick(o) { value = o.v; open = false; onchange?.(o.v); btn?.focus(); }
  $effect(() => {
    if (!open) return;
    const onScroll = e => { if (!listEl?.contains(e.target)) open = false; };
    const close = () => { open = false; };
    addEventListener('scroll', onScroll, true); addEventListener('resize', close);
    return () => { removeEventListener('scroll', onScroll, true); removeEventListener('resize', close); };
  });
</script>

<button type="button" class="sel" bind:this={btn} onclick={toggle} onkeydown={(e) => e.key === 'Escape' && (open = false)} aria-haspopup="listbox" aria-expanded={open} aria-label={label}>
  <span class="lbl"><b>{cur?.n ?? ''}</b>{#if cur?.d}<small>{cur.d}</small>{/if}</span>
  <svg class="car" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
</button>

{#if open}
  <div class="back" use:portal role="presentation" onclick={() => (open = false)}></div>
  <div class="list" use:portal bind:this={listEl} role="listbox" transition:fade={{ duration: 90 }}
    style="left:{pos.left}px;width:{pos.width}px;{pos.up ? `bottom:${innerHeight - pos.top + 4}px` : `top:${pos.top + 4}px`};max-height:{Math.min(320, (pos.up ? pos.top : innerHeight - pos.top) - 16)}px">
    {#each options as o}
      <button type="button" role="option" aria-selected={o.v === value} class="opt" class:cur={o.v === value} onclick={() => pick(o)}>
        <span class="tx"><b>{o.n}</b>{#if o.d}<small>{o.d}</small>{/if}</span>{#if o.v === value}<span class="ck">✓</span>{/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  .sel{display:flex;align-items:center;gap:8px;width:100%;min-width:0;background:var(--s1);border:1px solid var(--line2);border-radius:10px;padding:9px 12px;cursor:pointer;text-align:left}
  .sel:hover,.sel[aria-expanded="true"]{border-color:var(--gold)}
  .lbl{flex:1;min-width:0;display:flex;flex-direction:column}.lbl b{font-weight:700}.lbl small{color:var(--mut);font-size:.74rem;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .car{width:12px;height:8px;flex:none;color:var(--mut)}
  .back{position:fixed;inset:0;z-index:90}
  .list{position:fixed;z-index:91;overflow:auto;background:var(--s1);border:1px solid var(--gold);border-radius:12px;padding:4px;box-shadow:0 14px 34px #000d}
  .opt{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;background:none;border:0;border-radius:8px;cursor:pointer;text-align:left}
  .opt:hover{background:var(--s3)}.opt.cur .tx b{color:var(--gold)}
  .tx{flex:1;min-width:0}.tx b{display:block;font-size:.92rem}.tx small{color:var(--mut);font-size:.74rem;line-height:1.3}
  .ck{color:var(--gold);font-weight:800}
</style>
