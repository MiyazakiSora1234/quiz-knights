<script>
  import { fade, scale } from 'svelte/transition';
  import { tick } from 'svelte';
  import Unit from '../../components/Unit.svelte';
  import MePanel from './MePanel.svelte';
  import ScoreTable from '../../components/ScoreTable.svelte';
  import BuzzButton from './BuzzButton.svelte';
  import { sfx, vib } from '../../lib/sound.svelte.js';

  let { p } = $props();   // PlayStore
  const gs = $derived(p.gs);
  // 敵（自分と別の陣営）を上、味方を下に並べる
  const mySide = $derived(p.me?.side ?? 'p');
  const versus = $derived(gs.mode === 'pvp' && !gs.cpu);   // ユーザー対戦では、チームごとの色（A=青 / B=赤）で見せる
  const foes = $derived(gs.units.filter(u => u.side !== mySide));
  const allies = $derived(gs.units.filter(u => u.side === mySide));
  let text = $state(''), msg = $state(''), chatEl = $state();
  // チャットは初期状態では閉じておく。閉じている間に届いた分は件数で知らせる
  let chatOpen = $state(false), seen = $state(0);
  const unread = $derived(chatOpen ? 0 : Math.max(0, p.chat.filter(c => !c.answer && !c.sys).length - seen));
  const toggleChat = () => { chatOpen = !chatOpen; if (chatOpen) seen = p.chat.filter(c => !c.answer && !c.sys).length; };
  $effect(() => { if (chatOpen) seen = p.chat.filter(c => !c.answer && !c.sys).length; });
  $effect(() => { p.chat.length; tick().then(() => { if (chatEl) chatEl.scrollTop = chatEl.scrollHeight; }); });
  const bubbles = $derived.by(() => {
    const out = {};
    for (const c of p.chat) { const uid = c.answer && c.q === gs.q ? gs.pids?.[c.pid] : null; if (uid != null) out[uid] = c.text; }
    return out;
  });

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
    <button class="btn sm chat-t" type="button" onclick={toggleChat} aria-expanded={chatOpen} title="チャット">💬{#if unread}<span class="badge">{unread}</span>{/if}</button>
  </form>
  </div>

  <div class="mid">
    {#if foes.length}
      <div class="grp foe" class:ta={versus && mySide === 'e'}>{versus ? (mySide === "p" ? "チームB" : "チームA") + "（敵）" : '敵'}</div>
      <div class="strip">
        {#each foes as u (u.id)}
          <Unit {u} compact jobLabel={u.jobName} tags={tagsOf(u)} bubble={bubbles[u.id] ?? ''} acting={gs.acting === u.id} answering={gs.sel === u.id} dim={gs.sel != null && gs.sel !== u.id} />
        {/each}
      </div>
    {/if}
    <div class="grp ally" class:tb={versus && mySide === 'e'}>{versus ? (mySide === 'p' ? 'チームA' : 'チームB') + '（味方）' : '味方'}</div>
    <div class="strip">
      {#each allies as u (u.id)}
        <Unit {u} compact ribbon={u.id === gs.sel ? (u.id === p.mine ? 'あなた・回答中' : '回答中') : (u.id === p.mine ? 'あなた' : '')} sel={u.id === p.mine} jobLabel={u.jobName} tags={tagsOf(u)} bubble={bubbles[u.id] ?? ''} acting={gs.acting === u.id} answering={gs.sel === u.id} dim={gs.sel != null && gs.sel !== u.id} />
      {/each}
    </div>
    {#if chatOpen}
    <div class="chatbox">
      <div class="cl" bind:this={chatEl}>
        {#each p.chat as c}
          <p class:sys={c.sys} class:ans={c.answer}>{#if !c.sys}<b>{c.name}</b>{/if}{#if c.answer}<i>回答</i>{/if}<span>{c.text}</span></p>
        {:else}<p class="sys"><span>チャット</span></p>{/each}
      </div>
      <form class="cs" onsubmit={(e) => { e.preventDefault(); p.sendChat(msg); msg = ''; }}><input class="input" bind:value={msg} maxlength="200" placeholder="チャット…" aria-label="チャット"><button class="btn sm" type="submit">送信</button></form>
    </div>
    {/if}
  </div>

  {#if p.me}<div class="buzzarea"><BuzzButton {p} /></div>{/if}
</div>

{#if gs.over}
  <div class="over" transition:fade={{ duration: 200 }}>
    <div class="ov-in" in:scale={{ start: .9, duration: 260 }}>
      <h2 class:lose={p.lost}>{p.overText}</h2>
      <div class="sub">{gs.q - 1}問で決着</div>
      <ScoreTable units={gs.units} stats={gs.stats} mine={p.mine} />
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

  .ansbox{display:flex;flex-direction:column;gap:4px}
  .ans{display:flex;gap:8px}.ans .input{flex:1;min-width:0}

  .mid{flex:1;min-width:0}
  .grp{font-size:.8rem;font-weight:700;margin:2px 4px 0;display:flex;align-items:center;gap:6px}
  .grp::before{content:"";width:8px;height:8px;border-radius:50%;background:currentColor}
  .grp.foe{color:#ff9aa2}.grp.ally{color:#9cc8ee}.grp.ally.tb{color:#ff9aa2}.grp.foe.ta{color:#9cc8ee}
  .strip{display:flex;gap:12px;overflow-x:auto;padding:12px 4px 12px;scroll-snap-type:x proximity}
  .strip :global(.unit){flex:0 0 138px;scroll-snap-align:start}
  .logbox{border-radius:12px;padding:10px 14px;box-shadow:inset 0 0 30px #8a6a3566;margin-bottom:8px}
  .chat-t{position:relative;flex:none}
  .badge{position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;border-radius:9px;background:var(--red);color:#fff;font-size:.7rem;font-weight:800;display:grid;place-items:center;padding:0 4px}
  .chatbox{display:flex;flex-direction:column;gap:6px;margin-bottom:8px}
  .cl{height:7em;overflow:auto;border:1px solid var(--line);border-radius:10px;background:var(--s1);padding:4px 10px;font-size:.84rem}
  .cl{overflow-x:hidden}
  .cl p{margin:3px 0;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;min-width:0}
  .cl span{min-width:0;overflow-wrap:anywhere;word-break:break-word}.cl .sys{color:var(--mut)}.cl b{color:var(--mut);font-weight:600}
  .cl i{font-style:normal;font-size:.68rem;background:var(--gold);color:#2a1c06;border-radius:4px;padding:0 5px;font-weight:800}.cl .ans span{color:var(--gold);font-weight:700}
  .cs{display:flex;gap:6px}.cs .input{flex:1;min-width:0}
  .lh{text-align:center;color:#7a1f26;font-weight:800;letter-spacing:.2em;font-family:var(--serif)}
  .ll{height:9.5em;overflow:auto}
  .logbox p{margin:6px 0 0;font-size:.82rem;border-bottom:1px dotted #8a6a3577;padding-bottom:3px}
  .buzzarea{position:sticky;bottom:0;padding:14px 0 calc(8px + env(safe-area-inset-bottom));background:linear-gradient(180deg,#0000,var(--bg) 30%)}

  .over{position:fixed;inset:0;overflow:auto;padding:16px;background:#000d;z-index:70;display:flex;align-items:center;justify-content:center;text-align:center}
  .ov-in{display:flex;flex-direction:column;gap:12px;align-items:center;margin:auto}
  .over h2{font-size:3rem;color:var(--gold)}.over h2.lose{color:var(--red)}

  /* PC: 左に自分とボタン、右に全員とバトルログ */
  @media(min-width:900px){
    .game{display:grid;grid-template-columns:380px 1fr;grid-template-areas:"top top" "me mid" "ans mid" "buzz mid";gap:14px 28px;align-items:start;min-height:0}
    .ansbox{grid-area:ans}
    .top{grid-area:top}.a-me{grid-area:me}.mid{grid-area:mid}
    .buzzarea{grid-area:buzz;position:static;background:none;padding:6px 0}
    .strip{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));overflow:visible;gap:16px;padding:4px 0 14px}
    .strip :global(.unit){flex:none}
    .ll{height:22vh}
  }
</style>
