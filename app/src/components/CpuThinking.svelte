<script>
  // CPUが早押しに勝って、答えを考えている間、画面の中央に大きく知らせる。thinking = { name } | null
  let { thinking = null } = $props();
</script>

{#if thinking}
  <div class="wrap" aria-live="assertive">
    <div class="box">
      <span class="who">🤖 {thinking.name}</span>
      <b>が先に押した！</b>
      <span class="dots">考え中<i>.</i><i>.</i><i>.</i></span>
    </div>
  </div>
{/if}

<style>
  .wrap{position:fixed;left:0;right:0;top:34%;z-index:66;display:flex;justify-content:center;padding:0 12px;pointer-events:none}
  .box{display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 26px;border-radius:18px;background:#10243dee;border:3px solid var(--gold,#f5c542);color:#fff;text-align:center;box-shadow:0 14px 50px #000c,0 0 36px #f5c54288;animation:pop .25s ease-out}
  .who{font-size:1.5rem;font-weight:800}
  b{font-size:1.05rem}
  .dots{font-size:1.2rem;color:#ffe9a8}
  .dots i{font-style:normal;animation:blink 1.2s infinite}
  .dots i:nth-child(2){animation-delay:.2s}.dots i:nth-child(3){animation-delay:.4s}
  @keyframes blink{0%,60%,100%{opacity:.2}30%{opacity:1}}
  @keyframes pop{from{transform:scale(.8);opacity:0}to{transform:scale(1);opacity:1}}
  @media(max-width:900px){.wrap{top:30%}.who{font-size:1.25rem}}
  @media(prefers-reduced-motion:reduce){.box,.dots i{animation:none}}
</style>
