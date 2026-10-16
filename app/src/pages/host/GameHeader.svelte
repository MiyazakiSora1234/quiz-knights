<script>
  import { fade, fly } from 'svelte/transition';
  import { panel, confirmAsk } from '../../lib/ui.svelte.js';
  import { sound, toggleSound } from '../../lib/sound.svelte.js';

  let { host, G, chatOpen = $bindable(false), answerCount = 0 } = $props();
  let menu = $state(false);
  const showGenre = $derived(G.genre && G.genreFor === G.q);

  async function quit() {
    if (await confirmAsk('最初からやり直しますか？', '進行中のバトルは破棄されて、準備画面に戻ります。', 'やり直す')) host.quit();
  }
  async function closeRoom() {
    if (await confirmAsk('部屋を閉じますか？', '参加者は全員退室になります。', '部屋を閉じる')) host.closeRoom();
  }
  /** Esc で閉じる／外側のクリックで閉じる */
  export function closeMenu() { menu = false; }
</script>

<svelte:window onclick={(e) => { if (!e.target.closest?.('.menuwrap')) menu = false; }} />

<header class="gbar"><div class="in">
  <div class="gl">
    <span class="logo">QUIZ KNIGHTS</span>
    {#if host.status !== 'ready'}<span class="chip red">再接続中…</span>{/if}
  </div>
  <div class="gc"><span class="qno">第{G.q}問</span>{#if showGenre}<span class="chip pur" transition:fade>ジャンル：{G.genre}</span>{/if}</div>
  <div class="gr">
    <button class="btn sm chatbtn" onclick={() => (chatOpen = !chatOpen)}>💬 チャット{#if answerCount}<span class="chip gold">回答 {answerCount}</span>{/if}</button>
    <button class="btn sm" disabled={!host.canUndo || host.busy} onclick={() => host.undo()}>↩ 1つ戻す<kbd>Ctrl+Z</kbd></button>
    <button class="btn sm" onclick={() => (panel.quiz = true)}>⏱ クイズ設定</button>
    <div class="menuwrap">
      <button class="btn sm" onclick={() => (menu = !menu)} aria-haspopup="true" aria-expanded={menu}>メニュー ▾</button>
      {#if menu}
        <div class="menu" transition:fly={{ y: -6, duration: 120 }}>
          <button class="mi" onclick={() => { panel.log = true; menu = false; }}>📜 バトルログ</button>
          <button class="mi" onclick={() => { panel.rules = true; menu = false; }}>📖 職業・ルール一覧</button>
          <button class="mi" onclick={() => { host.copyUrl(); menu = false; }}>🔗 参加用URLをコピー</button>
          <button class="mi" onclick={() => { host.buzzRule = ({ next: 'retry', retry: 'chain', chain: 'next' })[host.buzzRule]; }}>{host.buzzRule === 'chain' ? '⛓ 誤答：連チャン（次の順位へ）' : host.buzzRule === 'retry' ? '🔁 誤答：誤答者を除いて再受付' : '⏭ 誤答：次の問題へ'}</button>
          <button class="mi" onclick={toggleSound}>{sound.on ? '🔊 効果音：オン' : '🔇 効果音：オフ'}</button>
          <button class="mi" onclick={() => { menu = false; host.release(); }}>👑 進行役をやめる</button>
          <div class="hr"></div>
          <button class="mi danger" onclick={() => { menu = false; quit(); }}>↺ 最初からやり直す</button>
          <button class="mi danger" onclick={() => { menu = false; closeRoom(); }}>✕ 部屋を閉じる</button>
        </div>
      {/if}
    </div>
  </div>
</div></header>

<style>
  .gbar{border-bottom:1px solid var(--line);background:#14110ee6;position:sticky;top:0;z-index:30;backdrop-filter:blur(6px)}
  .in{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;padding:10px 18px;max-width:1320px;margin:0 auto}
  .gl{display:flex;align-items:center;gap:12px;min-width:0}
  .gl .logo{font-size:1rem;white-space:nowrap}
  .gc{display:flex;align-items:center;gap:10px}
  .gr{display:flex;gap:8px;justify-content:flex-end}
  .qno{font-family:var(--serif);font-size:1.7rem;font-weight:800;color:var(--gold);white-space:nowrap}
  .menuwrap{position:relative}
  .menu{position:absolute;right:0;top:calc(100% + 8px);background:var(--s1);border:1px solid var(--line2);border-radius:12px;padding:6px;min-width:230px;z-index:40;box-shadow:0 14px 34px #000d}
  .mi{display:flex;width:100%;gap:10px;align-items:center;padding:10px 12px;background:none;border:0;border-radius:8px;text-align:left;cursor:pointer}
  .mi:hover{background:var(--s3)}.mi.danger{color:#ff9aa2}
  .hr{height:1px;background:var(--line);margin:4px 6px}
  @media(max-width:900px){
    .in{display:flex;justify-content:space-between;padding:8px 12px}.gl{display:none}
    kbd{display:none}
  }
  @media(max-width:900px){
    .qno{font-size:1.5rem}
  }
</style>
