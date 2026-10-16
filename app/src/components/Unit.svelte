<script>
  import { icon } from '../lib/icons.js';
  import { jobName } from '../lib/engine.js';

  let { u, sel = false, can = false, ribbon = '', onpick = null, seat = null, tags = [], compact = false, jobLabel = null, bubble = '', acting = false, answering = false, dim = false, me = false } = $props();
  const label = $derived(jobLabel ?? jobName(u));

  let floats = $state([]);
  let fx = $state([]);          // 攻撃を受けた／回復したときの演出 [{id, kind}]
  // svelte-ignore state_referenced_locally
  let prevAlive = u.alive;
  let anim = $state('');
  // svelte-ignore state_referenced_locally
  let prev = u.hp;
  // 倒れた・復活した瞬間の演出
  $effect(() => {
    const alive = u.alive;
    if (alive === prevAlive) return;
    prevAlive = alive;
    const id = Math.random();
    fx.push({ id, kind: alive ? 'revive' : 'ko' });
    setTimeout(() => { fx = fx.filter(f => f.id !== id); }, 1400);
  });
  $effect(() => {
    const hp = u.hp;
    if (hp === prev) return;
    const d = hp - prev; prev = hp;
    const id = Math.random();
    floats.push({ id, d });
    fx.push({ id, kind: d < 0 ? 'hit' : 'heal', big: Math.abs(d) >= 4 });
    setTimeout(() => { fx = fx.filter(f => f.id !== id); }, 900);
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
  <div class="u-in" class:shake={anim === 'hit'} class:glow={anim === 'heal'}>
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
  {#each fx as f (f.id)}
    {#if f.kind === 'ko'}
      <div class="fx ko" aria-hidden="true"><i class="flash dark"></i><b class="stamp">戦闘不能</b></div>
    {:else if f.kind === 'revive'}
      <div class="fx heal" aria-hidden="true"><i class="flash"></i><b class="stamp up">復活！</b><b class="p p1">✦</b><b class="p p2">✚</b><b class="p p3">✦</b></div>
    {:else if f.kind === 'hit'}
      <div class="fx hit" class:big={f.big} aria-hidden="true"><i class="flash"></i><svg viewBox="0 0 100 100" class="slash"><path d="M12 14L88 86" /><path d="M30 10L92 62" /><path d="M8 38L66 90" /></svg></div>
    {:else}
      <div class="fx heal" aria-hidden="true"><i class="flash"></i><b class="p p1">✚</b><b class="p p2">✚</b><b class="p p3">✦</b><b class="p p4">✚</b></div>
    {/if}
  {/each}
  {#each floats as f (f.id)}
    <div class="float {f.d < 0 ? 'd' : 'h'}">{f.d > 0 ? '+' : ''}{f.d}</div>
  {/each}
</button>

<style>
  /* 攻撃を受けた: 赤くフラッシュ・斬撃・内側が揺れる／回復: 緑の光と、立ちのぼる✚ */
  .fx{position:absolute;inset:0;pointer-events:none;z-index:4;overflow:hidden}
  .fx .flash{position:absolute;inset:0;animation:flash .55s ease-out forwards}
  .fx.hit .flash{background:radial-gradient(circle at 50% 45%,#ff3b4ccc,#ff3b4c55 55%,#0000 75%)}
  .fx.hit.big .flash{background:radial-gradient(circle at 50% 45%,#ff2030ee,#ff203088 60%,#ff203033)}
  .fx.heal .flash{background:radial-gradient(circle at 50% 50%,#6dff9acc,#40ff8055 55%,#0000 75%)}
  .slash{position:absolute;inset:8% 6%;width:88%;height:84%;overflow:visible}
  .slash path{fill:none;stroke:#fff;stroke-width:5;stroke-linecap:round;stroke-dasharray:130;stroke-dashoffset:130;filter:drop-shadow(0 0 6px #ff6070);animation:cut .35s ease-out forwards}
  .slash path:nth-child(2){animation-delay:.06s}.slash path:nth-child(3){animation-delay:.12s}
  .p{position:absolute;bottom:18%;color:#b8ffd0;font-size:1.1rem;text-shadow:0 0 8px #40ff80;opacity:0;animation:rise .8s ease-out forwards}
  .p1{left:22%}.p2{left:48%;animation-delay:.1s}.p3{left:70%;animation-delay:.2s}.p4{left:36%;animation-delay:.3s;font-size:.9rem}
  .fx.ko .flash.dark{background:radial-gradient(circle,#000a,#000d);animation:flash 1.3s ease-out forwards}
  .stamp{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%) rotate(-8deg);font-size:1.5rem;font-weight:900;letter-spacing:.1em;color:#ff7b86;border:3px solid #ff7b86;border-radius:8px;padding:2px 10px;background:#0009;white-space:nowrap;animation:stamp 1.3s ease-out forwards}
  .stamp.up{color:#b8ffd0;border-color:#6dff9a}
  @keyframes stamp{0%{opacity:0;transform:translate(-50%,-50%) rotate(-8deg) scale(2.2)}18%{opacity:1;transform:translate(-50%,-50%) rotate(-8deg) scale(1)}80%{opacity:1}100%{opacity:0}}
  .shake{animation:shake .45s}.glow{animation:glow .7s}
  @keyframes flash{0%{opacity:1}100%{opacity:0}}
  @keyframes cut{to{stroke-dashoffset:0}}
  @keyframes rise{0%{opacity:0;transform:translateY(8px) scale(.7)}25%{opacity:1}100%{opacity:0;transform:translateY(-70px) scale(1.15)}}
  @keyframes shake{0%,100%{transform:none}15%{transform:translate(-7px,2px)}35%{transform:translate(7px,-2px)}55%{transform:translate(-5px,1px)}75%{transform:translate(4px,0)}}
  @keyframes glow{0%,100%{filter:none}40%{filter:brightness(1.35) saturate(1.3)}}
  .unit{height:auto}
  .me:not(.answering){--team:#7fd6e8;filter:drop-shadow(0 0 10px #7fd6e888)}
  .me:not(.answering) .ribbon{background:#7fd6e8;color:#06232b}
  .answering{z-index:6;transform:scale(1.07);border-color:var(--gold);animation:ans 1.1s ease-in-out infinite;filter:brightness(1.12)}
  @keyframes ans{0%,100%{box-shadow:0 0 0 2px #f0c964,0 0 18px 2px #e3b84f88}50%{box-shadow:0 0 0 3px #fff3c0,0 0 40px 10px #e3b84fcc}}
  .answering .ribbon{background:linear-gradient(180deg,#fff3c0,#e3b84f)!important;color:#2a1c06!important;font-size:.9rem!important;font-weight:900!important;letter-spacing:.12em}
  .dim{opacity:.55;filter:saturate(.7)}
  .acting{animation:act 0.9s ease-in-out infinite;z-index:5}
  @keyframes act{0%,100%{box-shadow:0 0 0 0 #ff4d5e00;transform:scale(1)}50%{box-shadow:0 0 34px 8px #ff4d5eaa;transform:scale(1.06)}}
  .bubble{margin-top:8px;max-width:100%;background:var(--gold);color:#2a1c06;font-weight:800;font-size:.85rem;line-height:1.35;padding:4px 9px;border-radius:10px;text-align:center;overflow-wrap:anywhere;word-break:break-word;box-shadow:0 3px 10px #0008}
  .seat{position:absolute;top:3px;left:8px;z-index:3;font-size:.7rem;color:var(--mut);font-family:var(--display);font-weight:800;line-height:1.3}
  button:disabled{cursor:default;opacity:1}
  .compact .u-in{padding:24px 8px 20px}
  .compact .nm{font-size:.92rem}
</style>
