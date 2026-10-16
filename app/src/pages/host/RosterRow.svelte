<script>
  import { icon } from '../../lib/icons.js';
  import { JOB } from '../../lib/engine.js';
  import JobSelect from '../../components/JobSelect.svelte';

  /** 名簿の1行。p は名簿の要素（直接書き換える）。pvp のときはチームも選べる */
  let { p, pvp, onremove, onedit = () => {} } = $props();
</script>

<div class="rrow" class:pvp>
  <div class="av">{@html icon(p.job)}</div>
  <div class="rname">
    <input class="input" bind:value={p.name} oninput={() => (p.touchedName = true)} onchange={() => { onedit({ name: p.name }); p.touchedName = false; }} maxlength="12" aria-label="名前">
    <div class="sub"><span class="dot {p.pid ? (p.online ? 'on' : '') : 'warn'}"></span>{p.pid ? (p.online ? 'オンライン' : 'オフライン') : '手動追加'}{p.rtt != null && p.online ? ` ${p.rtt}ms` : ''}{p.flavor ? ` ・ ${p.flavor}` : ''}</div>
  </div>
  <button class="btn ghost sm del" onclick={onremove} title={p.pid ? '退室させる' : '削除'} aria-label="削除">✕</button>
  <div class="ctrl">
    <div class="jsel"><JobSelect bind:value={p.job} onchange={() => { p.touchedJob = true; onedit({ job: p.job }); }} /></div>
    {#if pvp}
      <div class="seg">
        <button class="tp" class:sel={p.team === 'p'} onclick={() => { p.team = 'p'; p.touchedTeam = true; onedit({ team: 'p' }); }}>A</button>
        <button class="te" class:sel={p.team === 'e'} onclick={() => { p.team = 'e'; p.touchedTeam = true; onedit({ team: 'e' }); }}>B</button>
        <button class="tcc" class:sel={p.team === 'c'} onclick={() => { p.team = 'c'; p.touchedTeam = true; onedit({ team: 'c' }); }}>C</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .rrow{display:grid;grid-template-columns:44px minmax(0,1fr) auto;grid-template-areas:"av name del" "ctrl ctrl ctrl";align-items:center;gap:8px 10px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;margin-bottom:8px;background:var(--s2)}
  .av{grid-area:av;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-size:1.5rem;background:#120f0c;border:2px solid var(--line2)}
  .rname{grid-area:name;min-width:0}.rname .input{padding:6px 10px;font-weight:700}
  .rname .sub{display:flex;align-items:center;gap:6px;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .del{grid-area:del}
  .ctrl{grid-area:ctrl;display:flex;gap:8px;align-items:center;min-width:0}
  .jsel{flex:1;min-width:0}
  .seg{flex:none;display:flex}.seg button{padding:7px 14px;min-width:40px}
  .seg .tp.sel{background:var(--blu);color:#06182b}.seg .te.sel{background:var(--red);color:#2b0609}.seg .tcc.sel{background:var(--grn);color:#06220f}
</style>
