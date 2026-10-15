<script>
  import { slide } from 'svelte/transition';
  import { icon } from '../../lib/icons.js';
  import { BOSS } from '../../lib/engine.js';

  let { host } = $props();
</script>

<div class="panel" transition:slide={{ duration: 160 }}>
  <h3>魔王を選ぶ</h3>
  {#each Object.entries(BOSS) as [id, b]}
    <button class="bopt" class:sel={host.boss == id} onclick={() => (host.boss = +id)}>
      <span class="bi">{@html icon('boss')}</span>
      <span><b>{b.n}</b><small>{b.d}</small></span>
    </button>
  {/each}
  <label class="switch"><input type="checkbox" bind:checked={host.penalty}><span>魔王も誤答で2ダメージを受ける</span></label>
</div>

<style>
  .bopt{display:flex;gap:12px;text-align:left;width:100%;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--s2);cursor:pointer;margin-bottom:8px;align-items:flex-start;transition:.1s}
  .bopt:hover{border-color:var(--line2)}
  .bopt.sel{border-color:var(--gold);background:#3a2f1a;box-shadow:0 0 0 1px var(--gold)}
  .bi{font-size:1.8rem;width:44px;height:44px;display:grid;place-items:center;border-radius:50%;background:#120f0c;border:2px solid var(--red-d);flex:none}
  .bopt.sel .bi{border-color:var(--gold)}
  b{display:block}small{display:block;color:var(--mut);font-size:.78rem;line-height:1.4}
  .switch{display:flex;align-items:center;gap:10px;margin-top:6px;cursor:pointer;font-size:.9rem}
  .switch input{width:18px;height:18px;accent-color:var(--gold)}
</style>
