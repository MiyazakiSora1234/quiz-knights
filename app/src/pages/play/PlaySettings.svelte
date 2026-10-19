<script>
  import { fade, fly } from 'svelte/transition';
  import { JOB, SELECTABLE, BOSS, bossIdOf } from '../../lib/engine.js';
  import { panel } from '../../lib/stores/ui.svelte.js';
  import Stepper from '../../components/Stepper.svelte';
  import JobSelect from '../../components/JobSelect.svelte';
  import { titles } from '../../lib/stores/titles.svelte.js';
  import { TITLES, TITLE_CATS, titleName } from '../../lib/titles.js';
  import { importText, exportBank } from '../../lib/questions.js';
  import { toast } from '../../lib/stores/ui.svelte.js';

  // 参加者の設定ダイアログ。タブで「ユーザー（名前・職業・チーム）」「クイズ（ディレイ）」に分ける。ゲームの設定（戦う相手・難易度）は進行役だけが決める。
  // バトル中は、バトルに関係するクイズ設定だけを出す
  let { p } = $props();   // PlayStore
  const TABS = [['user', 'ユーザー設定'], ['quiz', 'クイズ設定'], ['titles', '称号'], ['bank', '問題集']];
  const tabs = $derived(p.gs ? TABS.filter(([k]) => k === 'quiz' || k === 'titles') : TABS);     // バトル中は、クイズ設定だけ
  const tab = $derived(tabs.some(([k]) => k === panel.settings) ? panel.settings : tabs[0][0]);
  let n = $state(''), f = $state(''), rn = $state(''), rp = $state('');
  const close = () => { panel.settings = null; };
  // 開いたときに、いまの値を入力欄に入れる
  $effect(() => { if (panel.settings) { n = p.name; f = p.flavor; rn = p.roomName; rp = ''; } });

  const jobD = k => (bossIdOf(k) ? `${BOSS[bossIdOf(k)].intro}（魔王として戦います。体力は、ほかの参加者の攻撃力の合計で決まります）` : JOB[k].d);
  const randomJob = () => { const o = SELECTABLE.filter(j => j !== p.myJob); p.pickJob(o[Math.floor(Math.random() * o.length)]); };
  // 問題集（JSON）を、進行役へ送る。ここで検査してから、整えた JSON を送る（進行役の端末が取り込む）
  let bankText = $state(''), bankRep = $state(null);
  function checkBank() {
    const r = importText(bankText);
    bankRep = { n: r.questions.length, errors: r.errors, warnings: r.warnings, title: r.title };
    return r;
  }
  function sendBank() {
    const r = checkBank();
    if (!r.questions.length) return;
    if (p.sendBank(exportBank(r.title, r.questions))) { toast(`問題集（${r.questions.length}問）を進行役に送りました`); bankText = ''; bankRep = null; }
    else toast('送れませんでした（進行役がいないか、大きすぎます）');
  }
  async function pickBankFile(e) {
    const f = e.currentTarget.files?.[0]; e.currentTarget.value = '';
    if (!f) return;
    if (f.size > 380_000) { toast('ファイルが大きすぎます（380KBまで）'); return; }
    bankText = await f.text(); checkBank();
  }
  const dateOf = ts => (ts ? new Date(ts).toLocaleDateString('ja-JP') : '');
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
          <JobSelect value={p.myJob} onchange={(j) => p.pickJob(j)} label="職業" />
          <div class="jobdesc">{jobD(p.myJob)}</div>
          <div class="step">チーム（ユーザー対戦のときだけ使われます）</div>
          <div class="seg wide teams"><button class="ta" class:sel={p.myTeam === 'p'} onclick={() => p.pickTeam('p')}>チームA</button><button class="tb" class:sel={p.myTeam === 'e'} onclick={() => p.pickTeam('e')}>チームB</button><button class="tc" class:sel={p.myTeam === 'c'} onclick={() => p.pickTeam('c')}>チームC</button></div>
          {#if !p.hasHost}
            <div class="step">部屋の設定（進行役がいない間は誰でも変えられます）</div>
            <label class="field"><span>部屋名</span><input class="input" bind:value={rn} maxlength="30"></label>
            <label class="field"><span>パスワード（空なら変更なし）</span><input class="input" bind:value={rp} maxlength="20"></label>
          {/if}
        {:else if tab === 'titles'}
          <section>
            <h4>称号　<span class="cnt">{titles.count} / {titles.total}</span></h4>
            <p class="hint">バトルの結果に応じて、称号を取れます。取った称号は、1つ選んで、名前の横に出せます。まだの称号は、条件だけが見えます。</p>
            <div class="eq">
              <span>つけている称号：<b>{titles.equipped ? titleName(titles.equipped) : 'なし'}</b></span>
              {#if titles.equipped}<button class="btn sm ghost" onclick={() => p.setTitle('')}>外す</button>{/if}
            </div>
            {#each TITLE_CATS as cat}
              {@const list = TITLES.filter(t => t.cat === cat)}
              <h5>{cat}　<small>{list.filter(t => titles.earned[t.id] != null).length}/{list.length}</small></h5>
              {#each list as t (t.id)}
                {@const got = titles.earned[t.id] != null}
                <div class="tl" class:got>
                  <div class="tn"><b>{got ? t.n : '？？？'}</b><small>{t.d}{got ? `（${dateOf(titles.earned[t.id])}）` : ''}</small></div>
                  {#if got}
                    {#if titles.equipped === t.id}<span class="on">つけ中</span>{:else}<button class="btn sm ghost" onclick={() => p.setTitle(t.id)}>つける</button>{/if}
                  {:else}<span class="lock">🔒</span>{/if}
                </div>
              {/each}
            {/each}
          </section>
        {:else if tab === 'bank'}
          <section>
            <h4>問題集を進行役に送る</h4>
            <p class="hint">JSON（または1行1問のテキスト）を、進行役に送ります。進行役の問題集が、これに置き換わります。バトルの準備中だけ送れます。</p>
            <div class="acts">
              <label class="btn sm filebtn">📂 JSONファイルを選ぶ<input type="file" accept=".json,.txt,.csv,application/json,text/plain" onchange={pickBankFile}></label>
            </div>
            <textarea class="input ta" rows="6" bind:value={bankText} oninput={() => (bankRep = null)} placeholder={'JSON を貼るか、1行1問で書きます:\n日本で/一番高い｜/山は/何でしょう？  ||  富士山'}></textarea>
            <div class="acts">
              <button class="btn sm" disabled={!bankText.trim()} onclick={checkBank}>内容を確かめる</button>
              <button class="btn sm primary" disabled={!bankText.trim() || !p.hasHost} onclick={sendBank}>進行役に送る</button>
            </div>
            {#if !p.hasHost}<p class="hint">いま進行役がいないので、送れません。</p>{/if}
            {#if bankRep}
              <div class="rep" class:bad={bankRep.errors.length}>
                <b>{bankRep.n}問を読み取れます</b>{#if bankRep.errors.length}（{bankRep.errors.length}件は読めません）{/if}
                {#each bankRep.errors.slice(0, 5) as e}<div>⚠ {e}</div>{/each}
                {#each bankRep.warnings.slice(0, 3) as w}<div>・{w}</div>{/each}
              </div>
            {/if}
          </section>
        {:else}
          <section>
            <h4>自分のディレイ</h4>
            <div class="row"><div class="stp"><Stepper value={p.delay} min={0} max={3000} step={50} label="自分のディレイ" onchange={(v) => p.setDelay(v)} /></div><span class="u">ms</span></div>
            <p class="hint">押した時刻に足されます。早押しの順位を、通信の速さや押しやすさに合わせて調整できます。</p>
          </section>
        {/if}
      </div>

      {#if tab === 'user'}
        <div class="foot"><button class="btn primary" onclick={save}>保存して閉じる</button><button class="btn ghost" onclick={close}>キャンセル</button></div>
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
  .jobdesc{color:var(--mut);font-size:.88rem;margin:4px 0 10px;padding:8px 10px;border-left:3px solid var(--gold);background:#0003;border-radius:0 8px 8px 0}
  .seg.wide{display:flex;width:100%;margin:6px 0 10px}.seg.wide button{flex:1}
  .seg.teams .ta.sel{background:var(--blu);color:#06182b}.seg.teams .tb.sel{background:var(--red);color:#2b0609}.seg.teams .tc.sel{background:var(--grn);color:#06220f}
  section{margin-bottom:12px}
  h4{font-size:.9rem;color:var(--gold);margin:0 0 6px}
  .hint{color:var(--mut);font-size:.8rem;margin:6px 0 0}
  .cnt{font-size:.85rem;color:var(--mut);font-weight:500}
  .eq{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:8px 0 4px;font-size:.9rem}.eq b{color:var(--gold)}
  h5{margin:14px 0 6px;color:var(--gold);font-size:.88rem}.h5 small,h5 small{color:var(--mut);font-weight:400}
  .tl{display:flex;align-items:center;gap:10px;justify-content:space-between;background:var(--s2);border:1px solid var(--line);border-radius:10px;padding:7px 10px;margin-bottom:5px;opacity:.7}
  .tl.got{opacity:1;border-color:var(--gold-d);background:#2a2214}
  .tn{min-width:0}.tn b{display:block;font-size:.92rem}.tn small{color:var(--mut);font-size:.76rem;line-height:1.4}
  .on{color:var(--gold);font-size:.8rem;font-weight:700;flex:none}.lock{flex:none}
  .acts{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
  .filebtn{cursor:pointer}.filebtn input{display:none}
  .ta{width:100%;box-sizing:border-box;font-family:inherit;resize:vertical}
  .rep{margin-top:6px;padding:8px 10px;border-radius:10px;background:#0003;border:1px solid var(--line);font-size:.84rem;line-height:1.5}.rep.bad{border-color:#b3414b}
  .row{display:flex;align-items:center;gap:10px}.stp{flex:none;width:220px}.u{color:var(--mut)}
  @media(max-width:560px){.tabs{gap:4px}.tabs button{padding:6px 11px;font-size:.88rem}.head{padding:10px}}
</style>
