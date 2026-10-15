<script>
  import { fade, fly } from 'svelte/transition';
  import { JOB } from '../../lib/engine.js';
  import JobSelect from '../../components/JobSelect.svelte';
  import Stepper from '../../components/Stepper.svelte';

  // 戦闘中のユニット調整: 職業・体力・攻撃・生死・休みを直す（「1つ戻す」で元に戻せる）
  let { host, G } = $props();
  const u = $derived(G.units.find(x => x.id === host.editing));
  let f = $state(null);
  let lastId = null;
  $effect(() => {
    if (u && u.id !== lastId) { lastId = u.id; f = { name: u.name, job: u.job, hp: u.hp, maxHp: u.maxHp, atk: u.atk, alive: u.alive, rest: u.restNow }; }
    if (!u) { lastId = null; f = null; }
  });

  /** 職業を変えたら、その職業の基本の数値（攻撃・最大HP）にして、HPも満タンにする */
  function changeJob(job) {
    const j = JOB[job ?? f.job];
    if (j) { f.job = job ?? f.job; f.atk = j.atk; f.maxHp = j.hp; f.hp = j.hp; }
  }
  function save() {
    host.editUnit(u.id, { name: f.name, job: u.isBoss ? undefined : f.job, hp: +f.hp, maxHp: +f.maxHp, atk: +f.atk });
    host.editing = null;
  }
  const close = () => { host.editing = null; };
</script>

{#if u && f}
  <div class="back" role="presentation" onclick={(e) => e.target === e.currentTarget && close()} transition:fade={{ duration: 120 }}>
    <div class="dialog panel" in:fly={{ y: 14, duration: 180 }}>
      <h3>✎ {u.name} を調整</h3>
      <div class="sub">HPを0にすると戦闘不能になります。</div>
      <label class="field"><span>名前</span><input class="input" bind:value={f.name} maxlength="12"></label>
      {#if !u.isBoss}
        <div class="field"><span>職業（変えると、その職業の基本の数値になります）</span>
          <JobSelect bind:value={f.job} onchange={changeJob} />
        </div>
      {/if}
      <div class="nums">
        <div class="field"><span>HP</span><Stepper bind:value={f.hp} min={0} max={99} label="HP" /></div>
        <div class="field"><span>最大HP</span><Stepper bind:value={f.maxHp} min={1} max={99} label="最大HP" /></div>
        {#if !u.isBoss}<div class="field"><span>攻撃</span><Stepper bind:value={f.atk} min={0} max={99} label="攻撃" /></div>{/if}
      </div>
      <div class="two"><button class="btn primary" onclick={save}>反映する</button><button class="btn ghost" onclick={close}>やめる</button></div>
    </div>
  </div>
{/if}

<style>
  .back{position:fixed;inset:0;background:#000b;z-index:80;display:flex;align-items:center;justify-content:center;padding:12px}
  .dialog{width:100%;max-width:460px;max-height:92dvh;overflow:auto}
  h3{color:var(--gold);margin-bottom:8px}
  .nums{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}
  .sw{display:flex;align-items:center;gap:10px;margin:8px 0;cursor:pointer}.sw input{width:18px;height:18px;accent-color:var(--gold)}
  .two{display:flex;gap:10px;margin-top:14px}.two .btn{flex:1}
</style>
