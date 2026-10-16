<script>
  import { panel, modal } from '../../lib/stores/ui.svelte.js';
  import { isBuzzKey } from '../../lib/buzzkey.js';

  let { p } = $props();   // PlayStore
  // ダイアログ（行動の選択・設定・ルールなど）が開いているときは、キーでは押さない
  const blocked = $derived(!!p.req || !!modal.req || panel.rules || panel.log || panel.quiz || !!panel.settings);
  function onkey(e) {
    if (!isBuzzKey(e, blocked)) return;
    e.preventDefault();                 // Space でのスクロール・Enter でのボタンの動作を止める
    p.buzz(e);
  }
</script>

<svelte:window onkeydown={onkey} />

<button class="buzz" class:on={p.canBuzz} class:sent={p.sent} class:win={p.myWin} disabled={!p.canBuzz} aria-keyshortcuts="Space Enter"
  onpointerdown={(e) => { e.preventDefault(); p.buzz(e); }}>{p.buzzLabel}</button>
{#if p.canBuzz}<div class="keyhint" aria-hidden="true">Space / Enter でも押せます</div>{/if}

<style>
  .keyhint{text-align:center;color:var(--mut);font-size:.78rem;margin-top:6px}
  @media(hover:none){.keyhint{display:none}}
  .buzz{display:block;margin:0 auto;width:min(66vw,250px,30dvh);aspect-ratio:1;border-radius:50%;font-size:2rem;font-weight:900;letter-spacing:.1em;border:6px double var(--line2);cursor:pointer;
    background:radial-gradient(circle at 35% 30%,#555,#2a2a2a);color:#999;touch-action:manipulation;transition:transform .05s;font-family:var(--sans)}
  .buzz:disabled{cursor:default}
  .buzz.on{background:radial-gradient(circle at 35% 30%,#f0626c,#a92b36 70%,#6a1119);color:#fff;border-color:var(--gold);text-shadow:0 2px 0 #0008;box-shadow:0 0 40px #e5545faa,inset 0 0 20px #0009;cursor:pointer}
  .buzz.on:active,.buzz.sent{transform:scale(.94)}
  .buzz.sent{background:radial-gradient(circle at 35% 30%,#7ad493,var(--grn-d));color:#fff;border-color:#c8e8b0}
  .buzz.win{background:radial-gradient(circle at 35% 30%,#f7d778,var(--gold-d));color:#2a1c06;border-color:#fff3c0;text-shadow:none;font-size:1.5rem}
  @media(min-width:900px){.buzz{width:280px}}
</style>
