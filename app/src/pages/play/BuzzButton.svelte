<script>
  let { p } = $props();   // PlayStore
</script>

<button class="buzz" class:on={p.canBuzz} class:sent={p.sent} class:win={p.myWin} disabled={!p.canBuzz}
  onpointerdown={(e) => { e.preventDefault(); p.buzz(e); }}>{p.buzzLabel}</button>

<style>
  .buzz{display:block;margin:0 auto;width:min(66vw,250px,30dvh);aspect-ratio:1;border-radius:50%;font-size:2rem;font-weight:900;letter-spacing:.1em;border:6px double var(--line2);cursor:pointer;
    background:radial-gradient(circle at 35% 30%,#555,#2a2a2a);color:#999;touch-action:manipulation;transition:transform .05s;font-family:var(--sans)}
  .buzz:disabled{cursor:default}
  .buzz.on{background:radial-gradient(circle at 35% 30%,#f0626c,#a92b36 70%,#6a1119);color:#fff;border-color:var(--gold);text-shadow:0 2px 0 #0008;box-shadow:0 0 40px #e5545faa,inset 0 0 20px #0009;cursor:pointer}
  .buzz.on:active,.buzz.sent{transform:scale(.94)}
  .buzz.sent{background:radial-gradient(circle at 35% 30%,#7ad493,var(--grn-d));color:#fff;border-color:#c8e8b0}
  .buzz.win{background:radial-gradient(circle at 35% 30%,#f7d778,var(--gold-d));color:#2a1c06;border-color:#fff3c0;text-shadow:none;font-size:1.5rem}
  @media(min-width:900px){.buzz{width:280px}}
</style>
