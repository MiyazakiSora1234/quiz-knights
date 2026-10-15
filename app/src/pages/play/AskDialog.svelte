<script>
  import { fade, scale } from 'svelte/transition';
  import { icon } from '../../lib/icons.js';
  import { groupOptions } from '../../lib/groups.js';

  // 自分が選ぶ場面（行動・対象・押し付け先など）のダイアログ。進行役の画面でも同じ選択が出ていて、先に答えたほうが有効
  let { p } = $props();   // PlayStore
  const req = $derived(p.req);

  function onkey(e) {
    if (!req) return;
    const n = parseInt(e.key);
    if (n >= 1 && n <= req.options.length) { e.preventDefault(); p.answer(n - 1); }
  }
</script>

<svelte:window onkeydown={onkey} />

{#if req}
  <div class="backdrop" transition:fade={{ duration: 120 }} role="presentation">
    <div class="dlg" transition:scale={{ start: .96, duration: 140 }} role="dialog" aria-modal="true" aria-label={req.title}>
      <div class="you">あなたの番です</div>
      <h3>{req.title}</h3>
      {#if req.sub}<div class="sub">{req.sub}</div>{/if}
      <div class="opts">
        {#each groupOptions(req.options) as g}
          {#if g.label}<div class="gh {g.cls}">{g.label}</div>{/if}
          {#each g.items as { o, i }}
            <button class="opt {o.cls ?? ''}" disabled={o.disabled} onclick={() => p.answer(i)}>
              {#if o.unit}<span class="uic {o.unit.side === 'e' ? 'foe' : ''}" class:dead={!o.unit.alive}>{@html icon(o.unit.job)}</span>{/if}
              <span class="tx"><b>{o.label}</b>{#if o.sub}<small>{o.sub}</small>{/if}</span>
            </button>
          {/each}
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop{position:fixed;inset:0;background:#000c;display:flex;align-items:flex-end;justify-content:center;padding:12px;z-index:75}
  .dlg{background:var(--s1);border:1px solid var(--gold);border-radius:16px;padding:18px;max-width:560px;width:100%;max-height:88dvh;overflow:auto;box-shadow:0 20px 60px #000}
  .you{display:inline-block;background:var(--gold);color:#2a1c06;font-weight:800;font-size:.75rem;border-radius:999px;padding:2px 10px;margin-bottom:6px}
  h3{font-size:1.15rem;color:var(--gold)}
  .sub{color:var(--mut);font-size:.85rem;margin-top:2px}
  .opts{display:grid;gap:8px;margin-top:12px}
  .gh{margin:10px 2px 0;font-size:.82rem;font-weight:800;letter-spacing:.08em;display:flex;align-items:center;gap:8px;color:#9cc8ee}.gh.foe{color:#ff9aa2}
  .gh::after{content:"";flex:1;height:1px;background:currentColor;opacity:.35}
  .gh:first-child{margin-top:0}
  .opt{display:flex;align-items:center;gap:12px;background:var(--s2);border:1px solid var(--line2);border-radius:10px;padding:12px 14px;text-align:left;cursor:pointer;min-height:52px}
  .opt:active:not(:disabled){border-color:var(--gold);background:var(--s3)}
  .opt:disabled{opacity:.35}
  .opt.foe{border-color:var(--red-d)}.opt.ghost{background:transparent}.opt.ok{border-color:var(--grn-d)}
  .uic{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-size:1.3rem;background:#120f0c;border:2px solid var(--blu-d);flex:none}
  .uic.foe{border-color:var(--red-d)}.uic.dead{filter:grayscale(1);opacity:.6}
  .tx b{display:block}.tx small{display:block;color:var(--mut);font-weight:400;font-size:.82rem}
  @media(min-width:900px){.backdrop{align-items:center}}
</style>
