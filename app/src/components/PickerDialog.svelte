<script>
  import { fade, scale } from 'svelte/transition';
  import { picker, closePicker } from '../lib/stores/ui.svelte.js';
  import { icon } from '../lib/icons.js';
  import { JOB, BOSS, ITEMS, bossIdOf } from '../lib/engine.js';
  import Catalog from './Catalog.svelte';

  // 職業・魔王・アイテムを選ぶ画面。一覧は、ルール一覧と同じ部品（Catalog）。下の「選ぶ」で決め、「キャンセル」でやめる
  const req = $derived(picker.req);
  let chosen = $state(null), tab = $state('jobs');
  let lastReq = null;
  $effect(() => {
    if (req && req !== lastReq) { lastReq = req; chosen = req.value; tab = req.kind === 'item' ? 'items' : bossIdOf(req.value) ? 'boss' : 'jobs'; }
    if (!req) lastReq = null;
  });
  const TABS = $derived(req?.kind === 'job' ? [['jobs', '職業'], ...(req.bosses ? [['boss', '魔王']] : [])] : []);
  const nameOf = k => (!k ? '' : bossIdOf(k) ? BOSS[bossIdOf(k)].n : JOB[k]?.n ?? ITEMS[k]?.n ?? '');
  const done = k => closePicker(k ?? chosen);
  function onkey(e) {
    if (!req) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePicker(null); }
    else if (e.key === 'Enter' && chosen) { e.preventDefault(); done(); }
  }
</script>

<svelte:window onkeydown={onkey} />

{#if req}
  <div class="backdrop" transition:fade={{ duration: 120 }} onmousedown={(e) => e.target === e.currentTarget && closePicker(null)} role="presentation">
    <div class="dlg" transition:scale={{ start: .96, duration: 140 }} role="dialog" aria-modal="true" aria-label={req.kind === 'item' ? 'アイテムを選ぶ' : '職業を選ぶ'}>
      <div class="head">
        {#if TABS.length > 1}
          <div class="tabs" role="tablist">{#each TABS as [k, n]}<button role="tab" aria-selected={tab === k} class:on={tab === k} onclick={() => (tab = k)}>{n}</button>{/each}</div>
        {:else}<b class="ttl">{req.kind === 'item' ? 'アイテムを選ぶ' : '職業を選ぶ'}</b>{/if}
        <button class="btn sm cancel" onclick={() => closePicker(null)}>キャンセル<kbd>Esc</kbd></button>
      </div>
      <div class="body">
        {#key tab}<Catalog kind={tab} value={chosen} onselect={(k) => (chosen = k)} ondone={done} />{/key}
      </div>
      <div class="pbar">
        <div class="cur">{#if chosen}<span class="ic">{#if ITEMS[chosen]}{ITEMS[chosen].ic}{:else}{@html icon(chosen)}{/if}</span><b>{nameOf(chosen)}</b>{:else}<span class="none">選んでください</span>{/if}</div>
        <button class="btn primary" disabled={!chosen} onclick={() => done()}>選ぶ</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop{position:fixed;inset:0;background:#000b;display:flex;align-items:center;justify-content:center;padding:12px;z-index:95}
  .dlg{background:var(--s1);border:1px solid var(--gold);border-radius:16px;max-width:720px;width:100%;max-height:92dvh;display:flex;flex-direction:column;overflow:hidden}
  .head{flex:none;display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line)}
  .ttl{color:var(--gold);font-size:1.05rem}
  .cancel{margin-left:auto;flex:none}
  .tabs{display:flex;gap:6px;flex-wrap:wrap}
  .tabs button{background:var(--s2);border:1px solid var(--line);border-radius:999px;padding:7px 18px;font-weight:700;cursor:pointer;color:var(--mut)}
  .tabs button.on{background:var(--gold);color:#2a1c06;border-color:var(--gold)}
  .body{overflow:auto;padding:14px 16px 18px;flex:1;min-height:0}
  .pbar{flex:none;display:flex;align-items:center;gap:10px;padding:10px 14px calc(10px + env(safe-area-inset-bottom));border-top:1px solid var(--line);background:var(--s1)}
  .cur{display:flex;align-items:center;gap:8px;flex:1;min-width:0}
  .cur b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ic{width:32px;height:32px;flex:none;border-radius:50%;display:grid;place-items:center;font-size:1.1rem;background:#120f0c;border:2px solid var(--line2)}
  .none{color:var(--dim);font-size:.88rem}
  .pbar .btn{flex:none;min-width:5.5em}
  @media(max-width:560px){.tabs button{padding:6px 14px}.pbar{gap:8px}.pbar kbd{display:none}}
</style>
