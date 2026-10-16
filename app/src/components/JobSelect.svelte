<script>
  import { fade } from 'svelte/transition';
  import { icon } from '../lib/icons.js';
  import { JOB, SELECTABLE, BOSS, PLAYABLE_BOSS_KEYS, bossIdOf } from '../lib/engine.js';

  // 職業を選ぶドロップダウン（標準のセレクトの代わり）。アイコン・名前・攻撃/体力を見せる
  let { value = $bindable(), onchange, label = '職業', bosses = true } = $props();
  const ALL = $derived(bosses ? [...SELECTABLE, ...PLAYABLE_BOSS_KEYS] : SELECTABLE);
  const nameOf = j => bossIdOf(j) ? BOSS[bossIdOf(j)].n : JOB[j]?.n ?? '';
  const statOf = j => bossIdOf(j) ? '魔王' : `ATK${JOB[j]?.atk} / HP${JOB[j]?.hp}`;
  let open = $state(false), btn = $state(), listEl = $state(), pos = $state({ top: 0, left: 0, width: 0, up: false }), hi = $state(0);

  function toggle() {
    if (open) { open = false; return; }
    const r = btn.getBoundingClientRect();
    const up = innerHeight - r.bottom < 280 && r.top > innerHeight - r.bottom;
    pos = { top: up ? r.top : r.bottom, left: r.left, width: Math.max(r.width, 230), up };
    hi = Math.max(0, ALL.indexOf(value));
    open = true;
  }
  function dice() {
    const others = SELECTABLE.filter(j => j !== value);   // ランダムは通常の職業から
    pick(others[Math.floor(Math.random() * others.length)]);
  }
  function pick(j) { value = j; open = false; onchange?.(j); btn?.focus(); }
  function onkey(e) {
    if (!open) { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); toggle(); } return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); open = false; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); hi = Math.min(ALL.length - 1, hi + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); hi = Math.max(0, hi - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(ALL[hi]); }
  }
  $effect(() => {
    if (!open) return;
    // 外側（ページ）がスクロールされたら閉じる。リストの中のスクロールでは閉じない
    const onScroll = e => { if (!listEl?.contains(e.target)) open = false; };
    const close = () => { open = false; };
    addEventListener('scroll', onScroll, true); addEventListener('resize', close);
    return () => { removeEventListener('scroll', onScroll, true); removeEventListener('resize', close); };
  });
</script>

<div class="jw">
<button type="button" class="sel" bind:this={btn} onclick={toggle} onkeydown={onkey} aria-haspopup="listbox" aria-expanded={open} aria-label={label}>
  <span class="ic">{@html icon(value)}</span>
  <span class="nm">{nameOf(value)}</span>
  <span class="st">{statOf(value)}</span>
  <svg class="car" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
</button>
<button type="button" class="dice" onclick={dice} title="職業をランダムに決める" aria-label="ランダム">🎲</button>
</div>

{#if open}
  <div class="back" role="presentation" onclick={() => (open = false)}></div>
  <div class="list" bind:this={listEl} role="listbox" transition:fade={{ duration: 90 }}
    style="left:{pos.left}px;width:{pos.width}px;{pos.up ? `bottom:${innerHeight - pos.top + 4}px` : `top:${pos.top + 4}px`};max-height:{Math.min(320, (pos.up ? pos.top : innerHeight - pos.top) - 16)}px">
    {#each ALL as j, i}
      {#if i === SELECTABLE.length}<div class="gh">魔王として戦う</div>{/if}
      <button type="button" role="option" aria-selected={j === value} class="opt" class:cur={j === value} class:hi={i === hi} onmouseenter={() => (hi = i)} onclick={() => pick(j)}>
        <span class="ic">{@html icon(j)}</span>
        <span class="tx"><b>{nameOf(j)}</b><small>{statOf(j)}</small></span>
        {#if j === value}<span class="ck">✓</span>{/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  .jw{display:flex;gap:6px;align-items:stretch;min-width:0}
  .dice{flex:none;width:38px;border-radius:10px;border:1px solid var(--line2);background:var(--s2);cursor:pointer;font-size:1.1rem;padding:0}
  .dice:hover{border-color:var(--gold);background:var(--s3)}
  .jw{container:job / inline-size}
  .sel{display:flex;align-items:center;gap:8px;width:100%;min-width:0;background:var(--s1);border:1px solid var(--line2);border-radius:10px;padding:6px 10px;cursor:pointer;text-align:left;transition:border-color .1s}
  .sel:hover,.sel[aria-expanded="true"]{border-color:var(--gold)}
  .sel:focus-visible{outline:2px solid var(--gold);outline-offset:1px}
  .ic{width:28px;height:28px;flex:none;border-radius:50%;display:grid;place-items:center;font-size:1rem;background:#120f0c;border:1.5px solid var(--line2)}
  .nm{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:0 1 auto}
  .st{color:var(--mut);font-size:.74rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1 1 0;min-width:0}
  @container job (max-width: 250px){.st{display:none}}
  .car{width:12px;height:8px;flex:none;color:var(--mut);margin-left:auto}
  .back{position:fixed;inset:0;z-index:90}
  .list{position:fixed;z-index:91;overflow:auto;background:var(--s1);border:1px solid var(--gold);border-radius:12px;padding:4px;box-shadow:0 14px 34px #000d}
  .opt{display:flex;align-items:center;gap:10px;width:100%;padding:7px 10px;background:none;border:0;border-radius:8px;cursor:pointer;text-align:left}
  .opt.hi{background:var(--s3)}.opt.cur .tx b{color:var(--gold)}
  .tx{min-width:0}.tx b{display:block;font-size:.92rem}.tx small{color:var(--mut);font-size:.74rem}
  .gh{margin:8px 8px 2px;color:#ff9aa2;font-size:.74rem;font-weight:800;letter-spacing:.1em}
  .ck{margin-left:auto;color:var(--gold);font-weight:800}
</style>
