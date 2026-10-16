<script>
  import { fade, fly } from 'svelte/transition';
  import { icon } from '../../lib/icons.js';
  import { JOB, SELECTABLE, BOSS, PLAYABLE_BOSS_KEYS, bossIdOf } from '../../lib/engine.js';
  import { panel } from '../../lib/stores/ui.svelte.js';
  import FoePicker from '../../components/FoePicker.svelte';
  import Stepper from '../../components/Stepper.svelte';

  // 参加者の設定ダイアログ。タブで「ユーザー（名前・職業・チーム）」「ゲーム（戦う相手・難易度・部屋）」「クイズ（ディレイ）」に分ける。
  // バトル中は、バトルに関係するクイズ設定だけを出す
  let { p } = $props();   // PlayStore
  const TABS = [['user', 'ユーザー'], ['game', 'ゲーム'], ['quiz', 'クイズ']];
  const tabs = $derived(p.gs ? TABS.filter(([k]) => k === 'quiz') : TABS);
  const tab = $derived(tabs.some(([k]) => k === panel.settings) ? panel.settings : tabs[0][0]);
  let n = $state(''), f = $state(''), rn = $state(''), rp = $state('');
  const close = () => { panel.settings = null; };
  // 開いたときに、いまの値を入力欄に入れる
  $effect(() => { if (panel.settings) { n = p.name; f = p.flavor; rn = p.roomName; rp = ''; } });

  const jobD = k => (bossIdOf(k) ? `${BOSS[bossIdOf(k)].intro}（魔王として戦います。体力は、ほかの参加者の攻撃力の合計で決まります）` : JOB[k].d);
  const randomJob = () => { const o = SELECTABLE.filter(j => j !== p.myJob); p.pickJob(o[Math.floor(Math.random() * o.length)]); };
  function saveUser() { if (n.trim() && (n.trim() !== p.name || f.trim() !== p.flavor)) p.saveProfile(n, f); }
  function saveRoom() { if (!p.hasHost && rn.trim() && (rn.trim() !== p.roomName || rp !== '')) p.saveRoom(rn, rp); }
  function save() { saveUser(); saveRoom(); close(); }
</script>

<svelte:window onkeydown={(e) => panel.settings && e.key === 'Escape' && close()} />

{#if panel.settings}
  <div class="back" role="presentation" onmousedown={(e) => e.target === e.currentTarget && close()} transition:fade={{ duration: 120 }}>
    <div class="dialog" role="dialog" aria-modal="true" aria-label="設定" in:fly={{ y: 14, duration: 180 }}>
      <div class="head">
        <div class="tabs" role="tablist">{#each tabs as [k, nm]}<button role="tab" aria-selected={tab === k} class:on={tab === k} onclick={() => (panel.settings = k)}>{nm}</button>{/each}</div>
        <button class="btn sm" onclick={close}>閉じる<kbd>Esc</kbd></button>
      </div>

      <div class="body">
        {#if tab === 'user'}
          <label class="field"><span>名前</span><input class="input" bind:value={n} maxlength="12"></label>
          <label class="field"><span>ひとこと（任意）</span><input class="input" bind:value={f} maxlength="20"></label>
          <div class="step">職業 <button class="btn ghost sm" onclick={randomJob}>🎲 ランダム</button></div>
          <div class="jobs">
            {#each SELECTABLE as j}
              <button class="job" class:sel={p.myJob === j} onclick={() => p.pickJob(j)}><span class="e">{@html icon(j)}</span><span><b>{JOB[j].n}</b><small>ATK{JOB[j].atk} / HP{JOB[j].hp}</small></span></button>
            {/each}
          </div>
          <div class="step">魔王として戦う</div>
          <div class="jobs">
            {#each PLAYABLE_BOSS_KEYS as k}
              <button class="job boss" class:sel={p.myJob === k} onclick={() => p.pickJob(k)}><span class="e">{@html icon(k)}</span><span><b>{BOSS[bossIdOf(k)].n}</b><small>魔王</small></span></button>
            {/each}
          </div>
          <div class="jobdesc">{jobD(p.myJob)}</div>
          <div class="step">チーム（ユーザー対戦のときだけ使われます）</div>
          <div class="seg wide teams"><button class="ta" class:sel={p.myTeam === 'p'} onclick={() => p.pickTeam('p')}>チームA</button><button class="tb" class:sel={p.myTeam === 'e'} onclick={() => p.pickTeam('e')}>チームB</button><button class="tc" class:sel={p.myTeam === 'c'} onclick={() => p.pickTeam('c')}>チームC</button></div>
        {:else if tab === 'game'}
          <FoePicker who={p} />
          {#if !p.hasHost}
            <div class="step">部屋の設定（進行役がいない間は誰でも変えられます）</div>
            <label class="field"><span>部屋名</span><input class="input" bind:value={rn} maxlength="30"></label>
            <label class="field"><span>パスワード（空なら変更なし）</span><input class="input" bind:value={rp} maxlength="20"></label>
          {/if}
        {:else}
          <section>
            <h4>自分のディレイ</h4>
            <div class="row"><div class="stp"><Stepper value={p.delay} min={0} max={3000} step={50} label="自分のディレイ" onchange={(v) => p.setDelay(v)} /></div><span class="u">ms</span></div>
            <p class="hint">押した時刻に足されます。早押しの順位を、通信の速さや押しやすさに合わせて調整できます。</p>
          </section>
        {/if}
      </div>

      {#if tab !== 'quiz'}
        <div class="foot"><button class="btn primary" onclick={save}>保存して閉じる</button><button class="btn ghost" onclick={close}>閉じる</button></div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .back{position:fixed;inset:0;background:#000b;z-index:90;display:flex;align-items:center;justify-content:center;padding:12px}
  .dialog{width:100%;max-width:600px;max-height:92dvh;display:flex;flex-direction:column;overflow:hidden;background:var(--s1);border:1px solid var(--gold);border-radius:16px}
  .head{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)}
  .tabs{display:flex;gap:6px;min-width:0}
  .tabs button{background:var(--s2);border:1px solid var(--line);border-radius:999px;padding:7px 18px;font-weight:700;cursor:pointer;color:var(--mut)}
  .tabs button.on{background:var(--gold);color:#2a1c06;border-color:var(--gold)}
  .body{overflow:auto;padding:12px 16px 14px;flex:1;min-height:0}
  .foot{display:flex;gap:10px;padding:10px 16px 14px;border-top:1px solid var(--line)}.foot .btn{flex:1}
  .step{color:var(--mut);font-size:.86rem;margin-top:10px}
  .jobs{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:8px 0}
  .job{background:var(--s2);border:1px solid var(--line);border-radius:10px;padding:9px 10px;text-align:left;cursor:pointer;display:flex;gap:10px;align-items:center}
  .job.boss .e{border-radius:50%}
  .job.sel{background:#3a2f1a;border-color:var(--gold);box-shadow:0 0 0 1px var(--gold)}
  .e{font-size:1.6rem;flex:none}.job b{display:block;font-size:.92rem}.job small{color:var(--mut)}
  .jobdesc{color:var(--mut);font-size:.88rem;margin:4px 0 10px;padding:8px 10px;border-left:3px solid var(--gold);background:#0003;border-radius:0 8px 8px 0}
  .seg.wide{display:flex;width:100%;margin:6px 0 10px}.seg.wide button{flex:1}
  .seg.teams .ta.sel{background:var(--blu);color:#06182b}.seg.teams .tb.sel{background:var(--red);color:#2b0609}.seg.teams .tc.sel{background:var(--grn);color:#06220f}
  section{margin-bottom:12px}
  h4{font-size:.9rem;color:var(--gold);margin:0 0 6px}
  .hint{color:var(--mut);font-size:.8rem;margin:6px 0 0}
  .row{display:flex;align-items:center;gap:10px}.stp{flex:none;width:220px}.u{color:var(--mut)}
  @media(max-width:560px){.tabs{gap:4px}.tabs button{padding:6px 11px;font-size:.88rem}.head{padding:10px}}
</style>
