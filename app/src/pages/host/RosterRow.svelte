<script>
  import { icon } from '../../lib/icons.js';
  import { JOB } from '../../lib/engine.js';
  import JobSelect from '../../components/JobSelect.svelte';

  /** 名簿の1行。p は名簿の要素（直接書き換える）。pvp のときはチームも選べる */
  let { p, pvp, onremove, ontransfer } = $props();
</script>

<div class="rrow" class:pvp>
  <div class="av">{@html icon(p.job)}</div>
  <div class="rname">
    <input class="input" bind:value={p.name} oninput={() => (p.touchedName = true)} maxlength="12" aria-label="名前">
    <div class="sub"><span class="dot {p.pid ? (p.online ? 'on' : '') : 'warn'}"></span>{p.pid ? (p.online ? 'オンライン' : 'オフライン') : '手動追加'}{p.rtt != null && p.online ? ` ${p.rtt}ms` : ''} ・ ATK{JOB[p.job].atk} / HP{JOB[p.job].hp}{p.flavor ? ` ・ ${p.flavor}` : ''}</div>
  </div>
  <div class="jsel"><JobSelect bind:value={p.job} onchange={() => (p.touchedJob = true)} /></div>
  {#if pvp}
    <div class="seg">
      <button class="tp" class:sel={p.team === 'p'} onclick={() => { p.team = 'p'; p.touchedTeam = true; }}>チームA</button>
      <button class="te" class:sel={p.team === 'e'} onclick={() => { p.team = 'e'; p.touchedTeam = true; }}>チームB</button>
    </div>
  {/if}
  <div class="btns">
  {#if p.pid && p.online && ontransfer}<button class="btn ghost sm" onclick={ontransfer} title="この人に進行役を譲る" aria-label="進行役を譲る">👑</button>{/if}
  <button class="btn ghost sm" onclick={onremove} title={p.pid ? '退室させる' : '削除'} aria-label="削除">✕</button>
  </div>
</div>

<style>
  .rrow{display:grid;grid-template-columns:44px minmax(110px,1fr) minmax(130px,176px) auto;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;margin-bottom:8px;background:var(--s2)}
  .rrow.pvp{grid-template-columns:44px minmax(110px,1fr) minmax(130px,176px) auto auto}
  .btns{display:flex;gap:4px}
  .av{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-size:1.5rem;background:#120f0c;border:2px solid var(--line2)}
  .rname{min-width:0}.rname .input{padding:6px 10px;font-weight:700}
  .rname .sub{display:flex;align-items:center;gap:6px;margin-top:3px}
  .jsel{min-width:0}
  .seg button{padding:6px 12px}
  .seg .tp.sel{background:var(--blu);color:#06182b}.seg .te.sel{background:var(--red);color:#2b0609}
  @media(max-width:560px){
    .rrow,.rrow.pvp{grid-template-columns:44px minmax(0,1fr) auto}
    .av{grid-row:1}.rname{grid-row:1}.btns{grid-column:3;grid-row:1}
    .jsel{grid-column:1/-1;grid-row:2}.seg{grid-column:1/-1;grid-row:3}
  }
</style>
