<script>
  import { slide } from 'svelte/transition';
  import { icon } from '../../lib/icons.js';
  import { JOB, SELECTABLE } from '../../lib/engine.js';

  // CPUチーム戦: 相手の職業を並べる（1〜6体）
  let { host } = $props();
  const MAX = 6;
  const PRESETS = [
    { n: '基本の3人', foes: ['warrior', 'monk', 'mage'] },
    { n: '守りの布陣', foes: ['tank', 'monk', 'cleric', 'warrior'] },
    { n: '攻めの布陣', foes: ['bm', 'berserker', 'mw'] },
  ];
  const add = () => { if (host.foes.length < MAX) host.foes.push('warrior'); };
  const del = i => { if (host.foes.length > 1) host.foes.splice(i, 1); };
</script>

<div class="panel" transition:slide={{ duration: 160 }}>
  <h3>相手のCPUチーム <span class="chip">{host.foes.length}体</span></h3>
  <div class="presets">
    {#each PRESETS as pr}<button class="btn ghost sm" onclick={() => (host.foes = [...pr.foes])}>{pr.n}</button>{/each}
  </div>
  {#each host.foes as _, i}
    <div class="frow">
      <span class="fi">{@html icon(host.foes[i])}</span>
      <select class="input" bind:value={host.foes[i]} aria-label="CPUの職業">
        {#each SELECTABLE as j}<option value={j}>{JOB[j].n}（ATK{JOB[j].atk} / HP{JOB[j].hp}）</option>{/each}
      </select>
      <button class="btn ghost sm" onclick={() => del(i)} disabled={host.foes.length <= 1} aria-label="外す">✕</button>
    </div>
  {/each}
  <button class="btn ghost sm" onclick={add} disabled={host.foes.length >= MAX}>＋ CPUを追加</button>
  <div class="sub">{JOB[host.foes[0]]?.d}</div>
</div>

<style>
  .presets{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
  .frow{display:flex;align-items:center;gap:8px;margin-bottom:8px}
  .fi{width:38px;height:38px;flex:none;border-radius:50%;display:grid;place-items:center;font-size:1.3rem;background:#120f0c;border:2px solid var(--red-d)}
  .frow select{flex:1;min-width:0}
  .sub{margin-top:8px}
</style>
