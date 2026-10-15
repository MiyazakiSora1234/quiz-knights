<script>
  import { fade, scale } from 'svelte/transition';
  import { tick } from 'svelte';
  import Unit from '../../components/Unit.svelte';
  import MePanel from './MePanel.svelte';
  import BuzzButton from './BuzzButton.svelte';
  import { sfx, vib } from '../../lib/sound.svelte.js';

  let { p } = $props();   // PlayStore
  const gs = $derived(p.gs);
  // 敵（自分と別の陣営）を上、味方を下に並べる
  const mySide = $derived(p.me?.side ?? 'p');
  const foes = $derived(gs.units.filter(u => u.side !== mySide));
  const allies = $derived(gs.units.filter(u => u.side === mySide));
  let text = $state(''), msg = $state(''), chatEl = $state();
  $effect(() => { p.chat.length; tick().then(() => { if (chatEl) chatEl.scrollTop = chatEl.scrollHeight; }); });
  const answers = $derived(p.chat.filter(c => c.answer && c.q === gs.q).slice(-8));

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
    <input class="input" bind:value={text} maxlength="60" placeholder="チャット回答" aria-label="チャット回答"><button class="btn sm" type="submit" disabled={!text.trim()}>回答</button>
  </form>
  {#if answers.length}<div class="answers">{#each answers as a}<div><b>{a.name}</b>{a.text}</div>{/each}</div>{/if}
  </div>

  {#if p.bannerText}
  <div class="banner {p.bannerKind}">
    <b>{p.bannerText}</b>
    {#if p.hasWinner}<div class="rank">{rankText(p.winner)}</div>{/if}
  </div>
  {/if}

  <div class="mid">
    {#if foes.length}
      <div class="grp foe">敵</div>
      <div class="strip">
        {#each foes as u (u.id)}
          <Unit {u} compact jobLabel={u.jobName} tags={tagsOf(u)} />
        {/each}
      </div>
    {/if}
    <div class="grp ally">味方</div>
    <div class="strip">
      {#each allies as u (u.id)}
        <Unit {u} compact ribbon={u.id === p.mine ? 'あなた' : ''} sel={u.id === p.mine} jobLabel={u.jobName} tags={tagsOf(u)} />
      {/each}
    </div>
    <div class="chatbox">
      <div class="cl" bind:this={chatEl}>
        {#each p.chat as c}
          <p class:sys={c.sys} class:ans={c.answer}>{#if !c.sys}<b>{c.name}</b>{/if}{#if c.answer}<i>回答</i>{/if}<span>{c.text}</span></p>
        {:else}<p class="sys"><span>チャット</span></p>{/each}
      </div>
      <form class="cs" onsubmit={(e) => { e.preventDefault(); p.sendChat(msg); msg = ''; }}><input class="input" bind:value={msg} maxlength="200" placeholder="チャット…" aria-label="チャット"><button class="btn sm" type="submit">送信</button></form>
    </div>
    <div class="logbox parch">
      <div class="lh">バトルログ</div>
      <div class="ll">{#each gs.log ?? [] as l}<p>{l}</p>{/each}</div>
    </div>
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
  .answers{display:flex;flex-direction:column;gap:3px;font-size:.85rem;max-height:7em;overflow:auto}
  .answers div{background:var(--s2);border:1px solid var(--line);border-radius:8px;padding:3px 10px;color:var(--gold);font-weight:700}
  .answers b{color:var(--mut);font-weight:500;margin-right:8px}
  .rank{font-size:.8rem;margin-top:4px;opacity:.9}

  .mid{flex:1;min-width:0}
  .grp{font-size:.8rem;font-weight:700;margin:2px 4px 0;display:flex;align-items:center;gap:6px}
  .grp::before{content:"";width:8px;height:8px;border-radius:50%;background:currentColor}
  .grp.foe{color:#ff9aa2}.grp.ally{color:#9cc8ee}
  .strip{display:flex;gap:12px;overflow-x:auto;padding:12px 4px 12px;scroll-snap-type:x proximity}
  .strip :global(.unit){flex:0 0 138px;scroll-snap-align:start}
  .logbox{border-radius:12px;padding:10px 14px;box-shadow:inset 0 0 30px #8a6a3566;margin-bottom:8px}
  .chatbox{display:flex;flex-direction:column;gap:6px;margin-bottom:8px}
  .cl{height:7em;overflow:auto;border:1px solid var(--line);border-radius:10px;background:var(--s1);padding:4px 10px;font-size:.84rem}
  .cl p{margin:3px 0;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}.cl .sys{color:var(--mut)}.cl b{color:var(--mut);font-weight:600}
  .cl i{font-style:normal;font-size:.68rem;background:var(--gold);color:#2a1c06;border-radius:4px;padding:0 5px;font-weight:800}.cl .ans span{color:var(--gold);font-weight:700}
  .cs{display:flex;gap:6px}.cs .input{flex:1;min-width:0}
  .lh{text-align:center;color:#7a1f26;font-weight:800;letter-spacing:.2em;font-family:var(--serif)}
  .ll{height:9.5em;overflow:auto}
  .logbox p{margin:6px 0 0;font-size:.82rem;border-bottom:1px dotted #8a6a3577;padding-bottom:3px}
  .buzzarea{position:sticky;bottom:0;padding:14px 0 calc(8px + env(safe-area-inset-bottom));background:linear-gradient(180deg,#0000,var(--bg) 30%)}

  .over{position:fixed;inset:0;background:#000d;z-index:70;display:flex;align-items:center;justify-content:center;text-align:center}
  .ov-in{display:flex;flex-direction:column;gap:10px;align-items:center}
  .over h2{font-size:3rem;color:var(--gold)}.over h2.lose{color:var(--red)}
  .mine{font-size:1.05rem}.mine .ok{color:#8fe0a6}.mine .ng{color:#ff9aa2}

  /* PC: 左に自分とボタン、右に全員とバトルログ */
  @media(min-width:900px){
    .game{display:grid;grid-template-columns:380px 1fr;grid-template-areas:"top top" "me mid" "banner mid" "ans mid" "buzz mid";gap:14px 28px;align-items:start;min-height:0}
    .ansbox{grid-area:ans}
    .top{grid-area:top}.a-me{grid-area:me}.banner{grid-area:banner}.mid{grid-area:mid}
    .buzzarea{grid-area:buzz;position:static;background:none;padding:6px 0}
    .strip{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));overflow:visible;gap:16px;padding:4px 0 14px}
    .strip :global(.unit){flex:none}
    .ll{height:22vh}
  }
</style>
