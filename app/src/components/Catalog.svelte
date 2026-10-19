<script>
  import { slide } from 'svelte/transition';
  import { icon } from '../lib/icons.js';
  import { JOB, BOSS, JOB_GROUPS, ITEMS, ITEM_GROUPS } from '../lib/engine.js';

  // 職業・魔王・アイテムの一覧（ルール一覧と、選択ダイアログで共通）。
  // kind: 'jobs' | 'boss' | 'items' ／ onselect があれば「選べる一覧」（value が選択中。二度押し・ダブルクリックは ondone）
  let { kind, value = null, onselect = null, ondone = null } = $props();
  const selectable = $derived(!!onselect);
  // svelte-ignore state_referenced_locally
  let open = $state(value);      // 説明を開いている職業
  const pick = k => { if (selectable) { onselect(k); open = k; } else open = open === k ? null : k; };
</script>

{#if kind === 'jobs'}
  {#each JOB_GROUPS as g}
    <h4>{g.n}</h4>
    <div class="grid">
      {#each g.keys as k}
        {@const j = JOB[k]}
        <button class="job" class:on={open === k} class:sel={selectable && value === k} aria-pressed={selectable ? value === k : undefined} onclick={() => pick(k)} ondblclick={() => selectable && ondone?.(k)}>
          <span class="av">{@html icon(k)}</span>
          <span class="tx"><b>{j.n}</b><small>ATK {j.atk} ／ HP {j.hp}</small></span>
        </button>
        {#if open === k}<div class="desc">{@html icon(k)}<p><b>{j.n}</b>　{j.d}</p></div>{/if}
      {/each}
    </div>
  {/each}
  <div class="hint">{selectable ? '職業をタップすると、説明が開きます。決まったら、下の「選ぶ」を押します。' : '職業をタップすると、くわしい説明が開きます。'}</div>
{:else if kind === 'items'}
  {#each ITEM_GROUPS as g}
    <h4>{g.n}</h4>
    <div class="grid2">
      {#each g.keys as k}
        {@const it = ITEMS[k]}
        {#if selectable}
          <button class="item btn-like" class:sel={value === k} aria-pressed={value === k} onclick={() => pick(k)} ondblclick={() => ondone?.(k)}>
            <span class="ic">{it.ic}</span><span><b>{it.n}</b><small>{it.d}</small></span>
          </button>
        {:else}
          <div class="item"><span class="ic">{it.ic}</span><span><b>{it.n}</b><small>{it.d}</small></span></div>
        {/if}
      {/each}
    </div>
  {/each}
{:else}
  {#each Object.entries(BOSS) as [k, b]}
    {@const key = 'boss' + k}
    <div class="boss" class:open={open === key} class:sel={selectable && value === key}>
      <button type="button" class="bh" aria-expanded={open === key} aria-pressed={selectable ? value === key : undefined} onclick={() => pick(key)} ondblclick={() => selectable && ondone?.(key)}>
        <span class="av foe">{@html icon(key)}</span>
        <span class="bt"><b>{b.n}</b><small>{b.intro}</small></span>
        <svg class="car" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      {#if open === key}
        <div class="det" transition:slide={{ duration: 120 }}>
          <div class="row"><span class="k">体力</span><span>{b.hpText}</span></div>
          {#each b.skills as sk}<div class="row"><span class="k">{sk.n}</span><span>{sk.d}</span></div>{/each}
          {#each b.traits as t}<div class="row"><span class="k tr">特性</span><span>{t}</span></div>{/each}
        </div>
      {/if}
    </div>
  {/each}
  <div class="hint">魔王をタップすると、技や特性が開きます。</div>
{/if}

<style>
  h4{margin:14px 2px 8px;color:var(--gold);font-size:.95rem;letter-spacing:.1em}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px}
  .job{display:flex;align-items:center;gap:10px;text-align:left;background:var(--s2);border:1px solid var(--line);border-radius:12px;padding:8px 10px;cursor:pointer;color:inherit}
  .job:hover{border-color:var(--line2)}.job.on{border-color:var(--gold);background:#3a2f1a}
  .job.sel,.item.sel,.boss.sel{border-color:var(--gold);background:#4a3a18;box-shadow:0 0 0 2px var(--gold)}
  .av{flex:none;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-size:1.45rem;background:#120f0c;border:2px solid var(--line2)}
  .av.foe{border-color:var(--red-d)}
  .tx b{display:block}.tx small{color:var(--mut);font-size:.74rem}
  .desc{grid-column:1/-1;display:flex;gap:12px;align-items:flex-start;background:#0004;border-left:3px solid var(--gold);border-radius:0 10px 10px 0;padding:10px 12px;font-size:.9rem;line-height:1.55}
  .desc :global(.ic){font-size:1.6rem;flex:none}.desc p{margin:0}.desc b{color:var(--gold)}
  .hint{text-align:center;color:var(--dim);font-size:.8rem;margin-top:12px}
  .boss{background:var(--s2);border:1px solid var(--line);border-radius:12px;margin-bottom:8px;overflow:hidden}
  .boss.open{border-color:var(--line2)}
  .bh{display:flex;gap:12px;align-items:center;width:100%;padding:10px 12px;background:none;border:0;cursor:pointer;text-align:left;color:inherit}
  .bt{min-width:0;flex:1}.bt b{display:block;font-size:1.02rem}.bt small{color:var(--mut);font-size:.8rem;line-height:1.4}
  .car{width:12px;height:8px;flex:none;color:var(--mut);transition:transform .15s}.boss.open .car{transform:rotate(180deg)}
  .det{display:flex;flex-direction:column;gap:6px;padding:0 12px 12px;font-size:.86rem}
  .btn-like{cursor:pointer}.btn-like:hover{border-color:var(--line2)}
  .row{display:grid;grid-template-columns:5.6em minmax(0,1fr);gap:8px;line-height:1.5}
  .k{font-weight:700;color:var(--gold);font-size:.78rem;background:#0004;border-radius:6px;padding:1px 6px;text-align:center;align-self:start}.k.tr{color:#ff9aa2}
  .grid2{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px}
  .item{display:flex;gap:10px;align-items:center;background:var(--s2);border:1px solid var(--line);border-radius:12px;padding:8px 10px;text-align:left;color:inherit}
  .item .ic{font-size:1.5rem;flex:none;width:34px;text-align:center}.item b{display:block;font-size:.9rem}.item small{color:var(--mut);font-size:.78rem;line-height:1.4}
</style>
