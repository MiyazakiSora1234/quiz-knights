<script>
  import { fade, scale } from 'svelte/transition';
  import { panel } from '../lib/ui.svelte.js';
  import { icon } from '../lib/icons.js';
  import { JOB, BOSS } from '../lib/engine.js';
  const close = () => (panel.rules = false);
</script>

<svelte:window onkeydown={(e) => panel.rules && e.key === 'Escape' && close()} />

{#if panel.rules}
  <div class="backdrop" transition:fade={{ duration: 120 }} onmousedown={(e) => e.target === e.currentTarget && close()} role="presentation">
    <div class="dlg" transition:scale={{ start: .96, duration: 140 }} role="dialog" aria-modal="true" aria-label="職業・ルール一覧">
      <div class="head"><h3>職業・ルール一覧</h3><button class="btn sm" onclick={close}>閉じる<kbd>Esc</kbd></button></div>
      <div class="common">
        <b>共通ルール</b>
        <ul>
          <li>正解すると、通常攻撃か能力を1回使える</li>
          <li>誤答すると、役職に関係なく2ダメージ</li>
          <li>「休み」は連続にならない</li>
          <li>自分や自チームへの攻撃もできる</li>
          <li>遊び人が勇者に転職したときは、体力がリセットされる</li>
          <li>タンクは死んでも守り回数が続く。範囲攻撃で自分が死ぬ場合も庇える</li>
        </ul>
      </div>
      <table>
        <tbody>
          {#each Object.entries(JOB) as [k, j]}
            <tr><th><span class="ic">{@html icon(k)}</span>{j.n}</th><td><span class="st">ATK {j.atk} / HP {j.hp}</span>{j.d}</td></tr>
          {/each}
          {#each Object.entries(BOSS) as [k, b]}
            <tr class="boss"><th><span class="ic">{@html icon('boss' + k)}</span>{b.n}</th><td>{b.d}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{/if}

<style>
  .backdrop{position:fixed;inset:0;background:#000b;display:flex;align-items:center;justify-content:center;padding:16px;z-index:70}
  .dlg{background:var(--s1);border:1px solid var(--gold);border-radius:16px;padding:22px;max-width:760px;width:100%;max-height:90vh;overflow:auto}
  .head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
  h3{font-size:1.3rem;color:var(--gold)}
  .common{background:#0003;border:1px solid var(--line);border-radius:10px;padding:10px 14px;font-size:.88rem;margin-bottom:12px}
  .common ul{margin:6px 0 0;padding-left:20px;color:var(--mut)}
  table{border-collapse:collapse;width:100%;font-size:.88rem}
  th,td{border-bottom:1px solid var(--line);padding:8px;text-align:left;vertical-align:top}
  th{white-space:nowrap;color:var(--gold)}
  .ic{display:inline-block;width:1.5em;font-size:1.2rem;vertical-align:middle;margin-right:4px;color:var(--tx)}
  .st{display:block;color:var(--tx);font-weight:700;font-size:.8rem}
  .boss th{color:#ff9aa2}
</style>
