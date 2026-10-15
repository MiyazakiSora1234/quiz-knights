<script>
  import { icon } from '../lib/icons.js';
  import { jobName } from '../lib/engine.js';

  let { u, sel = false, can = false, ribbon = '', onpick = null, seat = null, tags = [], compact = false, jobLabel = null } = $props();
  const label = $derived(jobLabel ?? jobName(u));

  let floats = $state([]);
  let anim = $state('');
  // svelte-ignore state_referenced_locally
  let prev = u.hp;
  $effect(() => {
    const hp = u.hp;
    if (hp === prev) return;
    const d = hp - prev; prev = hp;
    const id = Math.random();
    floats.push({ id, d });
    anim = d < 0 ? 'hit' : 'heal';
    setTimeout(() => { floats = floats.filter(f => f.id !== id); }, 1100);
    setTimeout(() => { anim = ''; }, 600);
  });

  const pct = $derived(Math.max(0, u.hp / u.maxHp * 100));
  const level = $derived(pct <= 25 ? 'crit' : pct <= 50 ? 'low' : '');
</script>

<button
  class="unit {u.side === 'e' ? 'foe' : 'ally'} {anim}"
  class:can class:sel class:dead={!u.alive} class:compact
  tabindex={can ? 0 : -1}
  disabled={!onpick}
  onclick={() => can && onpick?.(u)}
  aria-label="{u.name} {label} HP {u.hp}/{u.maxHp}"
  data-id={u.id}
>
  {#if ribbon}<div class="ribbon">{ribbon}</div>{/if}
  {#if seat != null}<div class="seat" title="席順（両隣の判定に使います）">{seat}</div>{/if}
  <div class="u-in">
    <div class="ic-wrap">{@html icon(u.isBoss ? 'boss' : u.job)}</div>
    <div class="nm">{u.name}</div>
    <div class="jb">{label}{u.isBoss || u.atk == null ? '' : ` ／ ATK ${u.atk}`}</div>
    <div class="bar {level}" style="margin-top:8px"><i style="width:{pct}%"></i></div>
    <div class="hp">HP <b>{Math.max(0, u.hp)}</b> / {u.maxHp}{u.alive ? '' : ' 💀'}</div>
    {#if tags.length}
      <div class="tags">{#each tags as t}<span class="tag {t.cls ?? ''}">{t.t}</span>{/each}</div>
    {/if}
  </div>
  {#each floats as f (f.id)}
    <div class="float {f.d < 0 ? 'd' : 'h'}">{f.d > 0 ? '+' : ''}{f.d}</div>
  {/each}
</button>

<style>
  .seat{position:absolute;top:3px;left:8px;z-index:3;font-size:.7rem;color:var(--mut);font-family:var(--display);font-weight:800;line-height:1.3}
  button:disabled{cursor:default;opacity:1}
  .compact .u-in{padding:24px 8px 20px}
  .compact .nm{font-size:.92rem}
</style>
