<script>
  import { fade, scale } from 'svelte/transition';
  import { modal, answerModal, cancelModal } from '../lib/ui.svelte.js';
  import { icon } from '../lib/icons.js';
  import { groupOptions } from '../lib/groups.js';

  function onkey(e) {
    if (!modal.req) return;
    if (e.key === 'Escape') { e.preventDefault(); cancelModal(); return; }
    const n = parseInt(e.key);
    if (n >= 1 && n <= modal.req.options.length) { e.preventDefault(); answerModal(n - 1); }
  }
</script>

<svelte:window onkeydown={onkey} />

{#if modal.req}
  <div class="backdrop" transition:fade={{ duration: 120 }} onmousedown={(e) => e.target === e.currentTarget && cancelModal()} role="presentation">
    <div class="dlg" transition:scale={{ start: .96, duration: 140 }} role="dialog" aria-modal="true" aria-label={modal.req.title}>
      <h3>{modal.req.title}</h3>
      {#if modal.req.sub}<div class="sub">{modal.req.sub}</div>{/if}
      <div class="opts">
        {#each groupOptions(modal.req.options) as g}
          {#if g.label}<div class="gh {g.cls}">{g.label}</div>{/if}
          {#each g.items as { o, i }}
            <button class="opt {o.cls ?? ''}" disabled={o.disabled} onclick={() => answerModal(i)}>
              <span class="no">{i + 1}</span>
              {#if o.unit}<span class="uic {o.unit.side === 'e' ? 'foe' : ''}" class:dead={!o.unit.alive}>{@html icon(o.unit.job)}</span>{/if}
              <span class="tx"><b>{o.label}</b>{#if o.sub}<small>{o.sub}</small>{/if}</span>
            </button>
          {/each}
        {/each}
      </div>
      {#if modal.req.cancel}
        <button class="cancel" onclick={cancelModal}>キャンセル（この問題の処理を取り消す）<kbd>Esc</kbd></button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .backdrop{position:fixed;inset:0;background:#000b;display:flex;align-items:center;justify-content:center;padding:16px;z-index:70}
  .dlg{background:var(--s1);border:1px solid var(--gold);border-radius:16px;padding:22px;max-width:600px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 20px 60px #000}
  h3{font-size:1.2rem;color:var(--gold);margin-bottom:4px}
  .opts{display:grid;gap:8px;margin-top:14px}
  .gh{margin:8px 2px 0;font-size:.82rem;font-weight:800;letter-spacing:.08em;display:flex;align-items:center;gap:8px;color:#9cc8ee}.gh.foe{color:#ff9aa2}
  .gh::after{content:"";flex:1;height:1px;background:currentColor;opacity:.35}
  .gh:first-child{margin-top:0}
  .opt{display:flex;align-items:center;gap:12px;background:var(--s2);border:1px solid var(--line2);border-radius:10px;padding:10px 14px;text-align:left;cursor:pointer;transition:.1s}
  .opt:hover:not(:disabled){border-color:var(--gold);background:var(--s3)}
  .opt:disabled{opacity:.35;cursor:not-allowed}
  .opt.foe{border-color:var(--red-d)} .opt.ghost{background:transparent} .opt.ok{border-color:var(--grn-d)}
  .no{width:24px;height:24px;border-radius:6px;background:#0005;border:1px solid var(--line2);display:grid;place-items:center;font-size:.78rem;font-weight:800;color:var(--mut);flex:none}
  .uic{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-size:1.3rem;background:#120f0c;border:2px solid var(--blu-d);flex:none}
  .uic.foe{border-color:var(--red-d)} .uic.dead{filter:grayscale(1);opacity:.6}
  .tx{min-width:0} .tx b{display:block} .tx small{display:block;color:var(--mut);font-weight:400;font-size:.82rem}
  .cancel{margin-top:14px;width:100%;background:transparent;border:1px solid var(--line);border-radius:10px;padding:9px;color:var(--mut);cursor:pointer}
  .cancel:hover{border-color:var(--line2);color:var(--tx)}
</style>
