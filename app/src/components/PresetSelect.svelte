<script>
  import { fade } from 'svelte/transition';
  import { icon } from '../lib/icons.js';

  // プリセットを選ぶドロップダウン。groups = [{ n, items: [{ n, d, foes:[...] }] }]、選ぶと onpick(foes)
  let { groups = [], onpick, label = 'プリセット', placeholder = 'プリセットから選ぶ' } = $props();
  let open = $state(false), btn = $state(), listEl = $state(), pos = $state({ top: 0, left: 0, width: 0, up: false }), cur = $state(null);

  function toggle() {
    if (open) { open = false; return; }
    const r = btn.getBoundingClientRect();
    const up = innerHeight - r.bottom < 320 && r.top > innerHeight - r.bottom;
    pos = { top: up ? r.top : r.bottom, left: r.left, width: Math.max(r.width, 260), up };
    open = true;
  }
  function pick(it) { cur = it.n; open = false; onpick?.([...it.foes]); btn?.focus(); }
  const keyOf = f => (/^boss\d+$/.test(f) ? 'boss' + f.slice(4) : f);
  $effect(() => {
    if (!open) return;
    const onScroll = e => { if (!listEl?.contains(e.target)) open = false; };
    const close = () => { open = false; };
    addEventListener('scroll', onScroll, true); addEventListener('resize', close);
    return () => { removeEventListener('scroll', onScroll, true); removeEventListener('resize', close); };
  });
</script>

<button type="button" class="sel" bind:this={btn} onclick={toggle} onkeydown={(e) => e.key === 'Escape' && (open = false)} aria-haspopup="listbox" aria-expanded={open} aria-label={label}>
  <span class="t">{cur ?? placeholder}</span>
  <svg class="car" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
</button>

{#if open}
  <div class="back" role="presentation" onclick={() => (open = false)}></div>
  <div class="list" bind:this={listEl} role="listbox" transition:fade={{ duration: 90 }}
    style="left:{pos.left}px;width:{pos.width}px;{pos.up ? `bottom:${innerHeight - pos.top + 4}px` : `top:${pos.top + 4}px`};max-height:{Math.min(420, (pos.up ? pos.top : innerHeight - pos.top) - 16)}px">
    {#each groups as g}
      <div class="gh">{g.n}</div>
      {#each g.items as it}
        <button type="button" role="option" aria-selected={cur === it.n} class="opt" class:cur={cur === it.n} onclick={() => pick(it)}>
          <span class="ics">{#each it.foes.slice(0, 4) as f}<span class="ic1">{@html icon(keyOf(f))}</span>{/each}{#if it.foes.length > 4}<span class="more">+{it.foes.length - 4}</span>{/if}</span>
          <span class="tx"><b>{it.n}</b>{#if it.d}<small>{it.d}</small>{/if}</span>
        </button>
      {/each}
    {/each}
  </div>
{/if}

<style>
  .sel{display:flex;align-items:center;gap:8px;width:100%;min-width:0;background:var(--s1);border:1px solid var(--line2);border-radius:10px;padding:9px 12px;cursor:pointer;text-align:left;font-weight:700}
  .sel:hover,.sel[aria-expanded="true"]{border-color:var(--gold)}
  .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .car{width:12px;height:8px;flex:none;color:var(--mut)}
  .back{position:fixed;inset:0;z-index:90}
  .list{position:fixed;z-index:91;overflow:auto;background:var(--s1);border:1px solid var(--gold);border-radius:12px;padding:4px;box-shadow:0 14px 34px #000d}
  .gh{margin:8px 8px 2px;color:var(--gold);font-size:.74rem;font-weight:800;letter-spacing:.1em}
  .gh:first-child{margin-top:4px}
  .opt{display:flex;align-items:center;gap:10px;width:100%;padding:7px 10px;background:none;border:0;border-radius:8px;cursor:pointer;text-align:left}
  .opt:hover{background:var(--s3)}.opt.cur .tx b{color:var(--gold)}
  .ics{display:flex;gap:2px;flex:none;min-width:92px}
  .ic1{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:#120f0c;border:1.5px solid var(--red-d);font-size:.85rem}
  .more{align-self:center;color:var(--mut);font-size:.7rem;margin-left:2px}
  .tx{min-width:0}.tx b{display:block;font-size:.9rem}.tx small{color:var(--mut);font-size:.74rem;line-height:1.3}
</style>
