<script>
  import { fade } from 'svelte/transition';
  import { icon } from '../lib/icons.js';

  // 戦闘中の演出イベント（コイントスなど）を、全員の画面の中央に出す。event = {id, kind:'coin', heads, who}
  let { event = null } = $props();
  const DUR = { coin: 2600, answer: 1100, bomb: 1700, job: 2200, transform: 2200, intro: 3200, bossdown: 2600, special: 1500, genre: 1800, round: 1000 };
  let shown = $state(null), timer = null;
  // 開いた時点ですでにあるイベントは出さない（再読み込み・途中入室で古い演出が出ないように）
  // svelte-ignore state_referenced_locally
  let last = event?.id ?? null;

  $effect(() => {
    const e = event;
    if (!e || e.id === last) return;
    last = e.id;
    shown = e;
    clearTimeout(timer);
    timer = setTimeout(() => { shown = null; }, DUR[e.kind] ?? 2000);
  });
  $effect(() => () => clearTimeout(timer));
</script>

{#if shown}
  {#key shown.id}
    <div class="stage" role="status" aria-live="polite" transition:fade={{ duration: 160 }}>
      {#if shown.kind === 'answer'}
        <div class="ans" class:ok={shown.ok} class:ng={!shown.ok}><span class="mark">{shown.ok ? '⭕' : '❌'}</span><b>{shown.who}{#if shown.text}「{shown.text}」{/if} {shown.ok ? '正解！' : '誤答…'}</b></div>
      {:else if shown.kind === 'bomb'}
        <div class="boom"><i class="bf"></i><span class="bomb">💥</span><b>{shown.mine ? `${shown.who} は地雷を踏んだ！` : `${shown.who} が爆発！`}</b></div>
      {:else if shown.kind === 'job'}
        <div class="job"><i class="rays"></i><div class="jt">転職！</div><div class="jn">{shown.who}　{shown.from} → <em>{shown.to}</em></div></div>
      {:else if shown.kind === 'intro'}
        <div class="intro"><i class="vig"></i>
          <div class="bs">{#each shown.bosses as b}<div class="bo"><span class="bi">{@html icon('boss' + b.bossId)}</span><b>{b.name}</b></div>{/each}</div>
          <div class="it">が　現れた！</div>
          {#if shown.bosses.length === 1}<div class="id">{shown.bosses[0].intro}</div>{/if}
        </div>
      {:else if shown.kind === 'bossdown'}
        <div class="bd"><i class="flare"></i><span class="bi big">{@html icon('boss' + (shown.bossId || 1))}</span><div class="jt">討伐！</div><div class="jn">{shown.who} を倒した</div></div>
      {:else if shown.kind === 'transform'}
        <div class="tf"><i class="pulse"></i>{#if shown.bossId}<span class="bi big tfi">{@html icon('boss' + shown.bossId)}</span>{/if}<div class="jt">変身！</div><div class="jn">{shown.who} が <em>{shown.form}</em> に</div></div>
      {:else if shown.kind === 'special'}
        <div class="sp"><i class="slashbig"></i><b>{shown.text}</b><span>{shown.who}</span></div>
      {:else if shown.kind === 'genre'}
        <div class="gn"><span>次の問題のジャンル</span><b>{shown.genre}</b></div>
      {:else if shown.kind === 'round'}
        <div class="rd">第{shown.q}問</div>
      {:else if shown.kind === 'coin'}
        <div class="who">{shown.who} の コイントス！</div>
        <div class="coin" class:tails={!shown.heads}>
          <div class="face front">表</div>
          <div class="face back">裏</div>
        </div>
        <div class="res" class:ng={!shown.heads}>{shown.heads ? '表！' : '裏…'}</div>
      {/if}
    </div>
  {/key}
{/if}

<style>
  .stage{position:fixed;inset:0;z-index:66;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:#000a;pointer-events:none;perspective:700px}
  .stage:has(.ans),.stage:has(.rd){background:#0005}
  .who{font-weight:900;font-size:1.2rem;color:#fff;text-shadow:0 2px 8px #000}
  .coin{position:relative;width:150px;height:150px;transform-style:preserve-3d;animation:toss 1.5s cubic-bezier(.3,.7,.4,1) forwards}
  .coin.tails{animation-name:toss-tails}
  .face{position:absolute;inset:0;border-radius:50%;display:grid;place-items:center;font-size:3.6rem;font-weight:900;color:#5a3a06;background:radial-gradient(circle at 35% 30%,#fff3c0,#e3b84f 55%,#b8892a);border:6px solid #f7d778;box-shadow:inset 0 0 18px #8a5a0a88,0 8px 30px #000b;backface-visibility:hidden}
  .face.back{transform:rotateY(180deg);background:radial-gradient(circle at 35% 30%,#e9eef5,#9fb3c8 55%,#6b7f94);border-color:#d7e3f0;color:#26384a}
  .res{font-size:2.4rem;font-weight:900;color:#ffe08a;text-shadow:0 0 22px #e3b84f;opacity:0;animation:res .4s 1.35s forwards}
  .res.ng{color:#ff9aa2;text-shadow:0 0 22px #e5545f}
  @keyframes toss{0%{transform:translateY(120px) rotateY(0) scale(.6)}35%{transform:translateY(-110px) rotateY(540deg) scale(1.15)}70%{transform:translateY(0) rotateY(1080deg) scale(1)}100%{transform:translateY(0) rotateY(1440deg) scale(1)}}
  @keyframes toss-tails{0%{transform:translateY(120px) rotateY(0) scale(.6)}35%{transform:translateY(-110px) rotateY(540deg) scale(1.15)}70%{transform:translateY(0) rotateY(1080deg) scale(1)}100%{transform:translateY(0) rotateY(1620deg) scale(1)}}
  @keyframes res{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
  .ans{display:flex;flex-direction:column;align-items:center;gap:6px;animation:stampin .35s cubic-bezier(.2,1.4,.4,1)}
  .ans .mark{font-size:6rem;filter:drop-shadow(0 0 20px currentColor)}.ans b{font-size:1.6rem;color:#fff;text-shadow:0 2px 10px #000}
  .ans.ng{animation:stampin .35s cubic-bezier(.2,1.4,.4,1),shk .4s .3s}
  .boom{position:relative;display:flex;flex-direction:column;align-items:center;gap:10px;animation:shk .6s}
  .boom .bf{position:fixed;inset:0;background:radial-gradient(circle,#fff,#ffb347 30%,#ff4d2a88 60%,#0000);animation:bf 1s ease-out forwards}
  .bomb{font-size:8rem;animation:bm 1s ease-out forwards;filter:drop-shadow(0 0 30px #ff9a3c)}
  .boom b{position:relative;font-size:1.5rem;color:#fff;text-shadow:0 2px 10px #000}
  .job,.tf{position:relative;display:flex;flex-direction:column;align-items:center;gap:8px;animation:stampin .5s cubic-bezier(.2,1.4,.4,1)}
  .jt{font-size:3.4rem;font-weight:900;color:#ffe08a;text-shadow:0 0 30px #e3b84f,0 4px 0 #8a5a0a;letter-spacing:.2em}
  .jn{font-size:1.3rem;color:#fff;text-shadow:0 2px 8px #000}.jn em{font-style:normal;color:#ffe08a;font-weight:900}
  .rays{position:fixed;left:50%;top:50%;width:160vmax;height:160vmax;margin:-80vmax;background:repeating-conic-gradient(#ffe08a33 0 8deg,#0000 8deg 20deg);animation:spin 3s linear;mask:radial-gradient(circle,#000 10%,#0000 60%)}
  .tf .jt{color:#d5a8ff;text-shadow:0 0 30px #9a5cff,0 4px 0 #4a2a8a}.tf .jn em{color:#d5a8ff}
  .pulse{position:fixed;inset:0;background:radial-gradient(circle,#9a5cff88,#0000 65%);animation:bf 1.6s ease-out}
  .sp{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;animation:stampin .3s cubic-bezier(.2,1.6,.4,1)}
  .sp b{font-size:3.2rem;font-weight:900;color:#ff6070;text-shadow:0 0 26px #ff3040,0 3px 0 #5a0610;letter-spacing:.12em;font-style:italic}.sp span{color:#fff;font-weight:700}
  .slashbig{position:fixed;left:-10%;top:42%;width:120%;height:6px;background:linear-gradient(90deg,#0000,#fff,#0000);transform:rotate(-12deg);box-shadow:0 0 24px #ff6070;animation:sl .45s ease-out}
  .gn{display:flex;flex-direction:column;align-items:center;gap:4px;animation:stampin .35s ease-out}.gn span{color:#ccc;font-size:.95rem}.gn b{font-size:2.6rem;color:#ffe08a;text-shadow:0 0 22px #e3b84f}
  .rd{font-size:4.2rem;font-weight:900;color:#ffe08a;font-family:var(--serif);text-shadow:0 0 26px #e3b84f,0 4px 0 #6a4a0a;animation:rdin 1s ease-out forwards}
  .intro{position:relative;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;padding:0 16px}
  .intro .vig{position:fixed;inset:0;background:radial-gradient(circle,#0000 20%,#5a0610cc 100%);animation:bf 3s ease-in forwards}
  .intro .bs{display:flex;gap:22px;flex-wrap:wrap;justify-content:center}
  .intro .bo{display:flex;flex-direction:column;align-items:center;gap:6px;animation:rise .9s cubic-bezier(.2,1.2,.4,1) both}
  .intro .bo b{font-family:var(--serif);font-size:2.2rem;color:#ff9aa2;letter-spacing:.14em;text-shadow:0 0 24px #e5545f,0 3px 0 #4a0610}
  .bi{display:grid;place-items:center;width:150px;height:150px;border-radius:50%;font-size:5.6rem;color:#f1e6cf;background:radial-gradient(circle,#4a1a20,#17090b);border:4px solid #e5545f;box-shadow:0 0 50px #e5545fcc,inset 0 0 30px #000;animation:bpulse 1.1s ease-in-out infinite}
  .bi.big{width:170px;height:170px;font-size:6.4rem}
  .intro .it{font-size:1.5rem;font-weight:900;color:#fff;letter-spacing:.2em;text-shadow:0 2px 10px #000;animation:rise 1.2s .4s both}
  .intro .id{max-width:30em;color:#e8d9bd;font-size:.95rem;animation:rise 1.2s .8s both}
  .bd,.tf{position:relative}
  .bd{display:flex;flex-direction:column;align-items:center;gap:10px;animation:stampin .5s cubic-bezier(.2,1.4,.4,1)}
  .bd .bi{border-color:#e3b84f;box-shadow:0 0 60px #e3b84f,inset 0 0 30px #000;animation:bfall 2.2s ease-in forwards}
  .flare{position:fixed;left:50%;top:50%;width:160vmax;height:160vmax;margin:-80vmax;background:repeating-conic-gradient(#ffe08a44 0 6deg,#0000 6deg 16deg);animation:spin 3s linear;mask:radial-gradient(circle,#000 10%,#0000 60%)}
  .tfi{border-color:#d5a8ff;box-shadow:0 0 60px #9a5cff,inset 0 0 30px #000;animation:bpulse .5s ease-in-out infinite}
  @keyframes rise{from{opacity:0;transform:translateY(24px) scale(.9)}to{opacity:1;transform:none}}
  @keyframes bpulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
  @keyframes bfall{0%{transform:scale(1);filter:none}40%{transform:scale(1.15) rotate(-4deg)}100%{transform:scale(.6) rotate(12deg);filter:grayscale(1) brightness(.5);opacity:.4}}
  @keyframes stampin{from{opacity:0;transform:scale(2.4)}to{opacity:1;transform:scale(1)}}
  @keyframes shk{0%,100%{transform:none}20%{transform:translate(-12px,4px)}40%{transform:translate(12px,-4px)}60%{transform:translate(-8px,2px)}80%{transform:translate(6px,0)}}
  @keyframes bf{0%{opacity:1}100%{opacity:0}}
  @keyframes bm{0%{transform:scale(.2);opacity:0}25%{transform:scale(1.4);opacity:1}100%{transform:scale(1.9);opacity:0}}
  @keyframes spin{to{transform:rotate(60deg)}}
  @keyframes sl{from{transform:translateX(-60%) rotate(-12deg);opacity:1}to{transform:translateX(60%) rotate(-12deg);opacity:0}}
  @keyframes rdin{0%{opacity:0;transform:scale(.5)}25%{opacity:1;transform:scale(1.15)}80%{opacity:1}100%{opacity:0;transform:scale(1)}}
</style>
