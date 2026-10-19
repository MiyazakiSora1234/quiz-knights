<script>
  import { fade, scale } from 'svelte/transition';
  import { panel } from '../lib/stores/ui.svelte.js';
  import Catalog from './Catalog.svelte';
  import { LEVELS } from '../lib/engine.js';
  import { RULINGS } from '../lib/rulings.js';

  const close = () => (panel.rules = false);
  let tab = $state('play');
  const TABS = [['play', '遊び方'], ['jobs', '職業'], ['boss', '魔王'], ['items', 'アイテム'], ['rulings', '裁定']];
  let query = $state('');     // 裁定の絞り込み
  const hit = (q, a) => !query.trim() || (q + a).includes(query.trim());
  const rulings = $derived(RULINGS.map(g => ({ ...g, items: g.items.filter(([q, a]) => hit(q, a)) })).filter(g => g.items.length));
  const STEPS = [
    ['問題を読む', '進行役が問題を読み上げます。わかったら早押しボタンを押し、いちばん早く押した人が回答権を取ります。'],
    ['答える', '回答権を取った人が答えます。進行役が「正解」か「誤答」を決めます。'],
    ['正解したら', '自分の画面で、通常攻撃か職業の能力を1回選んで使えます。'],
    ['誤答したら', '答えた本人だけが2ダメージを受けます。'],
    ['CPUの番', '1問ごとに、CPU（魔王など）のうち1体が自動で行動します。'],
    ['勝ち負け', '魔王（CPU）を倒せば勝ち。参加者が全員倒れると負けです。ユーザー対戦は、相手チームを全滅させたほうの勝ちです。'],
  ];
  const NOTES = [
    '攻撃は、自分や味方にも当てられます。',
    '「休み」になった人は、その問題の早押しに参加できません。',
    '体力が0になると戦闘不能です。戦闘不能の人は、押せません（幽霊と蘇生を除く）。',
    '魔王の体力は、参加者全員の攻撃力の合計で決まります。人数が多いほど、魔王も頑丈になります。',
    '押した順番は、カードに「1着」「2着 +120ms」のように出ます（1着から何ミリ秒遅れたか）。',
    '押さずに、チャットで答えを送ることもできます。答えはその人のカードに吹き出しで出ます。',
    '戦闘中でも、入室すれば途中参戦できます。いったん抜けて入り直すと、新しい参加者として加わります。',
    '開始時に全員へアイテムがランダムに配られます。正解したときの行動メニューに「🎒 アイテム」が並び、使っても通常の行動は残ります（1回の行動で2個まで使えます）。カードの 🎒×数 が持っている個数です。',
    '進行役がいなくなったら、参加者の誰かが「進行役になる」で引き継げます。',
    '職業の一番下で「魔王」を選ぶと、魔王として戦えます（自分で技を選びます）。魔王の体力は、ほかの参加者の攻撃力の合計で決まります。',
  ];
  const BUZZ_RULES = [
    ['誤答で次の問題へ', '誰かが誤答したら、その問題は終わりです。'],
    ['誤答者を除いて再受付', '誤答した人を除いて、同じ問題でもう一度早押しします。'],
    ['連チャン', '1着の人が誤答したら、2着、3着…と押した順に回答権が移ります。回答権が決まったあとも、控えとして押せます。'],
  ];
</script>

<svelte:window onkeydown={(e) => panel.rules && e.key === 'Escape' && close()} />

{#if panel.rules}
  <div class="backdrop" transition:fade={{ duration: 120 }} onmousedown={(e) => e.target === e.currentTarget && close()} role="presentation">
    <div class="dlg" transition:scale={{ start: .96, duration: 140 }} role="dialog" aria-modal="true" aria-label="遊び方・職業・魔王">
      <div class="head">
        <div class="tabs" role="tablist">{#each TABS as [k, n]}<button role="tab" aria-selected={tab === k} class:on={tab === k} onclick={() => (tab = k)}>{n}</button>{/each}</div>
        <button class="btn sm" onclick={close}>閉じる<kbd>Esc</kbd></button>
      </div>

      <div class="body">
        {#if tab === 'play'}
          <ol class="steps">
            {#each STEPS as [t, d], i}<li><span class="no">{i + 1}</span><div><b>{t}</b><span>{d}</span></div></li>{/each}
          </ol>
          <div class="box"><b>知っておくと便利</b><ul>{#each NOTES as n}<li>{n}</li>{/each}</ul></div>
          <div class="box"><b>早押しのルール（進行役が選びます）</b><ul>{#each BUZZ_RULES as [t, d]}<li><b>{t}</b>：{d}</li>{/each}</ul></div>
          <div class="box"><b>難易度</b><ul>{#each Object.values(LEVELS).filter(x => !x.hidden) as l}<li><b>{l.n}</b>：{l.d}</li>{/each}</ul></div>
        {:else if tab === 'jobs'}
          <Catalog kind="jobs" />
        {:else if tab === 'items'}
          <div class="box"><b>アイテムとは</b><ul><li>バトル開始時に、参加者へランダムで配られます。</li><li>正解したときの行動メニューに「🎒」で並びます。使っても通常の行動は残ります（1回の行動で2個まで）。</li><li>仲間の持ち物は名前まで、相手の持ち物は個数だけが見えます。</li></ul></div>
          <Catalog kind="items" />
        {:else if tab === 'rulings'}
          <input class="find" type="search" placeholder="キーワードで探す（例：バリア、毒、タンク）" bind:value={query} aria-label="裁定を検索" />
          {#each rulings as g}
            <h4>{g.n}</h4>
            {#each g.items as [q, a]}
              <details class="rl" open={!!query.trim()}><summary>{q}</summary><p>{a}</p></details>
            {/each}
          {:else}
            <div class="hint">見つかりませんでした。</div>
          {/each}
        {:else}
          <Catalog kind="boss" />
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop{position:fixed;inset:0;background:#000b;display:flex;align-items:center;justify-content:center;padding:12px;z-index:90}
  .dlg{background:var(--s1);border:1px solid var(--gold);border-radius:16px;max-width:720px;width:100%;max-height:92dvh;display:flex;flex-direction:column;overflow:hidden}
  .head{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line)}
  .tabs{display:flex;gap:6px}
  .tabs button{background:var(--s2);border:1px solid var(--line);border-radius:999px;padding:7px 18px;font-weight:700;cursor:pointer;color:var(--mut)}
  .tabs button.on{background:var(--gold);color:#2a1c06;border-color:var(--gold)}
  .body{overflow:auto;padding:14px 16px 18px}
  .steps{list-style:none;margin:0 0 12px;padding:0;display:flex;flex-direction:column;gap:8px}
  .steps li{display:flex;gap:12px;align-items:flex-start;background:var(--s2);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
  .no{flex:none;width:28px;height:28px;border-radius:50%;background:var(--gold);color:#2a1c06;font-weight:900;display:grid;place-items:center}
  .steps b{display:block;color:var(--gold)}.steps span:not(.no){color:var(--tx);font-size:.9rem;line-height:1.5}
  .box{background:#0003;border:1px solid var(--line);border-radius:12px;padding:10px 14px;margin-bottom:10px;font-size:.88rem}
  .box ul{margin:6px 0 0;padding-left:20px;color:var(--mut);line-height:1.6}.box li b{color:var(--tx)}
  h4{margin:14px 2px 8px;color:var(--gold);font-size:.95rem;letter-spacing:.1em}
  .hint{text-align:center;color:var(--dim);font-size:.8rem;margin-top:12px}
  .tabs{flex-wrap:wrap}
  .find{width:100%;box-sizing:border-box;background:var(--s2);border:1px solid var(--line);border-radius:10px;padding:9px 12px;color:var(--tx);font-size:.9rem;margin-bottom:4px}
  .rl{background:var(--s2);border:1px solid var(--line);border-radius:10px;margin-bottom:6px}
  .rl summary{cursor:pointer;padding:9px 12px;font-weight:700;font-size:.88rem;list-style:none}.rl summary::-webkit-details-marker{display:none}
  .rl summary::before{content:'▸ ';color:var(--gold)}.rl[open] summary::before{content:'▾ '}
  .rl p{margin:0;padding:0 12px 10px;color:var(--mut);font-size:.86rem;line-height:1.6}
  @media(max-width:560px){.tabs button{padding:6px 12px}}
</style>
