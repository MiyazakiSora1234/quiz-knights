<script>
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { PlayStore } from '../lib/stores/play.svelte.js';
  import { sound, toggleSound } from '../lib/stores/sound.svelte.js';
  import JoinForm from './play/JoinForm.svelte';
  import PlayLobby from './play/RoomView.svelte';
  import PlayGame from './play/PlayGame.svelte';
  import AskDialog from './play/AskDialog.svelte';
  import LogSheet from '../components/LogSheet.svelte';
  import PlaySettings from './play/PlaySettings.svelte';
  import Notice from '../components/Notice.svelte';
  import CpuThinking from '../components/CpuThinking.svelte';
  import EventFx from '../components/EventFx.svelte';

  let { id } = $props();
  // svelte-ignore state_referenced_locally
  const p = new PlayStore(id);

  /** スペースキーでも押せる（入力欄・ボタンにフォーカスがあるときは除く） */
  function onkey(e) {
    if (e.code === 'Space' && p.phase === 'game' && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement?.tagName)) { e.preventDefault(); p.buzz(e); }
  }

  // 別のタブを見ていても受付開始に気づけるよう、タブの題名で知らせる
  $effect(() => {
    const base = p.roomName ? `${p.roomName} - QUIZ KNIGHTS` : 'QUIZ KNIGHTS';
    document.title = (p.canBuzz && p.gs) ? `🔔 押せ！ ${base}` : (p.myWin ? `🎉 回答権！ ${base}` : base);
  });

  onMount(() => {
    p.init();
    const visible = () => { if (document.visibilityState === 'visible' && p.gs) p.keepAwake(); };
    document.addEventListener('visibilitychange', visible);
    return () => { document.removeEventListener('visibilitychange', visible); p.destroy(); };
  });
</script>

<svelte:window onkeydown={onkey} />

{#if p.status === 'reconnecting'}<div class="conn" transition:fade>接続が切れました。再接続しています…</div>{/if}
{#if p.phase === 'loading' || p.phase === 'connecting' || p.phase === 'join'}
  <div class="tools"><button onclick={toggleSound} aria-label="効果音">{sound.on ? '🔊' : '🔇'}</button></div>
{/if}

<div class="wrap">
  {#if p.phase === 'loading' || p.phase === 'connecting'}
    <div class="center"><div class="spin"></div><div class="sub">{p.phase === 'connecting' ? '入室しています…' : '読み込み中…'}</div></div>
  {:else if p.phase === 'join'}
    <JoinForm {p} />
  {:else if p.phase === 'lobby'}
    <PlayLobby {p} />
  {:else if p.gs}
    <PlayGame {p} />
  {/if}
  <AskDialog {p} />
  <PlaySettings {p} />
  {#if p.gs}<Notice notice={p.gs.notice} /><CpuThinking thinking={p.gs.thinking} /><EventFx event={p.gs.event} />{/if}
  <LogSheet lines={(p.gs?.log ?? []).map(m => ({ m }))} />
</div>

<style>
  .wrap{max-width:560px;margin:0 auto;padding:12px 12px calc(12px + env(safe-area-inset-bottom));-webkit-user-select:none;user-select:none}
  .wrap :global(input){-webkit-user-select:text;user-select:text}
  .conn{position:fixed;left:0;right:0;top:0;z-index:90;background:var(--red-d);text-align:center;padding:5px;font-size:.85rem}
  .tools{position:fixed;right:10px;top:calc(10px + env(safe-area-inset-top));z-index:50}
  .tools button{width:44px;height:44px;border-radius:50%;background:#000a;border:1px solid var(--line2);font-size:1rem;line-height:1;padding:0;cursor:pointer}
  .tools{display:flex;flex-direction:column;align-items:flex-end}
  .center{display:grid;place-items:center;gap:12px;margin-top:30vh}
  .spin{width:34px;height:34px;border:3px solid var(--line2);border-top-color:var(--gold);border-radius:50%;animation:sp .8s linear infinite}
  @keyframes sp{to{transform:rotate(360deg)}}
  @media(min-width:900px){.wrap{max-width:1060px;padding:20px 24px}}
</style>
