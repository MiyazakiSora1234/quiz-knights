<script>
  // 勝利のときの紙吹雪（画面全体に降る）。色・位置・速さは固定の乱数で決める
  const N = 46;
  const pieces = Array.from({ length: N }, (_, i) => {
    const r = k => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
    return { left: r(1) * 100, delay: r(2) * 1.8, dur: 2.6 + r(3) * 2.2, size: 7 + r(4) * 9, hue: Math.floor(r(5) * 360), spin: 360 + r(6) * 720, drift: (r(7) - .5) * 160 };
  });
</script>

<div class="conf" aria-hidden="true">
  {#each pieces as p}
    <i style="left:{p.left}%;width:{p.size}px;height:{p.size * 1.6}px;background:hsl({p.hue} 85% 60%);animation-delay:{p.delay}s;animation-duration:{p.dur}s;--spin:{p.spin}deg;--drift:{p.drift}px"></i>
  {/each}
</div>

<style>
  .conf{position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:71}
  i{position:absolute;top:-30px;border-radius:2px;opacity:0;animation:fall linear infinite}
  @keyframes fall{0%{opacity:1;transform:translate(0,0) rotate(0)}100%{opacity:1;transform:translate(var(--drift),110vh) rotate(var(--spin))}}
</style>
