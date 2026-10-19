<script>
  import { icon } from '../../lib/icons.js';
  import { nm, iconKey } from '../../lib/engine.js';

  // 進行パネル。正解・誤答・スルーの位置は、状態が変わっても動かない
  let { host, G } = $props();
  const sel = $derived(G.sel != null ? G.units.find(u => u.id === G.sel) : null);
</script>

<div class="ctl panel" class:answering={!!sel}>
  {#if G.over}
    <div class="state">バトル終了</div>
  {:else}
    <div class="state"><span class="dot {sel ? 'warn' : 'blue'}"></span><span>{sel ? '回答中' : '早押し受付中…'}</span></div>
    <div class="who" class:none={!sel}>
      {#if sel}<span class="wi">{@html icon(iconKey(sel))}</span>{nm(sel)}{:else}押された人がここに表示されます{/if}
    </div>
    <div class="rank">{host.rank}</div>
    <div class="main">
      <button class="btn ok xl" disabled={!sel || host.busy} onclick={() => host.correct()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg><span>正解<kbd>O</kbd></span>
      </button>
      <button class="btn ng xl" disabled={!sel || host.busy} onclick={() => host.wrong()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l14 14M19 5L5 19"/></svg><span>誤答<kbd>X</kbd></span>
      </button>
    </div>
    <div class="sub">
      <button class="btn" disabled={host.busy} onclick={() => host.skip()} title="誰も答えなかった">問題スルー<kbd>S</kbd></button>
      <button class="btn ghost" disabled={host.busy} onclick={() => (sel ? host.deselect() : host.reopen())}>{sel ? '選び直す' : '受付やり直し'}<kbd>R</kbd></button>
    </div>
  {/if}
</div>

<style>
  .ctl{padding:16px;display:flex;flex-direction:column;gap:12px;transition:.15s}
  .ctl.answering{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold),0 0 28px #e3b84f33}
  .state{display:flex;align-items:center;gap:8px;color:var(--mut);font-size:.9rem;font-weight:500}
  .state .dot.blue{background:var(--blu);box-shadow:0 0 8px var(--blu);animation:pl 1.2s infinite}
  .ctl.answering .state{color:var(--gold)}
  @keyframes pl{50%{opacity:.35}}
  .who{font-family:var(--serif);font-size:1.45rem;font-weight:800;min-height:2.4rem;line-height:1.2;display:flex;align-items:center;gap:10px}
  .who.none{color:var(--dim);font-size:1rem;font-family:var(--sans);font-weight:400}
  .wi{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;font-size:1.4rem;background:#120f0c;border:2px solid var(--gold);flex:none}
  .rank{font-size:.8rem;color:var(--mut);min-height:1.2em}
  .main{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}
  .main .btn{flex-direction:column;gap:2px;padding:16px 8px}
  .main svg{width:26px;height:26px}
  .main kbd{font-size:.65rem}
  .sub{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}
  @media(max-width:900px){
    kbd{display:none}
    .ctl{padding:10px;gap:8px}.who{font-size:1.15rem;min-height:1.8rem}
    .main .btn{flex-direction:row;padding:12px 8px;gap:8px}
  }
  /* 背の低い画面（小さいスマホ・横向き）では、画面を押さえすぎないように小さくする */
  @media(max-width:900px) and (max-height:700px){
    .ctl{padding:8px;gap:6px}.who{min-height:1.4rem;font-size:1rem}.who.none{display:none}
    .main,.sub{gap:6px}.main .btn{padding:8px 6px}.main svg{width:20px;height:20px}.sub .btn{padding:6px 8px}
  }
</style>
