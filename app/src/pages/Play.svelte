<script>
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { panel, toast, confirmAsk } from '../lib/ui.svelte.js';
  import { PlayStore } from '../lib/play.svelte.js';
  import { sound, toggleSound } from '../lib/sound.svelte.js';
  import JoinForm from './play/JoinForm.svelte';
  import PlayLobby from './play/RoomView.svelte';
  import PlayGame from './play/PlayGame.svelte';
  import AskDialog from './play/AskDialog.svelte';

  let { id } = $props();
  let menu = $state(false);
  const copyUrl = async () => {
    const url = `${location.origin}/play?id=${id}`;
    try { await navigator.clipboard.writeText(url); toast('参加用URLをコピーしました'); } catch { toast(url, 6000); }
  };
  async function leave() { menu = false; if (await confirmAsk('退室しますか？', '部屋一覧に戻ります。', '退室する')) p.leave(); }
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
<svelte:window onclick={(e) => { if (!e.target.closest?.('.tools')) menu = false; }} />
<div class="tools">
  {#if p.phase === 'game'}
    <button onclick={() => (menu = !menu)} aria-label="メニュー" aria-expanded={menu}>☰</button>
    {#if menu}
      <div class="menu" transition:fly={{ y: -6, duration: 120 }}>
        <button class="mi" onclick={() => { panel.rules = true; menu = false; }}>📖 職業・ルール一覧</button>
        <button class="mi" onclick={() => { copyUrl(); menu = false; }}>🔗 参加用URLをコピー</button>
        <button class="mi" onclick={toggleSound}>{sound.on ? '🔊 効果音：オン' : '🔇 効果音：オフ'}</button>
        <div class="hr"></div>
        <button class="mi danger" onclick={leave}>⎋ 退室する</button>
      </div>
    {/if}
  {:else}
    <button onclick={toggleSound} aria-label="効果音">{sound.on ? '🔊' : '🔇'}</button>
  {/if}
</div>

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
</div>

<style>
  .wrap{max-width:560px;margin:0 auto;padding:12px 12px calc(12px + env(safe-area-inset-bottom));-webkit-user-select:none;user-select:none}
  .wrap :global(input){-webkit-user-select:text;user-select:text}
  .conn{position:fixed;left:0;right:0;top:0;z-index:90;background:var(--red-d);text-align:center;padding:5px;font-size:.85rem}
  .tools{position:fixed;right:10px;top:calc(10px + env(safe-area-inset-top));z-index:50}
  .tools button{width:38px;height:38px;border-radius:50%;background:#000a;border:1px solid var(--line2);font-size:1rem;line-height:1;padding:0;cursor:pointer}
  .tools{display:flex;flex-direction:column;align-items:flex-end}
  .menu{margin-top:8px;background:var(--s1);border:1px solid var(--line2);border-radius:12px;padding:6px;min-width:220px;box-shadow:0 14px 34px #000d}
  .tools .menu .mi{display:flex;width:100%;gap:10px;align-items:center;padding:10px 12px;background:none;border:0;border-radius:8px;text-align:left;cursor:pointer;height:auto;font-size:.95rem;color:var(--tx)}
  .tools .menu .mi:hover{background:var(--s3)}.tools .menu .mi.danger{color:#ff9aa2}
  .tools .menu .hr{height:1px;background:var(--line);margin:4px 6px}
  .center{display:grid;place-items:center;gap:12px;margin-top:30vh}
  .spin{width:34px;height:34px;border:3px solid var(--line2);border-top-color:var(--gold);border-radius:50%;animation:sp .8s linear infinite}
  @keyframes sp{to{transform:rotate(360deg)}}
  @media(min-width:900px){.wrap{max-width:1060px;padding:20px 24px}}
</style>
