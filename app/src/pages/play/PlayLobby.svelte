<script>
  import { fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { icon } from '../../lib/icons.js';
  import { JOB, SELECTABLE } from '../../lib/engine.js';

  let { p } = $props();   // PlayStore
</script>

<div class="panel lobby" in:fly={{ y: 12, duration: 220 }}>
  <div class="head"><div class="num" style="--sz:42px">{p.id}</div><div><h2>{p.roomName}</h2><div class="sub">{p.name} として参加中</div></div></div>

  <div class="chips">
    {#each p.members as m (m.pid)}
      <span class="chip" class:off={!m.online} animate:flip={{ duration: 200 }}><span class="dot {m.online ? 'on' : ''}"></span>{m.name}{m.flavor ? ` 〈${m.flavor}〉` : ''}</span>
    {/each}
  </div>

  <div class="step">① 職業を選んでください</div>
  <div class="jobs">
    {#each SELECTABLE as j}
      <button class="job" class:sel={p.myJob === j} onclick={() => p.pickJob(j)}>
        <span class="e">{@html icon(j)}</span>
        <span><b>{JOB[j].n}</b><small>ATK{JOB[j].atk} / HP{JOB[j].hp}</small></span>
      </button>
    {/each}
  </div>
  <div class="jobdesc">{JOB[p.myJob].d}</div>

  <div class="step">② チーム（ユーザー対戦のときだけ使われます）</div>
  <div class="seg wide"><button class:sel={p.myTeam === 'p'} onclick={() => p.pickTeam('p')}>チームA</button><button class:sel={p.myTeam === 'e'} onclick={() => p.pickTeam('e')}>チームB</button></div>

  <div class="sub hint">進行役がバトルを開始すると、自動で画面が切り替わります</div>
  <div class="two"><button class="btn ghost" onclick={() => p.rename()}>名前を変える</button><button class="btn ghost danger" onclick={() => p.leave()}>退室する</button></div>
</div>

<style>
  .lobby{max-width:640px;margin:0 auto}
  .head{display:flex;align-items:center;gap:12px;margin-bottom:6px}
  h2{font-size:1.3rem}
  .chips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}.chip.off{opacity:.45}
  .step{color:var(--mut);font-size:.86rem;margin-top:8px}
  .jobs{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:8px 0}
  .job{background:var(--s2);border:1px solid var(--line);border-radius:10px;padding:9px 10px;text-align:left;cursor:pointer;display:flex;gap:10px;align-items:center;transition:.1s}
  .job:hover{border-color:var(--line2)}
  .job.sel{background:#3a2f1a;border-color:var(--gold);box-shadow:0 0 0 1px var(--gold)}
  .e{font-size:1.6rem;flex:none}.job b{display:block;font-size:.92rem}.job small{color:var(--mut)}
  .jobdesc{min-height:2.8em;color:var(--mut);font-size:.88rem;margin:4px 0 10px;padding:8px 10px;border-left:3px solid var(--gold);background:#0003;border-radius:0 8px 8px 0}
  .seg.wide{display:flex;width:100%;margin:6px 0 14px}.seg.wide button{flex:1}
  .hint{text-align:center;margin-bottom:12px}
  .two{display:flex;gap:10px}.two .btn{flex:1}
</style>
