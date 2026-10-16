<script>
  import { fade, scale } from 'svelte/transition';
  import { panel } from '../lib/ui.svelte.js';
  import Stepper from './Stepper.svelte';

  // クイズ設定（右上のボタンから開く）。参加者は「自分のディレイ」、進行役は「早押しのルール」と「参加者のディレイ」を決める
  // who: 参加者の画面なら PlayStore、進行役の画面なら HostStore。role で見分ける
  let { who, role } = $props();
  const close = () => { panel.quiz = false; };
  const PRESETS = [0, 100, 200, 300, 500, 700, 1000];
  const RULES = [['next', '誤答で次の問題へ', '誰かが誤答したら、その問題は終わり'], ['retry', '誤答者を除いて再受付', '誤答した人を除いて、同じ問題でもう一度早押し'], ['chain', '連チャン', '1着が誤答したら、2着・3着…と押した順に回答権が移る']];
  const players = $derived(role === 'host' ? who.roster.filter(p => p.pid && p.online) : []);
</script>

<svelte:window onkeydown={(e) => panel.quiz && e.key === 'Escape' && close()} />

{#if panel.quiz}
  <div class="backdrop" role="presentation" onmousedown={(e) => e.target === e.currentTarget && close()} transition:fade={{ duration: 120 }}>
    <div class="dlg" role="dialog" aria-modal="true" aria-label="クイズ設定" transition:scale={{ start: .96, duration: 140 }}>
      <div class="head"><h3>クイズ設定</h3><button class="btn sm" onclick={close}>閉じる<kbd>Esc</kbd></button></div>
      <div class="body">
        {#if role === 'host'}
          <section>
            <h4>早押しのルール</h4>
            <div class="rules">
              {#each RULES as [k, n, d]}
                <button class="rule" class:on={who.buzzRule === k} onclick={() => (who.buzzRule = k)} aria-pressed={who.buzzRule === k}><b>{n}</b><small>{d}</small></button>
              {/each}
            </div>
          </section>
          <section>
            <h4>参加者のディレイ</h4>
            <p class="hint">押した時刻に足される時間です。強い人に、ハンデとして付けられます（参加者が自分で決めることもできます）。</p>
            {#each players as p (p.pid)}
              <div class="row"><span class="nm">{p.name}</span><div class="stp"><Stepper value={p.delay ?? 0} min={0} max={3000} step={50} label="{p.name}のディレイ" onchange={(v) => who.setDelay(p.pid, v)} /></div><span class="u">ms</span></div>
            {:else}<div class="none">オンラインの参加者がいません</div>{/each}
          </section>
        {:else}
          <section>
            <h4>自分のディレイ</h4>
            <p class="hint">早押しボタンを押した時刻に、この時間が足されます。上手な人が、自分にハンデを付けたいときに使います。</p>
            <div class="row big"><div class="stp"><Stepper value={who.delay} min={0} max={3000} step={50} label="自分のディレイ" onchange={(v) => who.setDelay(v)} /></div><span class="u">ms</span></div>
            <div class="presets">{#each PRESETS as ms}<button class="chip" class:on={who.delay === ms} onclick={() => who.setDelay(ms)}>{ms === 0 ? 'なし' : `${ms}ms`}</button>{/each}</div>
          </section>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop{position:fixed;inset:0;background:#000b;display:flex;align-items:center;justify-content:center;padding:12px;z-index:90}
  .dlg{background:var(--s1);border:1px solid var(--gold);border-radius:16px;max-width:520px;width:100%;max-height:90dvh;display:flex;flex-direction:column;overflow:hidden}
  .head{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line)}
  h3{font-size:1.15rem;color:var(--gold)}
  .body{overflow:auto;padding:12px 16px 16px}
  section{margin-bottom:16px}
  h4{font-size:.9rem;color:var(--gold);margin:0 0 6px}
  .hint{color:var(--mut);font-size:.82rem;line-height:1.5;margin:0 0 10px}
  .rules{display:flex;flex-direction:column;gap:8px}
  .rule{display:flex;flex-direction:column;gap:2px;text-align:left;background:var(--s2);border:1px solid var(--line);border-radius:12px;padding:10px 12px;cursor:pointer}
  .rule.on{border-color:var(--gold);background:#3a2f1a;box-shadow:0 0 0 1px var(--gold)}
  .rule small{color:var(--mut);font-size:.78rem}
  .row{display:flex;align-items:center;gap:10px;margin-bottom:8px}
  .row .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}
  .stp{flex:none;width:170px}.row.big .stp{width:220px}
  .u{color:var(--mut);font-size:.8rem}
  .presets{display:flex;flex-wrap:wrap;gap:6px}
  .chip{cursor:pointer;background:var(--s2)}.chip.on{background:var(--gold);color:#2a1c06;border-color:var(--gold);font-weight:800}
  .none{color:var(--dim);font-size:.85rem}
</style>
