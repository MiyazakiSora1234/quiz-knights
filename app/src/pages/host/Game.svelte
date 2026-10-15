<script>
  import GameHeader from './GameHeader.svelte';
  import Stage from './Stage.svelte';
  import ControlPanel from './ControlPanel.svelte';
  import GameOver from './GameOver.svelte';
  import UnitEditor from './UnitEditor.svelte';
  import ChatPanel from './ChatPanel.svelte';
  import LogSheet from '../../components/LogSheet.svelte';
  import Notice from '../../components/Notice.svelte';
  import { fade, fly } from 'svelte/transition';
  import { panel, modal } from '../../lib/ui.svelte.js';
  import { sfx, unlockAudio } from '../../lib/sound.svelte.js';

  // バトル画面: 左に舞台（魔王とプレイヤー）、右に進行パネルとバトルログ。スマホでは進行パネルが下に固定される
  let { host } = $props();
  const G = $derived(host.G);
  let header;
  let chatOpen = $state(false);
  const answerCount = $derived(host.chat.filter(c => c.answer && c.q === G.q).length);

  /** キーボード操作: O=正解 X=誤答 S=スルー R=選び直し/受付やり直し Ctrl+Z=戻す */
  function onkey(e) {
    if (modal.req || panel.rules || panel.log || host.editing != null) return;
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || e.metaKey || e.altKey) return;
    if (G.over) return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey) { if (k === 'z') { e.preventDefault(); host.undo(); } return; }
    if (k === 'escape') { header?.closeMenu(); return; }
    if (host.busy) return;
    const sel = G.sel != null;
    if (k === 'o' && sel) host.correct();
    else if (k === 'x' && sel) host.wrong();
    else if (k === 's') host.skip();
    else if (k === 'r') (sel ? host.deselect() : host.reopen());
  }

  // 結果の効果音
  let played = null;
  $effect(() => {
    if (G.over && played !== G.over) { played = G.over; (G.over === 'lose' ? sfx.defeat : sfx.victory)(); }
    if (!G.over) played = null;
  });
</script>

<svelte:window onkeydown={onkey} onpointerdown={unlockAudio} />

<GameHeader bind:this={header} {host} {G} bind:chatOpen {answerCount} />

<div class="layout">
  <Stage {host} {G} />
  <aside class="side">
    <ControlPanel {host} {G} />
  </aside>
</div>

{#if G.over}<GameOver {host} {G} />{/if}
<UnitEditor {host} {G} />
<Notice notice={G.notice} />
<LogSheet lines={G.log} />
{#if host.waiting}
  <div class="wait" transition:fly={{ y: -10, duration: 150 }}><span class="spin"></span><span>{host.waiting.name} が選択中…</span><button class="btn ghost sm" onclick={() => host.abortWaiting()}>取り消す</button></div>
{/if}
{#if chatOpen}
  <div class="sheet" role="presentation" onclick={(e) => e.target === e.currentTarget && (chatOpen = false)} transition:fade={{ duration: 120 }}>
    <div class="sheet-in" in:fly={{ y: 16, duration: 180 }}>
      <button class="btn ghost sm close" onclick={() => (chatOpen = false)}>閉じる ✕</button>
      <ChatPanel {host} {G} />
    </div>
  </div>
{/if}

<style>
  .wait{position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:55;display:flex;align-items:center;gap:10px;background:var(--s1);border:1px solid var(--gold);border-radius:999px;padding:6px 8px 6px 16px;box-shadow:0 8px 24px #000a;font-weight:700}
  .spin{width:14px;height:14px;border:2px solid var(--line2);border-top-color:var(--gold);border-radius:50%;animation:sp .8s linear infinite}
  @keyframes sp{to{transform:rotate(360deg)}}
  .sheet{position:fixed;inset:0;background:#0009;z-index:60;display:flex;justify-content:flex-end;align-items:flex-start;padding:64px 14px 14px}
  .sheet-in{width:min(100%,420px);max-height:calc(100dvh - 80px);overflow:auto;display:flex;flex-direction:column;gap:6px}
  .sheet-in .close{align-self:flex-end}
  .layout{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:22px;max-width:1320px;margin:0 auto;padding:18px}
  .side{position:sticky;top:76px;align-self:start;display:flex;flex-direction:column;gap:14px;max-height:calc(100vh - 92px);overflow:auto}
  @media(max-width:900px){
    .layout{grid-template-columns:1fr;padding:12px 12px 270px}
    .side{position:fixed;left:0;right:0;bottom:0;top:auto;z-index:30;max-height:none;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:linear-gradient(180deg,#14110ecc,#14110e 30%);border-top:1px solid var(--line2);gap:8px}
  }
</style>
