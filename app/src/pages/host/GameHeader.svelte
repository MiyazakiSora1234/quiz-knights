<script>
  import { fade } from 'svelte/transition';
  import TopTools from '../../components/TopTools.svelte';
  import { panel, confirmAsk } from '../../lib/stores/ui.svelte.js';
  import { sound, toggleSound } from '../../lib/stores/sound.svelte.js';

  let { host, G, chatOpen = $bindable(false), answerCount = 0 } = $props();
  let bar = $state();
  const showGenre = $derived(G.genre && G.genreFor === G.q);

  async function quit() {
    if (await confirmAsk('最初からやり直しますか？', '進行中のバトルは破棄されて、準備画面に戻ります。', 'やり直す')) host.quit();
  }
  async function closeRoom() {
    if (await confirmAsk('部屋を閉じますか？', '参加者は全員退室になります。', '部屋を閉じる')) host.closeRoom();
  }
  /** Esc でメニューを閉じる */
  export function closeMenu() { bar?.close(); }
  const RULE_LABEL = { next: ['⏭', '誤答：次の問題へ'], retry: ['🔁', '誤答：誤答者を除いて再受付'], chain: ['⛓', '誤答：連チャン（次の順位へ）'] };
  // 右上のボタンは、参加者の画面・準備画面と同じ並び（💬 ↩ ↪ 📜 ⏱ 📚 📖 🔊 ☰）
  const tools = $derived([
    { key: 'chat', icon: '💬', label: 'チャット', badge: answerCount || '', active: chatOpen, onclick: () => (chatOpen = !chatOpen) },
    { key: 'undo', icon: '↩', label: '1つ戻す', title: '1つ戻す（Ctrl+Z）', disabled: !host.canUndo || host.busy, onclick: () => host.undo() },
    { key: 'redo', icon: '↪', label: '1つ進める', title: '1つ進める（Ctrl+Y）', disabled: !host.canRedo || host.busy, onclick: () => host.redo() },
    { key: 'log', narrowMenu: true, icon: '📜', label: 'バトルログ', onclick: () => (panel.log = true) },
    { key: 'quiz', icon: '⏱', label: 'クイズ設定', onclick: () => (panel.quiz = true) },
    { key: 'bank', narrowMenu: true, icon: '📚', label: '問題集', onclick: () => (panel.bank = true) },
    { key: 'rules', narrowMenu: true, icon: '📖', label: 'ルール', title: '職業・ルール一覧', onclick: () => (panel.rules = true) },
    { key: 'sound', icon: sound.on ? '🔊' : '🔇', label: '効果音', title: sound.on ? '効果音：オン' : '効果音：オフ', onclick: toggleSound },
  ]);
  const menuItems = $derived([
    { icon: '🔗', label: '参加用URLをコピー', onclick: () => host.copyUrl() },
    { icon: RULE_LABEL[host.buzzRule][0], label: RULE_LABEL[host.buzzRule][1], onclick: () => { host.buzzRule = ({ next: 'retry', retry: 'chain', chain: 'next' })[host.buzzRule]; } },
    { icon: '👑', label: '進行役をやめる', onclick: () => host.release() },
    { hr: true },
    { icon: '↺', label: '最初からやり直す', danger: true, onclick: quit },
    { icon: '✕', label: '部屋を閉じる', danger: true, onclick: closeRoom },
  ]);
</script>

<header class="gbar"><div class="in">
  <div class="gl">
    <span class="logo">QUIZ KNIGHTS</span>
    {#if host.status !== 'ready'}<span class="chip red">再接続中…</span>{/if}
  </div>
  <div class="gc"><span class="qno">第{G.q}問</span>{#if showGenre}<span class="chip pur" transition:fade>ジャンル：{G.genre}</span>{/if}</div>
  <div class="gr"><TopTools bind:this={bar} labels {tools} menu={menuItems} /></div>
</div></header>

<style>
  .gbar{border-bottom:1px solid var(--line);background:#14110ee6;position:sticky;top:0;z-index:30;backdrop-filter:blur(6px)}
  .in{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:12px;padding:10px 18px;max-width:1320px;margin:0 auto}
  .gl{display:flex;align-items:center;gap:12px;min-width:0}
  .gl .logo{font-size:1rem;white-space:nowrap}
  .gc{display:flex;align-items:center;gap:10px}
  .gr{display:flex;gap:8px;justify-content:flex-end}
  .qno{font-family:var(--serif);font-size:1.7rem;font-weight:800;color:var(--gold);white-space:nowrap}
  @media(max-width:900px){
    .in{display:flex;justify-content:space-between;align-items:flex-start;padding:8px 12px}.gl{display:none}
    .gr{flex-wrap:wrap;gap:6px;align-items:center}
    .lbl{display:none}
    kbd{display:none}
  }
  @media(max-width:900px){
    .qno{font-size:1.5rem}
  }
</style>
