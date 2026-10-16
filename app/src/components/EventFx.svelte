<script>
  import { fade } from 'svelte/transition';

  // 戦闘中の演出イベント（コイントスなど）を、全員の画面の中央に出す。event = {id, kind:'coin', heads, who}
  let { event = null } = $props();
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
    timer = setTimeout(() => { shown = null; }, 2600);
  });
  $effect(() => () => clearTimeout(timer));
</script>

{#if shown}
  {#key shown.id}
    <div class="stage" role="status" aria-live="polite" transition:fade={{ duration: 160 }}>
      {#if shown.kind === 'coin'}
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
</style>
