<script>
  import { fade, scale } from 'svelte/transition';
  import { panel, toast, confirmAsk } from '../lib/stores/ui.svelte.js';
  import { toSlashed, parseSlashed } from '../lib/questions.js';

  // 問題集の取り込み・一覧・編集。問題は、この端末のブラウザの中だけに保存される（サーバーにも参加者にも送らない）
  let { who } = $props();   // HostStore
  const quiz = $derived(who.quiz);
  const close = () => { panel.bank = false; };
  let text = $state('');
  let report = $state(null);       // 取り込みの結果 { added, errors, warnings }
  let open = $state(null);         // 編集中の問題の番号（配列の位置）
  let ed = $state({ s: '', a: '', alt: '', wrong: '', sure: '' });
  let err = $state('');

  function run(t, replace) {
    const r = quiz.importFrom(t, replace);
    report = { added: r.questions.length, errors: r.errors, warnings: r.warnings };
    if (r.questions.length) { text = ''; toast(`${r.questions.length}問を取り込みました`); }
  }
  async function pickFile(e) {
    const f = e.currentTarget.files?.[0]; e.currentTarget.value = '';
    if (!f) return;
    if (f.size > 2_000_000) { toast('ファイルが大きすぎます（2MBまで）'); return; }
    if (quiz.has && !(await confirmAsk('いまの問題集を置き換えますか？', 'ファイルの内容で、いまの問題集が入れ替わります。', '置き換える', false))) return;
    run(await f.text(), true);
  }
  function startEdit(i) {
    const q = quiz.questions[i];
    open = open === i ? null : i; err = '';
    if (open === i) ed = { s: toSlashed(q.q, q.cuts), a: q.a, alt: q.alt.join('、'), wrong: q.wrong.join('、'), sure: q.sure ?? '' };
  }
  const list = v => v.split(/[、,，\n]/).map(x => x.trim()).filter(Boolean);
  function saveEdit(i) {
    const p = parseSlashed(ed.s);
    err = quiz.update(i, { q: p.q, cuts: p.cuts, a: ed.a, alt: list(ed.alt), wrong: list(ed.wrong), sure: ed.sure === '' ? null : Number(ed.sure) });
    if (!err) { open = null; toast('保存しました'); }
  }
  function download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([quiz.exportJson()], { type: 'application/json' }));
    a.download = `${quiz.title || 'questions'}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function clearAll() { if (await confirmAsk('問題集を全部消しますか？', 'この端末に保存されている問題が消えます。', '消す')) { quiz.clear(); open = null; report = null; } }
  /** 確定ポイントの位置を、プレビューで見えるようにする */
  const mark = (q, s) => (s ? `${q.q.slice(0, s)}｜${q.q.slice(s)}` : q.q);
  const edQ = $derived(parseSlashed(ed.s));
</script>

<svelte:window onkeydown={(e) => panel.bank && e.key === 'Escape' && close()} />

{#if panel.bank}
  <div class="backdrop" role="presentation" onmousedown={(e) => e.target === e.currentTarget && close()} transition:fade={{ duration: 120 }}>
    <div class="dlg" role="dialog" aria-modal="true" aria-label="問題集" transition:scale={{ start: .96, duration: 140 }}>
      <div class="head"><h3>問題集 <span class="cnt">{quiz.questions.length}問</span></h3><button class="btn sm" onclick={close}>閉じる<kbd>Esc</kbd></button></div>
      <div class="body">
        <p class="hint">問題はこの端末のブラウザにだけ保存され、参加者には見えません。バトルの第1問から順に出題されます。</p>

        <section>
          <h4>取り込み</h4>
          <div class="acts">
            <label class="btn sm filebtn">📂 JSONファイルを選ぶ<input type="file" accept=".json,.txt,.csv,application/json,text/plain" onchange={pickFile}></label>
            <button class="btn sm ghost" onclick={() => { quiz.addSample(); toast('サンプルを入れました'); }}>サンプルを入れる</button>
            {#if quiz.has}<button class="btn sm ghost" onclick={download}>⬇ 書き出し</button><button class="btn sm ghost danger" onclick={clearAll}>全部消す</button>{/if}
          </div>
          <textarea class="input ta" bind:value={text} rows="4" placeholder={'JSON を貼るか、1行1問で書きます:\n日本で/一番高い｜/山は/何でしょう？  ||  富士山\n（/ は読みの区切り、｜ は確定ポイント（答えが絞れる位置）。 || のあとが正解）'}></textarea>
          <div class="acts"><button class="btn sm primary" disabled={!text.trim()} onclick={() => run(text, true)}>置き換えて取り込む</button><button class="btn sm" disabled={!text.trim()} onclick={() => run(text, false)}>末尾に追加</button></div>
          {#if report}
            <div class="report" class:bad={report.errors.length}>
              <b>{report.added}問を取り込みました</b>{#if report.errors.length}（{report.errors.length}件は読めませんでした）{/if}
              {#each report.errors.slice(0, 6) as e}<div class="e">⚠ {e}</div>{/each}
              {#each report.warnings.slice(0, 4) as w}<div class="w">・{w}</div>{/each}
            </div>
          {/if}
        </section>

        <section>
          <h4>一覧</h4>
          {#each quiz.questions as q, i (q.no)}
            <div class="item" class:open={open === i}>
              <button class="line" onclick={() => startEdit(i)} aria-expanded={open === i}>
                <span class="no">{q.no}</span>
                <span class="qt">{mark(q, q.sure)}</span>
                <span class="ans">{q.a}</span>
                {#if !q.sure}<span class="chip warn" title="確定ポイントが無いと、CPUはこの問題で押しません">確定なし</span>{/if}
              </button>
              {#if open === i}
                <div class="edit">
                  <label>問題文（/ で区切る）<input class="input" bind:value={ed.s}></label>
                  {#if edQ.q}<div class="prev">{toSlashed(edQ.q, edQ.cuts).replaceAll('/', ' ／ ')}（{edQ.q.length}文字）</div>{/if}
                  <div class="two">
                    <label>正解<input class="input" bind:value={ed.a}></label>
                    <label>確定ポイント（文字数）<input class="input" type="number" min="1" max={edQ.q.length || 400} bind:value={ed.sure} placeholder="なし"></label>
                  </div>
                  <label>別表記（、区切り）<input class="input" bind:value={ed.alt}></label>
                  <label>誤答の候補（、区切り）<input class="input" bind:value={ed.wrong}></label>
                  {#if err}<div class="err">{err}</div>{/if}
                  <div class="acts"><button class="btn sm primary" onclick={() => saveEdit(i)}>保存</button><button class="btn sm ghost" onclick={() => (open = null)}>閉じる</button><button class="btn sm ghost danger" onclick={() => { quiz.remove(i); open = null; }}>この問題を消す</button></div>
                </div>
              {/if}
            </div>
          {:else}<div class="none">問題がありません。上から取り込んでください。</div>{/each}
        </section>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop{position:fixed;inset:0;background:#000b;display:flex;align-items:center;justify-content:center;padding:12px;z-index:90}
  .dlg{background:var(--s1);border:1px solid var(--gold);border-radius:16px;max-width:720px;width:100%;max-height:92dvh;display:flex;flex-direction:column;overflow:hidden}
  .head{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line)}
  h3{font-size:1.15rem;color:var(--gold)}.cnt{font-size:.85rem;color:var(--mut);font-weight:500}
  .body{overflow:auto;padding:12px 16px 16px}
  section{margin-bottom:18px}
  h4{font-size:.9rem;color:var(--gold);margin:0 0 6px}
  .hint{color:var(--mut);font-size:.82rem;margin:0 0 12px}
  .acts{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
  .filebtn{cursor:pointer}.filebtn input{display:none}
  .ta{width:100%;font-family:var(--sans);resize:vertical;line-height:1.5}
  .report{border:1px solid var(--line2);border-radius:10px;padding:8px 12px;font-size:.86rem;margin-top:6px}
  .report.bad{border-color:var(--gold)}.report .e{color:var(--red)}.report .w{color:var(--mut)}
  .item{border:1px solid var(--line);border-radius:10px;margin-bottom:6px;background:var(--s2)}
  .item.open{border-color:var(--gold)}
  .line{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;cursor:pointer}
  .line:focus-visible{outline:2px solid var(--gold);border-radius:10px}
  .no{flex:none;width:2em;color:var(--gold);font-weight:800;font-family:var(--display)}
  .qt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ans{flex:none;max-width:30%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--mut);font-size:.88rem}
  .chip.warn{flex:none;border-color:var(--gold);color:var(--gold);font-size:.72rem}
  .edit{padding:4px 12px 12px;display:flex;flex-direction:column;gap:8px}
  .edit label{display:flex;flex-direction:column;gap:3px;font-size:.8rem;color:var(--mut)}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .prev{font-size:.84rem;color:var(--tx);background:#0003;border-radius:8px;padding:6px 10px}
  .err{color:var(--red);font-size:.86rem}
  .none{color:var(--dim);font-size:.88rem;border:1px dashed var(--line2);border-radius:10px;padding:16px;text-align:center}
  @media(max-width:560px){.two{grid-template-columns:1fr}.ans{display:none}}
</style>
