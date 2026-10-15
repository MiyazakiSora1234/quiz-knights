<script>
  import { flip } from 'svelte/animate';
  import { fly, slide } from 'svelte/transition';
  import { BOSS } from '../../lib/engine.js';
  import { panel, confirmAsk } from '../../lib/ui.svelte.js';
  import InviteCard from './InviteCard.svelte';
  import RosterRow from './RosterRow.svelte';
  import BossPicker from './BossPicker.svelte';
  import FoePicker from './FoePicker.svelte';

  // バトルの準備画面: 左に招待URLと参加者の名簿、右にモード・魔王・開始ボタン
  let { host } = $props();
  const pvp = $derived(host.mode === 'pvp');
  const offline = $derived(host.roster.filter(p => p.pid && !p.online).length);
  const teamCount = t => host.playersNamed.filter(p => p.team === t).length;
  const block = $derived(host.startBlock);
</script>

<div class="page">
  <div class="topbar">
    <div class="logo">QUIZ KNIGHTS <span class="sub">／ 進行役：バトルの準備</span></div>
    <div class="acts">
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
          <div animate:flip={{ duration: 220 }} in:fly={{ y: 12, duration: 220 }}><RosterRow {p} {pvp} onremove={() => host.remove(p)} ontransfer={() => host.transfer(p)} /></div>
        {/each}
        {#if !host.roster.length}
          <div class="empty"><b>参加者を待っています…</b>URLを共有してください。入室した人は、ここに自動で追加されます。</div>
        {/if}
      </div>
    </section>

    <aside class="side">
      <div class="panel">
        <h3>モード</h3>
        <div class="seg"><button class:sel={host.mode === 'cpu'} onclick={() => (host.mode = 'cpu')}>魔王戦</button><button class:sel={host.mode === 'squad'} onclick={() => (host.mode = 'squad')}>CPUチーム戦</button><button class:sel={pvp} onclick={() => (host.mode = 'pvp')}>ユーザー対戦</button></div>
        <div class="sub desc">{pvp ? '参加者を2チームに分けて戦います。片方が全滅したら決着です。' : host.mode === 'squad' ? '全員で協力して、CPUの職業チーム（戦士・僧侶など）と戦います。CPUの行動は進行役が操作します。' : '全員で協力して、魔王（CPU）を倒します。'}</div>
      </div>
      <div class="panel">
        <h3>早押しのルール</h3>
        <div class="seg"><button class:sel={host.buzzRule === 'next'} onclick={() => (host.buzzRule = 'next')}>誤答で次の問題へ</button><button class:sel={host.buzzRule === 'retry'} onclick={() => (host.buzzRule = 'retry')}>誤答者を除いて再受付</button></div>
        <div class="sub desc">{host.buzzRule === 'retry' ? '誰かが誤答しても問題は終わらず、その人を除いてもう一度早押しを受け付けます（全員が誤答すると終了）。' : '誰かが誤答したら、その問題は終わりです。'}</div>
      </div>
      {#if host.mode === 'cpu'}<BossPicker {host} />{:else if host.mode === 'squad'}<FoePicker {host} />{/if}

      <div class="start">
        <button class="btn primary xl wide" disabled={!!block} onclick={() => host.start()}>{block ? 'バトル開始' : `バトル開始（${host.playersNamed.length}人）`}</button>
        <div class="sub">{block || (pvp ? `チームA ${teamCount('p')}人 vs チームB ${teamCount('e')}人` : host.mode === 'squad' ? `CPU ${host.foes.length}体と戦います` : `${BOSS[host.boss].n} に挑みます`)}</div>
      </div>
    </aside>
  </div>
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
  .start{display:flex;flex-direction:column;gap:8px;padding:14px;border:1px solid var(--gold);border-radius:14px;background:linear-gradient(180deg,#2d2414,#1e1914)}
  .start .sub{text-align:center}
</style>
