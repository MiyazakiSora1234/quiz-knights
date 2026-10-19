<script>
  import { icon } from '../lib/icons.js';
  import { JOB, BOSS, JOB_GROUPS, ITEMS, ITEM_GROUPS } from '../lib/engine.js';

  // 職業・魔王・アイテムの一覧（ルール一覧と、選択ダイアログで共通）。
  // kind: 'jobs' | 'boss' | 'items' ／ onselect があれば「選べる一覧」（value が選択中。二度押し・ダブルクリックは ondone）
  let { kind, value = null, onselect = null, ondone = null } = $props();
  const selectable = $derived(!!onselect);
  // svelte-ignore state_referenced_locally
  let open = $state(value);      // 説明を出している職業・魔王（説明は、一覧の上に固定して出す。選んだ人の下に出ると、位置が変わって分かりにくいため）
  const pick = k => { open = k; if (selectable) onselect(k); };
  const boss = $derived(open && /^boss\d+$/.test(open) ? BOSS[+open.slice(4)] : null);
</script>

{#if kind === 'jobs'}
  <div class="fix" aria-live="polite">
    {#if open && JOB[open]}
      <span class="fav">{@html icon(open)}</span>
      <div class="ftx"><b>{JOB[open].n}<small>ATK {JOB[open].atk} ／ HP {JOB[open].hp}</small></b><p>{JOB[open].d}</p></div>
    {:else}<p class="ph">{selectable ? '職業をタップすると、ここに説明が出ます。決まったら、下の「選ぶ」を押します。' : '職業をタップすると、ここに説明が出ます。'}</p>{/if}
  </div>
  {#each JOB_GROUPS as g}
    <h4>{g.n}</h4>
    <div class="grid">
      {#each g.keys as k}
        {@const j = JOB[k]}
        <button class="job" class:on={open === k} class:sel={selectable && value === k} aria-pressed={selectable ? value === k : undefined} onclick={() => pick(k)} ondblclick={() => selectable && ondone?.(k)}>
          <span class="av">{@html icon(k)}</span>
          <span class="tx"><b>{j.n}</b><small>ATK {j.atk} ／ HP {j.hp}</small></span>
        </button>
      {/each}
    </div>
  {/each}
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
  <div class="fix fixb" aria-live="polite">
    {#if boss}
      <span class="fav foe">{@html icon(open)}</span>
      <div class="ftx">
        <b>{boss.n}<small>{boss.intro}</small></b>
        <div class="row"><span class="k">体力</span><span>{boss.hpText}</span></div>
        {#each boss.skills as sk}<div class="row"><span class="k">{sk.n}</span><span>{sk.d}</span></div>{/each}
        {#each boss.traits as t}<div class="row"><span class="k tr">特性</span><span>{t}</span></div>{/each}
      </div>
    {:else}<p class="ph">魔王をタップすると、ここに技や特性が出ます。</p>{/if}
  </div>
  {#each Object.entries(BOSS) as [k, b]}
    {@const key = 'boss' + k}
    <button type="button" class="bh" class:on={open === key} class:sel={selectable && value === key} aria-pressed={selectable ? value === key : undefined} onclick={() => pick(key)} ondblclick={() => selectable && ondone?.(key)}>
      <span class="av foe">{@html icon(key)}</span>
      <span class="bt"><b>{b.n}</b><small>{b.intro}</small></span>
    </button>
  {/each}
{/if}

<style>
  h4{margin:14px 2px 8px;color:var(--gold);font-size:.95rem;letter-spacing:.1em}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px}
  .job{display:flex;align-items:center;gap:10px;text-align:left;background:var(--s2);border:1px solid var(--line);border-radius:12px;padding:8px 10px;cursor:pointer;color:inherit}
  .job:hover{border-color:var(--line2)}.job.on{border-color:var(--gold);background:#3a2f1a}
  .job.sel,.item.sel{border-color:var(--gold);background:#4a3a18;box-shadow:0 0 0 2px var(--gold)}
  .av{flex:none;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-size:1.45rem;background:#120f0c;border:2px solid var(--line2)}
  .av.foe{border-color:var(--red-d)}
  .tx b{display:block}.tx small{color:var(--mut);font-size:.74rem}
  .hint{text-align:center;color:var(--dim);font-size:.8rem;margin-top:12px}
  /* 説明は、一覧の上に固定する（スクロールしても見える。選んだカードの下に出ると、並びが動いて分かりにくい） */
  .fix{position:sticky;top:-14px;z-index:3;display:flex;gap:12px;align-items:flex-start;margin:-14px -16px 6px;padding:12px 16px 10px;min-height:4.2em;background:var(--s1);border-bottom:1px solid var(--line);border-left:3px solid var(--gold);box-shadow:0 6px 14px #0007}
  .fixb{max-height:min(38vh,250px);overflow:auto}
  .fav{flex:none;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-size:1.6rem;background:#120f0c;border:2px solid var(--gold)}
  .fav.foe{border-color:var(--red-d)}
  .ftx{min-width:0;flex:1;display:flex;flex-direction:column;gap:5px;font-size:.88rem;line-height:1.5}
  .ftx b{color:var(--gold);font-size:1rem}.ftx b small{display:block;color:var(--mut);font-size:.78rem;font-weight:400}
  .ftx p{margin:0}
  .ph{margin:auto 0;color:var(--dim);font-size:.85rem}
  .bh{display:flex;gap:12px;align-items:center;width:100%;padding:10px 12px;margin-bottom:8px;background:var(--s2);border:1px solid var(--line);border-radius:12px;cursor:pointer;text-align:left;color:inherit}
  .bh:hover{border-color:var(--line2)}.bh.on{border-color:var(--gold);background:#3a2f1a}.bh.sel{border-color:var(--gold);background:#4a3a18;box-shadow:0 0 0 2px var(--gold)}
  .bt{min-width:0;flex:1}.bt b{display:block;font-size:1.02rem}.bt small{color:var(--mut);font-size:.8rem;line-height:1.4}
  .btn-like{cursor:pointer}.btn-like:hover{border-color:var(--line2)}
  .row{display:grid;grid-template-columns:5.6em minmax(0,1fr);gap:8px;line-height:1.5}
  .k{font-weight:700;color:var(--gold);font-size:.78rem;background:#0004;border-radius:6px;padding:1px 6px;text-align:center;align-self:start}.k.tr{color:#ff9aa2}
  .grid2{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px}
  .item{display:flex;gap:10px;align-items:center;background:var(--s2);border:1px solid var(--line);border-radius:12px;padding:8px 10px;text-align:left;color:inherit}
  .item .ic{font-size:1.5rem;flex:none;width:34px;text-align:center}.item b{display:block;font-size:.9rem}.item small{color:var(--mut);font-size:.78rem;line-height:1.4}
</style>
