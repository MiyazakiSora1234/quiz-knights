<script>
  import { slide } from 'svelte/transition';
  import { icon } from '../../lib/icons.js';
  import { BOSS } from '../../lib/engine.js';

  let { host } = $props();
</script>

<div class="panel" transition:slide={{ duration: 160 }}>
  <h3>魔王を選ぶ</h3>
  {#each Object.entries(BOSS) as [id, b]}
    {@const on = host.boss == id}
    <div class="bopt" class:sel={on}>
      <button class="head" onclick={() => host.pickBoss(+id)} aria-pressed={on}>
        <span class="bi">{@html icon('boss' + id)}</span>
        <span class="bt"><b>{b.n}</b><small>{b.intro}</small></span>
      </button>
      {#if on}
        <div class="detail" transition:slide={{ duration: 140 }}>
          <div class="row"><span class="k">体力</span><span>{b.hpText}</span></div>
          {#each b.skills as s}<div class="row"><span class="k">{s.n}</span><span>{s.d}</span></div>{/each}
          {#each b.traits as t}<div class="row"><span class="k tr">特性</span><span>{t}</span></div>{/each}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .bopt{border:1px solid var(--line);border-radius:12px;background:var(--s2);margin-bottom:8px;transition:.1s}
  .bopt:hover{border-color:var(--line2)}
  .bopt.sel{border-color:var(--gold);background:#3a2f1a;box-shadow:0 0 0 1px var(--gold)}
  .head{display:flex;gap:12px;text-align:left;width:100%;padding:12px;background:none;border:0;cursor:pointer;align-items:center}
  .bi{width:48px;height:48px;display:grid;place-items:center;border-radius:50%;background:#120f0c;border:2px solid var(--red-d);flex:none;font-size:1.9rem}
  .bopt.sel .bi{border-color:var(--gold)}
  .bt b{display:block;font-size:1.02rem}.bt small{display:block;color:var(--mut);font-size:.8rem;line-height:1.4}
  .detail{padding:0 12px 12px;display:flex;flex-direction:column;gap:6px;font-size:.84rem}
  .row{display:grid;grid-template-columns:5.6em 1fr;gap:8px;align-items:start;line-height:1.45}
  .k{font-weight:700;color:var(--gold);font-size:.78rem;background:#0004;border-radius:6px;padding:1px 6px;text-align:center}
  .k.tr{color:#ff9aa2}
</style>
