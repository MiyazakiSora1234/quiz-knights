<script>
  import { icon } from '../../lib/icons.js';
  import { ITEMS } from '../../lib/engine.js';

  let { me, items = [] } = $props();   // 自分のユニット。観戦中は null
  const ratio = $derived(me ? me.hp / me.maxHp : 1);
  const level = $derived(ratio <= .25 ? 'crit' : ratio <= .5 ? 'low' : '');
</script>

<div class="me panel">
  {#if me}
    <div class="em">{@html icon(me.job)}</div>
    <div class="mi">
      <div class="nm">{me.name} <span class="sub">{me.jobName}</span></div>
      <div class="bar {level}"><i style="width:{Math.max(0, ratio * 100)}%"></i></div>
      <div class="st">HP <b>{Math.max(0, me.hp)}</b> / {me.maxHp}{me.restNow ? '　💤 今回は休み' : ''}{me.job === 'tank' ? `　🛡 守り×${me.guards}` : ''}{me.alive ? '' : me.ghost ? '　👻 幽霊（あと1回だけ答えられる）' : '　💀 戦闘不能'}</div>
      {#if items.length}<div class="its" aria-label="持ち物">🎒 {#each items as k}<span class="it" title={ITEMS[k]?.d}>{ITEMS[k]?.ic} {ITEMS[k]?.n}</span>{/each}</div>{/if}
    </div>
  {:else}
    <div class="sub">観戦中です（進行役が席に割り当てるとプレイヤーになります）</div>
  {/if}
</div>

<style>
  .me{display:flex;gap:14px;align-items:center;padding:12px 14px}
  .em{font-size:2rem;width:58px;height:58px;display:grid;place-items:center;border:2px solid var(--blu);border-radius:50%;background:radial-gradient(circle,#3b2f21,#17120d);flex:none}
  .mi{flex:1;min-width:0}
  .nm{font-weight:800;font-size:1.1rem}
  .bar{margin:6px 0}
  .st{font-size:.9rem;font-variant-numeric:tabular-nums}
  .its{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-top:6px;font-size:.78rem;color:var(--mut)}
  .it{background:#b8923a22;border:1px solid var(--gold-d);border-radius:999px;padding:1px 8px;color:var(--tx);white-space:nowrap}
</style>
