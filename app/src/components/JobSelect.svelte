<script>
  import { JOB, SELECTABLE, BOSS, bossIdOf } from '../lib/engine.js';
  import { pick as pickFrom } from '../lib/stores/ui.svelte.js';

  // 職業を選ぶボタン。押すと、一覧の画面（選ぶ／キャンセル）が開く。アイコン・名前・攻撃/体力を見せる
  let { value = $bindable(), onchange, label = '職業', bosses = true } = $props();
  const nameOf = j => bossIdOf(j) ? BOSS[bossIdOf(j)].n : JOB[j]?.n ?? '';
  const statOf = j => bossIdOf(j) ? '魔王' : `ATK${JOB[j]?.atk} / HP${JOB[j]?.hp}`;
  let btn = $state(), opening = $state(false);

  async function open() {
    if (opening) return;
    opening = true;
    try {
      const j = await pickFrom('job', value, { bosses });
      if (j && j !== value) set(j);
    } finally { opening = false; btn?.focus(); }
  }
  function set(j) { value = j; onchange?.(j); }
  function dice() {
    const others = SELECTABLE.filter(j => j !== value);   // ランダムは通常の職業から
    set(others[Math.floor(Math.random() * others.length)]);
  }
</script>

<div class="jw">
<button type="button" class="sel" bind:this={btn} onclick={open} aria-haspopup="dialog" aria-label={label}>
  <span class="nm">{nameOf(value)}</span>
  <span class="st">{statOf(value)}</span>
  <svg class="car" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
</button>
<button type="button" class="dice" onclick={dice} title="職業をランダムに決める" aria-label="ランダム">🎲</button>
</div>

<style>
  .jw{display:flex;gap:6px;align-items:stretch;min-width:0}
  .dice{flex:none;width:38px;border-radius:10px;border:1px solid var(--line2);background:var(--s2);cursor:pointer;font-size:1.1rem;padding:0}
  .dice:hover{border-color:var(--gold);background:var(--s3)}
  .jw{container:job / inline-size}
  .sel{display:flex;align-items:center;gap:8px;width:100%;min-width:0;background:var(--s1);border:1px solid var(--line2);border-radius:10px;padding:6px 10px;cursor:pointer;text-align:left;transition:border-color .1s}
  .sel:hover{border-color:var(--gold)}
  .sel:focus-visible{outline:2px solid var(--gold);outline-offset:1px}
  .nm{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:0 1 auto}
  .st{color:var(--mut);font-size:.74rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1 1 0;min-width:0}
  @container job (max-width: 250px){.st{display:none}}
  .car{width:12px;height:8px;flex:none;color:var(--mut);margin-left:auto}
</style>
