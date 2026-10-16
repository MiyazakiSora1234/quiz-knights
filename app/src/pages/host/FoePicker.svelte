<script>
  import { slide } from 'svelte/transition';
  import { icon } from '../../lib/icons.js';
  import { JOB, SELECTABLE, BOSS } from '../../lib/engine.js';
  import JobSelect from '../../components/JobSelect.svelte';

  // CPU戦: 相手を並べる（魔王も職業のCPUも、合わせて最大6体）。魔王は押して加える／外す
  let { host } = $props();
  const MAX = 6;
  const isBoss = f => /^boss\d+$/.test(f);
  // 魔王のくわしい説明は、最後に触った1体だけ下に出す（縦に長くならないように）
  let focus = $state(+(host.foes.find(isBoss) ?? 'boss1').slice(4));
  const toggle = id => { focus = id; host.toggleBoss(id); };
  const jobsIdx = $derived(host.foes.map((f, i) => [f, i]).filter(([f]) => !isBoss(f)));
  const PRESETS = [
    { n: '魔王1だけ', foes: ['boss1'] },
    { n: '基本の3人', foes: ['warrior', 'monk', 'mage'] },
    { n: '守りの布陣', foes: ['tank', 'monk', 'cleric', 'warrior'] },
    { n: '魔王とお供', foes: ['boss1', 'warrior', 'monk'] },
  ];
  const add = () => { if (host.foes.length < MAX) host.foes.push('warrior'); };
  const del = i => { if (host.foes.length > 1) host.foes.splice(i, 1); };
  const random = () => { host.foes = host.foes.map(f => (isBoss(f) ? f : SELECTABLE[Math.floor(Math.random() * SELECTABLE.length)])); };
</script>

<div class="panel" transition:slide={{ duration: 160 }}>
  <h3>戦う相手 <span class="chip">{host.foes.length}体</span></h3>
  <div class="presets">
    {#each PRESETS as pr}<button class="btn ghost sm" onclick={() => (host.foes = [...pr.foes])}>{pr.n}</button>{/each}
  </div>

  <div class="sec">魔王（押して加える・外す）</div>
  <div class="bgrid">
    {#each Object.entries(BOSS) as [id, b]}
      {@const on = host.foes.includes('boss' + id)}
      <button class="bchip" class:sel={on} class:foc={focus === +id} onclick={() => toggle(+id)} onmouseenter={() => (focus = +id)} aria-pressed={on} title={b.intro}>
        <span class="bi">{@html icon('boss' + id)}</span><b>{b.n}</b><span class="ck">{on ? '✓' : ''}</span>
      </button>
    {/each}
  </div>
  {#if BOSS[focus]}
    {@const b = BOSS[focus]}
    <div class="detail" transition:slide={{ duration: 120 }}>
      <div class="dh"><span class="bi sm">{@html icon('boss' + focus)}</span><div><b>{b.n}</b><small>{b.intro}</small></div></div>
      <div class="row"><span class="k">体力</span><span>{b.hpText}</span></div>
      {#each b.skills as sk}<div class="row"><span class="k">{sk.n}</span><span>{sk.d}</span></div>{/each}
      {#each b.traits as t}<div class="row"><span class="k tr">特性</span><span>{t}</span></div>{/each}
    </div>
  {/if}

  <div class="sec">CPUの職業</div>
  {#each jobsIdx as [f, i] (i)}
    <div class="frow">
      <span class="fi">{@html icon(host.foes[i])}</span>
      <div class="fsel"><JobSelect bind:value={host.foes[i]} label="CPUの職業" /></div>
      <button class="btn ghost sm" onclick={() => del(i)} disabled={host.foes.length <= 1} aria-label="外す">✕</button>
    </div>
  {:else}<div class="none">職業のCPUはいません</div>{/each}
  <div class="btns">
    <button class="btn ghost sm" onclick={add} disabled={host.foes.length >= MAX}>＋ 職業のCPUを追加</button>
    <button class="btn ghost sm" onclick={random} disabled={!jobsIdx.length}>🎲 職業をランダムに</button>
  </div>
</div>

<style>
  .presets{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
  .sec{margin:12px 2px 6px;color:var(--gold);font-weight:700;font-size:.85rem}
  .bgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
  .bchip{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px;background:var(--s2);border:1px solid var(--line);border-radius:12px;cursor:pointer}
  .bchip:hover,.bchip.foc{border-color:var(--line2)}
  .bchip.sel{border-color:var(--gold);background:#3a2f1a;box-shadow:0 0 0 1px var(--gold)}
  .bchip b{font-size:.85rem}
  .bi{width:40px;height:40px;display:grid;place-items:center;border-radius:50%;background:#120f0c;border:2px solid var(--red-d);flex:none;font-size:1.5rem}
  .bi.sm{width:34px;height:34px;font-size:1.2rem}
  .bchip.sel .bi{border-color:var(--gold)}
  .ck{position:absolute;top:4px;right:6px;color:var(--gold);font-weight:900;font-size:.85rem}
  .detail{margin:8px 0 4px;padding:10px 12px;background:#0003;border:1px solid var(--line);border-radius:12px;display:flex;flex-direction:column;gap:6px;font-size:.83rem}
  .dh{display:flex;gap:10px;align-items:center}.dh b{display:block}.dh small{color:var(--mut);font-size:.78rem;line-height:1.35}
  .row{display:grid;grid-template-columns:5.2em 1fr;gap:8px;align-items:start;line-height:1.45}
  .k{font-weight:700;color:var(--gold);font-size:.76rem;background:#0004;border-radius:6px;padding:1px 6px;text-align:center}.k.tr{color:#ff9aa2}
  .frow{display:flex;align-items:center;gap:8px;margin-bottom:8px}
  .fi{width:38px;height:38px;flex:none;border-radius:50%;display:grid;place-items:center;font-size:1.3rem;background:#120f0c;border:2px solid var(--red-d)}
  .fsel{flex:1;min-width:0}
  .none{color:var(--dim);font-size:.85rem;margin-bottom:8px}
  .btns{display:flex;gap:6px;flex-wrap:wrap}
</style>
