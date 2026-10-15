<script>
  import { icon } from '../../lib/icons.js';

  let { me } = $props();   // 自分のユニット。観戦中は null
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
</style>
