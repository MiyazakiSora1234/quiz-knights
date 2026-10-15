<script>
  import { fade, scale } from 'svelte/transition';
  import ScoreTable from '../../components/ScoreTable.svelte';
  import { RESULT_TEXT, RESULT_TEXT_CPU } from './gameView.js';

  let { host, G } = $props();
</script>

<div class="over" transition:fade={{ duration: 200 }}>
  <div class="in" in:scale={{ start: .9, duration: 260 }}>
    <h2 class:lose={G.over === 'lose'}>{(G.cpu ? RESULT_TEXT_CPU : RESULT_TEXT)[G.over] ?? 'バトル終了'}</h2>
    <div class="sub">{G.q - 1}問で決着</div>
    <ScoreTable units={G.units} stats={G.stats} />
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
  .acts{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
  @media(max-width:560px){.acts{flex-direction:column;align-items:stretch;width:min(86vw,320px)}}
</style>
