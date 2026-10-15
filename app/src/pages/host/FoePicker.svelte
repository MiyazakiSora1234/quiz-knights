<script>
  import { slide } from 'svelte/transition';
  import { icon } from '../../lib/icons.js';
  import { JOB, SELECTABLE, BOSS } from '../../lib/engine.js';
  import JobSelect from '../../components/JobSelect.svelte';

  // CPU戦: 相手を並べる（魔王も職業のCPUも、合わせて最大6体）。魔王は押して加える／外す
  let { host } = $props();
  const MAX = 6;
  const isBoss = f => /^boss\d+$/.test(f);
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
  {#each Object.entries(BOSS) as [id, b]}
    {@const on = host.foes.includes('boss' + id)}
    <div class="bopt" class:sel={on}>
      <button class="head" onclick={() => host.toggleBoss(+id)} aria-pressed={on}>
        <span class="bi">{@html icon('boss' + id)}</span>
        <span class="bt"><b>{b.n}</b><small>{b.intro}</small></span>
        <span class="ck">{on ? '✓' : '＋'}</span>
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
  .bopt{border:1px solid var(--line);border-radius:12px;background:var(--s2);margin-bottom:8px;transition:.1s}
  .bopt:hover{border-color:var(--line2)}
  .bopt.sel{border-color:var(--gold);background:#3a2f1a;box-shadow:0 0 0 1px var(--gold)}
  .head{display:flex;gap:12px;text-align:left;width:100%;padding:10px 12px;background:none;border:0;cursor:pointer;align-items:center}
  .bi{width:44px;height:44px;display:grid;place-items:center;border-radius:50%;background:#120f0c;border:2px solid var(--red-d);flex:none;font-size:1.7rem}
  .bopt.sel .bi{border-color:var(--gold)}
  .bt{flex:1;min-width:0}.bt b{display:block;font-size:1rem}.bt small{display:block;color:var(--mut);font-size:.78rem;line-height:1.4}
  .ck{flex:none;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#0004;color:var(--gold);font-weight:900}
  .detail{padding:0 12px 12px;display:flex;flex-direction:column;gap:6px;font-size:.84rem}
  .row{display:grid;grid-template-columns:5.6em 1fr;gap:8px;align-items:start;line-height:1.45}
  .k{font-weight:700;color:var(--gold);font-size:.78rem;background:#0004;border-radius:6px;padding:1px 6px;text-align:center}.k.tr{color:#ff9aa2}
  .frow{display:flex;align-items:center;gap:8px;margin-bottom:8px}
  .fi{width:38px;height:38px;flex:none;border-radius:50%;display:grid;place-items:center;font-size:1.3rem;background:#120f0c;border:2px solid var(--red-d)}
  .fsel{flex:1;min-width:0}
  .none{color:var(--dim);font-size:.85rem;margin-bottom:8px}
  .btns{display:flex;gap:6px;flex-wrap:wrap}
</style>
