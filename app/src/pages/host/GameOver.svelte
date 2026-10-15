<script>
  import { fade, scale } from 'svelte/transition';
  import { icon } from '../../lib/icons.js';
  import { RESULT_TEXT, RESULT_TEXT_CPU } from './gameView.js';

  let { host, G } = $props();
  const players = $derived(G.units.filter(u => !u.isBoss));
  const stat = (u, k) => G.stats?.[u.id]?.[k] ?? 0;
</script>

<div class="over" transition:fade={{ duration: 200 }}>
  <div class="in" in:scale={{ start: .9, duration: 260 }}>
    <h2 class:lose={G.over === 'lose'}>{(G.cpu ? RESULT_TEXT_CPU : RESULT_TEXT)[G.over] ?? 'バトル終了'}</h2>
    <div class="sub">{G.q - 1}問で決着</div>
    <table class="score">
      <thead><tr><th>プレイヤー</th><th>正解</th><th>誤答</th></tr></thead>
      <tbody>
        {#each players as u (u.id)}
          <tr class:dead={!u.alive}><td><span class="si">{@html icon(u.job)}</span>{u.name}</td><td class="ok">{stat(u, 'correct')}</td><td class="ng">{stat(u, 'wrong')}</td></tr>
        {/each}
      </tbody>
    </table>
    <div class="acts">
      <button class="btn primary lg" onclick={() => host.start()}>同じメンバーでもう一度</button>
      <button class="btn lg" onclick={() => host.quit()}>準備画面に戻る</button>
    </div>
  </div>
</div>

<style>
  .over{position:fixed;inset:0;background:radial-gradient(circle,#000a,#000f);display:flex;align-items:center;justify-content:center;z-index:60;text-align:center}
  .in{display:flex;flex-direction:column;gap:18px;align-items:center}
  h2{font-size:clamp(2.4rem,8vw,4rem);color:var(--gold);text-shadow:0 0 30px currentColor}
  h2.lose{color:var(--red)}
  .score{border-collapse:collapse;min-width:min(86vw,340px);background:#0006;border:1px solid var(--line2);border-radius:12px;overflow:hidden;font-size:.95rem}
  .score th,.score td{padding:6px 14px;text-align:center}.score th{color:var(--mut);font-weight:500;font-size:.8rem;border-bottom:1px solid var(--line)}
  .score td:first-child,.score th:first-child{text-align:left}
  .score td.ok{color:#8fe0a6;font-weight:700}.score td.ng{color:#ff9aa2;font-weight:700}.score tr.dead td:first-child{opacity:.55}
  .si{display:inline-block;width:1.4em;margin-right:6px;font-size:1.1rem;vertical-align:middle}
  .acts{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
  @media(max-width:560px){.acts{flex-direction:column;align-items:stretch;width:min(86vw,320px)}}
</style>
