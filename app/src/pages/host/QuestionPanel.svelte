<script>
  import { untrack } from 'svelte';
  import { panel, modal } from '../../lib/stores/ui.svelte.js';

  // 問読みの画面（進行役だけに出る）。1塊ずつ送ると文字の色が進み、早押しがあるとその位置で止まる
  let { host, G } = $props();
  const quiz = $derived(host.quiz);
  const q = $derived(quiz.cur);
  const total = $derived(quiz.questions.length);
  const stopped = $derived(quiz.frozen != null);
  let detail = $state(false);

  // 問題の番号や問題集が変わったときに、出題とCPUの押し方を合わせる
  $effect(() => { G.q; quiz.has; quiz.offset; untrack(() => host.syncQuiz()); });

  /** → / Space: 次の塊　← : 1つ戻す */
  function onkey(e) {
    if (!q || G.over || modal.req || panel.rules || panel.log || panel.bank || panel.quiz || host.editing != null) return;
    const t = document.activeElement?.tagName;
    if (/INPUT|TEXTAREA|SELECT/.test(t) || e.metaKey || e.altKey || e.ctrlKey) return;
    if (e.key === 'ArrowRight' || (e.key === ' ' && t !== 'BUTTON')) { e.preventDefault(); quiz.advance(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); quiz.back(); }
  }
  /** 確定ポイント（文字数）が、何塊目の途中・終わりにあたるか */
  const sureIn = $derived.by(() => {
    if (!q?.sure) return -1;
    let n = 0;
    for (let i = 0; i < quiz.chunks.length; i++) { n += quiz.chunks[i].length; if (n >= q.sure) return i; }
    return -1;
  });
</script>

<svelte:window onkeydown={onkey} />

{#if quiz.has && q}
  <section class="qp" aria-label="問題文">
    <div class="top">
      <span class="no">問題 {quiz.index + 1}<span class="of">/{total}</span></span>
      <span class="grow"></span>
      <button class="btn sm ghost" title="前の問題" aria-label="前の問題" onclick={() => quiz.jump(-1)}>◀</button>
      <button class="btn sm ghost" title="次の問題" aria-label="次の問題" onclick={() => quiz.jump(1)}>▶</button>
      <button class="btn sm ghost" onclick={() => (panel.bank = true)}>問題集</button>
    </div>

    <div class="text" aria-live="polite">
      {#each quiz.chunks as c, i}<span class="ch" class:read={i < quiz.shown} class:last={i === quiz.shown - 1 && stopped} class:sure={i === sureIn}>{c}</span>{#if i === quiz.shown - 1 && stopped}<span class="hand" title="ここで押されました">✋</span>{/if}{/each}
    </div>

    <div class="ans">
      <span class="lbl">答え</span><b>{q.a}</b>{#if q.alt.length}<span class="alt">（{q.alt.join('・')}）</span>{/if}
      {#if q.sure}<span class="sure-note">確定 {q.sure}字</span>{:else}<span class="sure-note off">確定ポイントなし（CPUは押しません）</span>{/if}
    </div>

    <div class="ctl">
      <button class="btn primary next" disabled={quiz.done} onclick={() => quiz.advance()}>{quiz.shown === 0 ? '読み始める' : quiz.done ? '最後まで表示' : stopped ? '続きを表示' : '次へ'}<kbd>→</kbd></button>
      <button class="btn sm" disabled={quiz.shown === 0} onclick={() => quiz.back()} title="1つ戻す">← 戻す</button>
      <button class="btn sm ghost" disabled={quiz.done} onclick={() => quiz.revealAll()}>全部</button>
      <button class="btn sm ghost" disabled={quiz.shown === 0} onclick={() => quiz.restart()}>最初から</button>
    </div>

    <div class="cpu">
      <label class="tgl"><input type="checkbox" checked={quiz.cpuOn} onchange={(e) => quiz.setCpuOn(e.currentTarget.checked)}> CPUも早押しする</label>
      {#if quiz.cpuOn && quiz.plans.length}
        <button class="lnk" onclick={() => (detail = !detail)} aria-expanded={detail}>{detail ? '予定をかくす' : 'CPUの予定を見る'}</button>
      {/if}
    </div>
    {#if detail}
      <div class="plans">
        {#each quiz.plans as p}<div class:used={p.used}>🤖 {p.name}：{p.at}字で押す（{p.ok ? '正解' : '誤答'}）{p.used ? ' ✓' : ''}</div>{/each}
      </div>
    {/if}
  </section>
{/if}

<style>
  .qp{position:sticky;top:60px;z-index:20;background:var(--s1);border:1px solid var(--line2);border-radius:14px;padding:10px 14px 12px;margin-bottom:14px;box-shadow:0 6px 20px #0008}
  .top{display:flex;align-items:center;gap:6px}
  .no{font-family:var(--display);font-weight:800;color:var(--gold)}.of{color:var(--mut);font-size:.8em;font-weight:500}
  .grow{flex:1}
  .text{font-size:1.5rem;line-height:1.7;margin:6px 0 4px;font-weight:600;letter-spacing:.03em}
  .ch{color:#6f665a;transition:color .12s}
  .ch.read{color:var(--tx)}
  .ch.last{color:var(--gold);text-shadow:0 0 12px #e8c46a66}
  .ch.sure{border-bottom:2px dotted #ffffff40}
  .hand{margin:0 4px;animation:pop .25s}
  @keyframes pop{from{transform:scale(.4)}to{transform:scale(1)}}
  .ans{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:.92rem;margin-bottom:8px}
  .ans .lbl{color:var(--mut);font-size:.78rem}.ans b{color:var(--grn)}
  .alt{color:var(--mut);font-size:.82rem}
  .sure-note{margin-left:auto;font-size:.76rem;color:var(--mut)}.sure-note.off{color:var(--gold)}
  .ctl{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .next{flex:1;min-width:150px;padding:12px 18px;font-size:1.1rem;font-weight:800}
  .cpu{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;font-size:.84rem;color:var(--mut)}
  .tgl{display:flex;align-items:center;gap:6px;cursor:pointer}
  .lnk{all:unset;cursor:pointer;color:var(--gold);font-size:.8rem;text-decoration:underline}
  .lnk:focus-visible{outline:2px solid var(--gold)}
  .plans{margin-top:6px;font-size:.8rem;color:var(--mut);display:flex;flex-direction:column;gap:2px}
  .plans .used{opacity:.55}
  @media(max-width:900px){.text{font-size:1.25rem}.qp{top:56px}}
</style>
