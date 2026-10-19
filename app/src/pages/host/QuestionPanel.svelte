<script>
  import { untrack } from 'svelte';
  import { panel, modal } from '../../lib/stores/ui.svelte.js';
  import { SPEED_MIN, SPEED_MAX } from '../../lib/stores/quiz.svelte.js';

  // 問読みの画面（進行役だけに出る）。一定の速さで1文字ずつ読み進み、カラオケの歌詞のように読んだ部分の色が変わる。早押しがあるとその位置で止まる
  let { host, G } = $props();
  const quiz = $derived(host.quiz);
  const q = $derived(quiz.cur);
  const total = $derived(quiz.questions.length);
  const stopped = $derived(quiz.frozen != null);
  const chars = $derived(q ? [...q.q] : []);
  let detail = $state(false);

  // 問題の番号や問題集が変わったときに、出題とCPUの押し方を合わせる
  $effect(() => { G.q; quiz.has; quiz.offset; quiz.cpuOn; untrack(() => host.syncQuiz()); });

  /** Space: 読み始める／一時停止　→ : 次の塊まで進める　← : 前の塊に戻す */
  function onkey(e) {
    if (!q || G.over || modal.req || panel.rules || panel.log || panel.bank || panel.quiz || host.editing != null) return;
    const t = document.activeElement?.tagName;
    if (/INPUT|TEXTAREA|SELECT/.test(t) || e.metaKey || e.altKey || e.ctrlKey) return;
    if (e.key === ' ' && t !== 'BUTTON') { e.preventDefault(); quiz.toggle(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); quiz.advance(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); quiz.back(); }
  }
  const KIND = { know: 'わかって押す・正解', guess: '先走り', trap: '引っかけに乗って誤答', bluff: '知ったかぶりで誤答' };
  const label = $derived(quiz.reading ? '一時停止' : quiz.done ? '最後まで読みました' : stopped ? '続きを読む' : quiz.chars === 0 ? '読み始める' : '再開');
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

    <div class="text" aria-live="off">
      {#each chars as ch, i}<span class="c" class:read={i < quiz.chars} class:sure={i === (q.sure ?? 0) - 1}>{ch}</span>{#if stopped && i === quiz.frozen - 1}<span class="hand" title="ここで押されました">✋</span>{/if}{/each}
    </div>

    <div class="ans">
      <span class="lbl">答え</span><b>{q.a}</b>{#if q.alt.length}<span class="alt">（{q.alt.join('・')}）</span>{/if}
      {#if q.sure}<span class="sure-note">確定 {q.sure}字</span>{:else}<span class="sure-note off">確定ポイントなし（CPUは押しません）</span>{/if}
    </div>

    <div class="ctl">
      <button class="btn primary next" class:run={quiz.reading} disabled={quiz.done} onclick={() => quiz.toggle()}>{label}<kbd>Space</kbd></button>
      <button class="btn sm" disabled={quiz.chars === 0} onclick={() => quiz.back()} title="前の塊に戻す">← 戻す</button>
      <button class="btn sm" disabled={quiz.done} onclick={() => quiz.advance()} title="次の塊まで進める">進める →</button>
      <button class="btn sm ghost" disabled={quiz.chars === 0 && !quiz.reading} onclick={() => quiz.restart()}>最初から</button>
    </div>

    <div class="spd">
      <span>読む速さ</span>
      <button class="btn sm ghost" aria-label="遅くする" disabled={quiz.speed <= SPEED_MIN} onclick={() => quiz.setSpeed(quiz.speed - 1)}>−</button>
      <b>{quiz.speed}<small>字/秒</small></b>
      <button class="btn sm ghost" aria-label="速くする" disabled={quiz.speed >= SPEED_MAX} onclick={() => quiz.setSpeed(quiz.speed + 1)}>＋</button>
      <span class="bar" aria-hidden="true"><i style="width:{q.q.length ? (quiz.chars / q.q.length) * 100 : 0}%"></i></span>
    </div>

    <div class="cpu">
      <label class="tgl"><input type="checkbox" checked={quiz.cpuOn} onchange={(e) => quiz.setCpuOn(e.currentTarget.checked)}> CPUも早押しする</label>
      {#if quiz.cpuOn && quiz.plans.length}
        <button class="lnk" onclick={() => (detail = !detail)} aria-expanded={detail}>{detail ? '予定をかくす' : 'CPUの予定を見る'}</button>
      {/if}
    </div>
    {#if detail}
      <div class="plans">
        {#each quiz.plans as p}<div class:used={p.used}>🤖 {p.name}（{p.persona}）：{p.at}字で押す・反応{p.react}ms（{KIND[p.kind] ?? (p.ok ? '正解' : '誤答')}）{p.used ? ' ✓' : ''}</div>{/each}
      </div>
    {/if}
  </section>
{/if}

<style>
  .qp{position:relative;z-index:1;background:var(--s1);border:1px solid var(--line2);border-radius:14px;padding:10px 14px 12px;margin-bottom:14px;box-shadow:0 6px 20px #0008}
  .top{display:flex;align-items:center;gap:6px}
  .no{font-family:var(--display);font-weight:800;color:var(--gold)}.of{color:var(--mut);font-size:.8em;font-weight:500}
  .grow{flex:1}
  .text{font-size:1.5rem;line-height:1.7;margin:6px 0 4px;font-weight:700;letter-spacing:.03em}
  .c{color:#6f665a}
  .c.read{color:var(--tx)}
  .c.sure{border-right:2px dotted #ffffff55}
  .hand{margin:0 4px;animation:pop .25s}
  @keyframes pop{from{transform:scale(.4)}to{transform:scale(1)}}
  .ans{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:.92rem;margin-bottom:8px}
  .ans .lbl{color:var(--mut);font-size:.78rem}.ans b{color:var(--grn)}
  .alt{color:var(--mut);font-size:.82rem}
  .sure-note{margin-left:auto;font-size:.76rem;color:var(--mut)}.sure-note.off{color:var(--gold)}
  .ctl{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .next{flex:1;min-width:150px;padding:12px 18px;font-size:1.1rem;font-weight:800}
  .next.run{filter:saturate(.7) brightness(.95)}
  .spd{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:.84rem;color:var(--mut)}
  .spd b{color:var(--tx);min-width:4.2em;text-align:center}.spd small{font-weight:400;color:var(--mut);margin-left:2px}
  .bar{flex:1;height:6px;border-radius:3px;background:#0006;overflow:hidden;margin-left:6px}
  .bar i{display:block;height:100%;background:var(--gold)}
  .cpu{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;font-size:.84rem;color:var(--mut)}
  .tgl{display:flex;align-items:center;gap:6px;cursor:pointer}
  .lnk{all:unset;cursor:pointer;color:var(--gold);font-size:.8rem;text-decoration:underline}
  .lnk:focus-visible{outline:2px solid var(--gold)}
  .plans{margin-top:6px;font-size:.8rem;color:var(--mut);display:flex;flex-direction:column;gap:2px}
  .plans .used{opacity:.55}
  @media(max-width:900px){.text{font-size:1.15rem;line-height:1.6}.next{flex:1 1 100%;min-width:0;padding:10px 14px}.next kbd{display:none}}
</style>
