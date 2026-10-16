<script>
  import { fly } from 'svelte/transition';
  import { icon } from '../../lib/icons.js';
  import { groupOptions } from '../../lib/groups.js';

  // 自分が選ぶ場面（行動・対象・押し付け先など）のダイアログ。進行役の画面でも同じ選択が出ていて、先に答えたほうが有効
  let { p } = $props();   // PlayStore
  const req = $derived(p.req);
  let folded = $state(false);          // たたむと、タイトルの帯だけになり、盤面が全部見える
  // 選択中は、画面の下に「ボトムシート」として出す（盤面を隠さない）。シートの高さぶん、ページの下に余白をつくって、盤面を最後までスクロールして見られるようにする
  $effect(() => {
    if (!req) { folded = false; document.body.classList.remove('ask-open', 'ask-folded'); return; }
    document.body.classList.add('ask-open'); document.body.classList.toggle('ask-folded', folded);
    return () => document.body.classList.remove('ask-open', 'ask-folded');
  });
  $effect(() => { req?.qid; folded = false; });         // 新しい選択が出たら、開いた状態から始める

  function onkey(e) {
    if (!req) return;
    const n = parseInt(e.key);
    if (n >= 1 && n <= req.options.length) { e.preventDefault(); p.answer(n - 1); }
  }
</script>

<svelte:window onkeydown={onkey} />

{#if req}
  <div class="sheetwrap" role="presentation">
    <div class="dlg" class:folded transition:fly={{ y: 40, duration: 160 }} role="dialog" aria-label={req.title}>
      <div class="asktop">
        <span class="you">あなたの番です</span>
        <button class="fold" type="button" onclick={() => (folded = !folded)} aria-expanded={!folded}>{folded ? '▲ 選択を開く' : '▼ 盤面を見る'}</button>
      </div>
      <h3>{req.title}</h3>
      {#if !folded}
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
      {/if}
    </div>
  </div>
{/if}

<style>
  /* 下に固定のシート。背景は暗くせず、シートの外は触れる（盤面をスクロールして見られる） */
  .sheetwrap{position:fixed;left:0;right:0;bottom:0;display:flex;justify-content:center;padding:0 8px 8px;z-index:75;pointer-events:none}
  .dlg{pointer-events:auto;background:var(--s1);border:1px solid var(--gold);border-radius:16px;padding:12px 14px 14px;max-width:560px;width:100%;max-height:50dvh;overflow:auto;box-shadow:0 -8px 30px #000b}
  .dlg.folded{padding-bottom:10px}
  .asktop{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px}
  .fold{background:var(--s2);border:1px solid var(--line2);border-radius:999px;padding:4px 12px;font-size:.78rem;font-weight:700;color:var(--tx);cursor:pointer}
  .you{display:inline-block;background:var(--gold);color:#2a1c06;font-weight:800;font-size:.75rem;border-radius:999px;padding:2px 10px}
  h3{font-size:1.15rem;color:var(--gold)}
  .sub{color:var(--mut);font-size:.85rem;margin-top:2px}
  .opts{display:grid;gap:6px;margin-top:8px}
  .gh{margin:10px 2px 0;font-size:.82rem;font-weight:800;letter-spacing:.08em;display:flex;align-items:center;gap:8px;color:#9cc8ee}.gh.foe{color:#ff9aa2}
  .gh::after{content:"";flex:1;height:1px;background:currentColor;opacity:.35}
  .gh:first-child{margin-top:0}
  .opt{display:flex;align-items:center;gap:12px;background:var(--s2);border:1px solid var(--line2);border-radius:10px;padding:10px 14px;text-align:left;cursor:pointer;min-height:48px}
  .opt:active:not(:disabled){border-color:var(--gold);background:var(--s3)}
  .opt:disabled{opacity:.35}
  .opt.foe{border-color:var(--red-d)}.opt.ghost{background:transparent}.opt.ok{border-color:var(--grn-d)}.opt.item{border-color:var(--gold-d,#b8923a);background:#b8923a1f}
  .uic{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-size:1.3rem;background:#120f0c;border:2px solid var(--blu-d);flex:none}
  .uic.foe{border-color:var(--red-d)}.uic.dead{filter:grayscale(1);opacity:.6}
  .tx b{display:block}.tx small{display:block;color:var(--mut);font-weight:400;font-size:.82rem}
  h3{font-size:1.02rem}
</style>
