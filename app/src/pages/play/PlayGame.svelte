<script>
  import { fade, scale } from 'svelte/transition';
  import Unit from '../../components/Unit.svelte';
  import MePanel from './MePanel.svelte';
  import BuzzButton from './BuzzButton.svelte';
  import { sfx, vib } from '../../lib/sound.svelte.js';

  let { p } = $props();   // PlayStore
  const gs = $derived(p.gs);
  let text = $state('');

  /** 自分のHPが変わったら、画面を一瞬赤（ダメージ）か緑（回復）に光らせる */
  let flash = $state('');
  let prevHp = null;
  $effect(() => {
    const hp = p.me?.hp;
    if (hp == null) { prevHp = null; return; }
    if (prevHp != null && hp !== prevHp) {
      flash = hp < prevHp ? 'd' : 'h';
      if (hp < prevHp) { sfx.hit(); vib(prevHp - hp > 3 ? [80, 40, 120] : 60); } else sfx.heal();
      setTimeout(() => { flash = ''; }, 600);
    }
    prevHp = hp;
  });

  /** 各ユニットのカードに出す印（休み・タンクの守り・サーバーが付けた状態） */
  const tagsOf = u => [
    ...(u.restNow ? [{ t: '💤 休み', cls: 'warn' }] : []),
    ...(u.job === 'tank' ? [{ t: `🛡×${u.guards}`, cls: 'warn' }] : []),
    ...(u.st ?? []),
  ];
  const rankText = w => w.ranking.slice(0, 4).map((x, i) => `${i + 1}. ${x.name}${i ? ` (+${Math.round(x.ms)}ms)` : ''}`).join('　');
</script>

<div class="flash {flash}"></div>

<div class="game">
  <div class="top">
    <div><span class="qn">第{gs.q}問</span>{#if gs.genre}<span class="chip pur" transition:fade>{gs.genre}</span>{/if}</div>
    <div class="net"><span class="dot {p.netGood ? 'on' : p.status === 'open' ? 'warn' : ''}"></span>{p.rtt != null ? `${p.rtt}ms` : ''}{p.jitter != null ? ` ±${p.jitter}` : ''}</div>
  </div>

  <div class="a-me"><MePanel me={p.me} /></div>

  <div class="ansbox">
  <form class="ans" onsubmit={(e) => { e.preventDefault(); p.sendAnswer(text); text = ''; }}>
    <input class="input" bind:value={text} maxlength="60" placeholder="チャット回答（進行役にだけ届きます）" aria-label="チャット回答"><button class="btn sm" type="submit" disabled={!text.trim()}>回答</button>
  </form>
  {#if p.answered && p.answered.q === gs.q}<div class="sent">送信した回答：<b>{p.answered.text}</b></div>{/if}
  </div>

  {#if p.bannerText}
  <div class="banner {p.bannerKind}">
    <b>{p.bannerText}</b>
    {#if p.hasWinner}<div class="rank">{rankText(p.winner)}</div>{/if}
  </div>
  {/if}

  <div class="mid">
    <div class="strip">
      {#each gs.units as u (u.id)}
        <Unit {u} compact ribbon={u.id === p.mine ? 'あなた' : ''} sel={u.id === p.mine} jobLabel={u.jobName} tags={tagsOf(u)} />
      {/each}
    </div>
    <details class="logbox parch">
      <summary>年代記</summary>
      {#each gs.log ?? [] as l}<p>{l}</p>{/each}
    </details>
  </div>

  {#if p.me}<div class="buzzarea"><BuzzButton {p} /></div>{/if}
</div>

{#if gs.over}
  <div class="over" transition:fade={{ duration: 200 }}>
    <div class="ov-in" in:scale={{ start: .9, duration: 260 }}>
      <h2 class:lose={p.lost}>{p.overText}</h2>
      {#if p.me && gs.stats?.[p.me.id]}
        <div class="mine">あなたの成績：正解 <b class="ok">{gs.stats[p.me.id].correct}</b>　誤答 <b class="ng">{gs.stats[p.me.id].wrong}</b></div>
      {/if}
      <div class="sub">進行役の操作を待っています</div>
    </div>
  </div>
{/if}

<style>
  .flash{position:fixed;inset:0;pointer-events:none;z-index:60;opacity:0}
  .flash.d{background:radial-gradient(circle,#0000 40%,#ff2030aa);animation:fo .5s}
  .flash.h{background:radial-gradient(circle,#0000 40%,#40ff80aa);animation:fo .6s}
  @keyframes fo{from{opacity:1}to{opacity:0}}

  .game{display:flex;flex-direction:column;min-height:calc(100dvh - 24px);gap:10px}
  .top{display:flex;justify-content:space-between;align-items:center;padding:2px 2px 8px;border-bottom:1px solid var(--line)}
  .qn{font-family:var(--serif);font-size:1.5rem;font-weight:800;color:var(--gold)}
  .chip.pur{margin-left:8px}
  .net{display:flex;align-items:center;gap:6px;color:var(--mut);font-size:.8rem;margin-right:48px}

  .banner{text-align:center;padding:12px;border:1px solid var(--line);background:var(--s1);border-radius:12px;transition:.2s}
  .banner b{font-size:1.15rem;display:block}
  .banner.open{background:#4a1519;border-color:var(--red);animation:pulse 1s infinite}
  .banner.win{background:linear-gradient(180deg,#f0c964,var(--gold-d));color:#2a1c06;border-color:#fff3c0}
  .banner.other{background:#1f3350;border-color:var(--blu)}
  @keyframes pulse{50%{box-shadow:0 0 20px #e5545f88}}
  .ansbox{display:flex;flex-direction:column;gap:4px}
  .ans{display:flex;gap:8px}.ans .input{flex:1;min-width:0}
  .sent{font-size:.8rem;color:var(--mut)}.sent b{color:var(--gold)}
  .rank{font-size:.8rem;margin-top:4px;opacity:.9}

  .mid{flex:1;min-width:0}
  .strip{display:flex;gap:12px;overflow-x:auto;padding:12px 4px 12px;scroll-snap-type:x proximity}
  .strip :global(.unit){flex:0 0 138px;scroll-snap-align:start}
  .logbox{border-radius:12px;padding:10px 14px;box-shadow:inset 0 0 30px #8a6a3566;margin-bottom:8px}
  .logbox summary{cursor:pointer;color:#7a1f26;font-weight:800;letter-spacing:.3em;text-align:center;font-family:var(--serif)}
  .logbox p{margin:6px 0 0;font-size:.82rem;border-bottom:1px dotted #8a6a3577;padding-bottom:3px}
  .buzzarea{position:sticky;bottom:0;padding:14px 0 calc(8px + env(safe-area-inset-bottom));background:linear-gradient(180deg,#0000,var(--bg) 30%)}

  .over{position:fixed;inset:0;background:#000d;z-index:70;display:flex;align-items:center;justify-content:center;text-align:center}
  .ov-in{display:flex;flex-direction:column;gap:10px;align-items:center}
  .over h2{font-size:3rem;color:var(--gold)}.over h2.lose{color:var(--red)}
  .mine{font-size:1.05rem}.mine .ok{color:#8fe0a6}.mine .ng{color:#ff9aa2}

  /* PC: 左に自分とボタン、右に全員と年代記 */
  @media(min-width:900px){
    .game{display:grid;grid-template-columns:380px 1fr;grid-template-areas:"top top" "me mid" "banner mid" "ans mid" "buzz mid";gap:14px 28px;align-items:start;min-height:0}
    .ansbox{grid-area:ans}
    .top{grid-area:top}.a-me{grid-area:me}.banner{grid-area:banner}.mid{grid-area:mid}
    .buzzarea{grid-area:buzz;position:static;background:none;padding:6px 0}
    .strip{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));overflow:visible;gap:16px;padding:4px 0 14px}
    .strip :global(.unit){flex:none}
    .logbox[open]{max-height:40vh;overflow:auto}
  }
</style>
