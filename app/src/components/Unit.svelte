<script>
  import { icon } from '../lib/icons.js';
  import { jobName } from '../lib/engine.js';

  let { u, sel = false, can = false, ribbon = '', onpick = null, seat = null, tags = [], compact = false, jobLabel = null, bubble = '', acting = false, answering = false, dim = false, me = false } = $props();
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
  class="unit {u.side === 'e' ? 'foe' : u.side === 'c' ? 'third' : 'ally'} {anim}"
  class:can class:sel class:dead={!u.alive} class:compact class:acting class:answering class:dim class:me
  tabindex={can ? 0 : -1}
  disabled={!onpick}
  onclick={() => can && onpick?.(u)}
  aria-label="{u.name} {label} HP {u.hp}/{u.maxHp}"
  data-id={u.id}
>
  {#if ribbon}<div class="ribbon">{ribbon}</div>{/if}
  {#if seat != null}<div class="seat" title="席順（両隣の判定に使います）">{seat}</div>{/if}
  <div class="u-in">
    <div class="ic-wrap">{@html icon(u.isBoss ? `boss${u.bossId || 1}` : u.job)}</div>
    <div class="nm">{u.name}</div>
    <div class="jb">{label}{u.isBoss || u.atk == null ? '' : ` ／ ATK ${u.atk}`}</div>
    <div class="bar {level}" style="margin-top:8px"><i style="width:{pct}%"></i></div>
    <div class="hp">HP <b>{Math.max(0, u.hp)}</b> / {u.maxHp}{u.alive ? '' : ' 💀'}</div>
    {#if bubble}<div class="bubble" title={bubble}>{bubble}</div>{/if}
    {#if tags.length}
      <div class="tags">{#each tags as t}<span class="tag {t.cls ?? ''}">{t.t}</span>{/each}</div>
    {/if}
  </div>
  {#each floats as f (f.id)}
    <div class="float {f.d < 0 ? 'd' : 'h'}">{f.d > 0 ? '+' : ''}{f.d}</div>
  {/each}
</button>

<style>
  .me:not(.answering){--team:#7fd6e8;filter:drop-shadow(0 0 10px #7fd6e888)}
  .me:not(.answering) .ribbon{background:#7fd6e8;color:#06232b}
  .answering{z-index:6;transform:scale(1.07);border-color:var(--gold);animation:ans 1.1s ease-in-out infinite;filter:brightness(1.12)}
  @keyframes ans{0%,100%{box-shadow:0 0 0 2px #f0c964,0 0 18px 2px #e3b84f88}50%{box-shadow:0 0 0 3px #fff3c0,0 0 40px 10px #e3b84fcc}}
  .answering .ribbon{background:linear-gradient(180deg,#fff3c0,#e3b84f)!important;color:#2a1c06!important;font-size:.9rem!important;font-weight:900!important;letter-spacing:.12em}
  .dim{opacity:.55;filter:saturate(.7)}
  .acting{animation:act 0.9s ease-in-out infinite;z-index:5}
  @keyframes act{0%,100%{box-shadow:0 0 0 0 #ff4d5e00;transform:scale(1)}50%{box-shadow:0 0 34px 8px #ff4d5eaa;transform:scale(1.06)}}
  .bubble{margin-top:8px;max-width:100%;background:var(--gold);color:#2a1c06;font-weight:800;font-size:.85rem;line-height:1.3;padding:4px 9px;border-radius:10px;text-align:center;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;box-shadow:0 3px 10px #0008}
  .seat{position:absolute;top:3px;left:8px;z-index:3;font-size:.7rem;color:var(--mut);font-family:var(--display);font-weight:800;line-height:1.3}
  button:disabled{cursor:default;opacity:1}
  .compact .u-in{padding:24px 8px 20px}
  .compact .nm{font-size:.92rem}
</style>
