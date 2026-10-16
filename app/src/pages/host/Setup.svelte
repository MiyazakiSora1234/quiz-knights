<script>
  import { flip } from 'svelte/animate';
  import { fly, slide } from 'svelte/transition';
  import { BOSS } from '../../lib/engine.js';
  import { panel, confirmAsk } from '../../lib/ui.svelte.js';
  import InviteCard from './InviteCard.svelte';
  import RosterRow from './RosterRow.svelte';
  import FoePicker from '../../components/FoePicker.svelte';
  import { LEVELS } from '../../lib/engine.js';

  // バトルの準備画面: 左に招待URLと参加者の名簿、右にモード・魔王・開始ボタン
  let { host } = $props();
  const pvp = $derived(host.mode === 'pvp');
  const offline = $derived(host.roster.filter(p => p.pid && !p.online).length);
  const block = $derived(host.startBlock);
</script>

<div class="page">
  <div class="topbar">
    <div class="logo">QUIZ KNIGHTS <span class="sub">／ 進行役：バトルの準備</span></div>
    <div class="acts">
      <button class="btn sm" onclick={() => (panel.quiz = true)}>⏱ クイズ設定</button>
      <button class="btn sm" onclick={() => (panel.rules = true)}>職業・ルール一覧</button>
      <button class="btn sm" onclick={() => host.release()}>進行役をやめる</button>
      <button class="btn sm danger" onclick={async () => (await confirmAsk('部屋を閉じますか？', '参加者は全員退室になります。', '部屋を閉じる')) && host.closeRoom()}>部屋を閉じる</button>
    </div>
  </div>

  {#if host.saved}
    <div class="resume" transition:slide={{ duration: 160 }}>
      <div><b>途中のバトルがあります</b><span class="sub">（第{host.saved.q}問 ・ {host.saved.units.length}ユニット）</span></div>
      <div class="acts"><button class="btn primary" onclick={() => host.resume()}>続きから再開</button><button class="btn ghost" onclick={() => host.discardSaved()}>破棄</button></div>
    </div>
  {/if}

  <div class="grid">
    <section class="main">
      <InviteCard {host} />

      <div class="panel">
        <h3>参加者 <span class="chip">{host.roster.length}人</span>{#if offline}<span class="chip warn">オフライン {offline}</span>{/if}<button class="btn ghost sm rnd" onclick={() => host.randomizeJobs()} disabled={!host.roster.length}>🎲 全員の職業をランダムに</button></h3>
        {#each host.roster as p (p.key)}
          <div animate:flip={{ duration: 220 }} in:fly={{ y: 12, duration: 220 }}><RosterRow {p} {pvp} onremove={() => host.remove(p)} /></div>
        {/each}
        {#if !host.roster.length}
          <div class="empty"><b>参加者を待っています…</b>URLを共有してください。入室した人は、ここに自動で追加されます。</div>
        {/if}
      </div>
    </section>

    <aside class="side">
      <div class="panel">
        <h3>モード</h3>
        <div class="seg"><button class:sel={host.mode === 'cpu'} onclick={() => (host.mode = 'cpu')}>CPU戦</button><button class:sel={pvp} onclick={() => (host.mode = 'pvp')}>ユーザー対戦</button></div>
        <div class="sub desc">{pvp ? '参加者を2〜3チームに分けて戦います。最後に1チームだけ残れば決着です。' : '全員で協力して、魔王や職業のCPUと戦います。CPUは1問ごとに自動で行動します。'}</div>
      </div>
      {#if host.mode === 'cpu'}<FoePicker who={host} />{/if}

    </aside>
  </div>
  <div class="startbar"><div class="start">
    {#if block}<div class="info">{block}</div>{/if}
    <button class="btn primary go" disabled={!!block} onclick={() => host.start()}>{block ? 'バトル開始' : `バトル開始（${host.playersNamed.length}人）`}</button>
  </div></div>
</div>

<style>
  .page{max-width:1120px;margin:0 auto;padding:18px 18px 50px}
  .topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px;flex-wrap:wrap}
  .topbar .logo{font-size:1.25rem}.topbar .sub{font-family:var(--sans);letter-spacing:0;font-weight:400}
  .acts{display:flex;gap:8px;flex-wrap:wrap}
  .resume{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;background:#2d2414;border:1px solid var(--gold);border-radius:14px;padding:12px 16px;margin-bottom:16px}
  .resume b{display:block}
  .grid{display:grid;grid-template-columns:1fr 370px;gap:18px;align-items:start}
  .main{display:flex;flex-direction:column;gap:16px;min-width:0}
  .side{position:sticky;top:16px;display:flex;flex-direction:column;gap:16px}
  @media(max-width:900px){.grid{grid-template-columns:1fr}.side{position:static}}
  h3 .chip{font-family:var(--sans);font-weight:500;color:var(--tx);margin-left:6px}
  .chip.warn{border-color:var(--gold);color:var(--gold)}
  .desc{margin-top:8px}
  .empty{border:1px dashed var(--line2);border-radius:12px;padding:22px;text-align:center;color:var(--mut);margin-bottom:10px}
  .empty b{display:block;color:var(--tx)}
  .startbar{position:sticky;bottom:0;z-index:25;margin:18px -18px -50px;padding:14px 18px calc(14px + env(safe-area-inset-bottom));background:linear-gradient(180deg,#14110e00,#14110e 30%)}
  .start{max-width:560px;margin:0 auto;display:flex;align-items:center;justify-content:center;gap:14px;padding:8px;border:1px solid var(--gold);border-radius:16px;background:linear-gradient(180deg,#2d2414,#1e1914);box-shadow:0 -8px 30px #000a}
  .info{flex:none;max-width:45%;color:var(--mut);font-size:.88rem;line-height:1.35;padding-left:10px}
  .go{flex:1;padding:14px 24px;font-size:1.2rem;font-weight:800;letter-spacing:.08em;border-radius:12px}
  .go:disabled{filter:grayscale(.6);opacity:.55}
  @media(max-width:700px){.start{flex-direction:column-reverse;align-items:stretch;gap:6px}.info{max-width:none;text-align:center;padding:0}}
</style>
