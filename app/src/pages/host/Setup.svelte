<script>
  import { flip } from 'svelte/animate';
  import { fly, slide } from 'svelte/transition';
  import { icon } from '../../lib/icons.js';
  import { JOB, SELECTABLE, BOSS } from '../../lib/engine.js';
  import { panel, confirmAsk } from '../../lib/ui.svelte.js';

  let { host } = $props();
  const ps = $derived(host.roster);
  const pvp = $derived(host.mode === 'pvp');
  const nA = $derived(host.playersNamed.filter(p => p.team === 'p').length);
  const nB = $derived(host.playersNamed.filter(p => p.team === 'e').length);
  const block = $derived(host.startBlock);
</script>

<div class="page">
  <div class="topbar">
    <div class="logo">QUIZ KNIGHTS <span class="sub">／ 進行役：バトルの準備</span></div>
    <div class="acts">
      <button class="btn sm" onclick={() => (panel.rules = true)}>職業・ルール一覧</button>
      <button class="btn sm danger" onclick={async () => (await confirmAsk('部屋を閉じますか？', '参加者は全員退室になります。', '部屋を閉じる')) && host.closeRoom()}>部屋を閉じる</button>
    </div>
  </div>

  {#if host.saved}
    <div class="resume" transition:slide={{ duration: 160 }}>
      <div><b>途中のバトルがあります</b><span class="sub">（第{host.saved.q}問 ・ {host.saved.units.length}ユニット）</span></div>
      <div class="acts"><button class="btn primary" onclick={() => host.resume()}>続きから再開</button><button class="btn ghost" onclick={() => host.discardSaved()}>破棄</button></div>
    </div>
  {/if}

  <div class="grid2">
    <section class="col-main">
      <div class="panel">
        <div class="roomtitle">
          <div class="num">{host.id}</div>
          <div class="rt">
            <b>{host.roomName || '接続中…'}</b>
            <div class="sub">URLを参加者に送るか、部屋一覧の「参加」から入室してもらいます</div>
          </div>
          <span class="conn" title="サーバーとの通信"><span class="dot {host.status === 'ready' ? 'on' : 'warn'}"></span>{host.status === 'ready' ? (host.rtt != null ? `${host.rtt}ms` : '接続OK') : '接続中'}</span>
        </div>
        <div class="urlrow"><input class="input" readonly value={host.joinUrl} onfocus={(e) => e.currentTarget.select()} aria-label="参加用URL"><button class="btn primary" onclick={host.copyUrl}>URLをコピー</button></div>
      </div>

      <div class="panel">
        <h3>参加者 <span class="chip">{ps.length}人</span>{#if host.online !== ps.filter(p => p.pid).length}<span class="chip warn">オフライン {ps.filter(p => p.pid && !p.online).length}</span>{/if}</h3>
        {#each ps as p (p.key)}
          <div class="rrow" class:pvp animate:flip={{ duration: 220 }} in:fly={{ y: 12, duration: 220 }}>
            <div class="av">{@html icon(p.job)}</div>
            <div class="rname">
              <input class="input" bind:value={p.name} maxlength="12" aria-label="名前">
              <div class="sub"><span class="dot {p.pid ? (p.online ? 'on' : '') : 'warn'}"></span>{p.pid ? (p.online ? 'オンライン' : 'オフライン') : '手動追加'} ・ ATK{JOB[p.job].atk} / HP{JOB[p.job].hp}{p.flavor ? ` ・ ${p.flavor}` : ''}</div>
            </div>
            <select class="input" bind:value={p.job} onchange={() => (p.touchedJob = true)} aria-label="職業">
              {#each SELECTABLE as j}<option value={j}>{JOB[j].n}</option>{/each}
            </select>
            {#if pvp}
              <div class="seg">
                <button class="tp" class:sel={p.team === 'p'} onclick={() => { p.team = 'p'; p.touchedTeam = true; }}>チームA</button>
                <button class="te" class:sel={p.team === 'e'} onclick={() => { p.team = 'e'; p.touchedTeam = true; }}>チームB</button>
              </div>
            {/if}
            <button class="btn ghost sm" onclick={() => host.remove(p)} title={p.pid ? '退室させる' : '削除'} aria-label="削除">✕</button>
          </div>
        {/each}
        {#if !ps.length}
          <div class="empty"><b>参加者を待っています…</b>URLを共有してください。入室した人は、ここに自動で追加されます。</div>
        {/if}
        <button class="btn ghost sm" onclick={() => host.addGuest()}>＋ その場にいる人を手動で追加</button>
      </div>
    </section>

    <aside class="col-side">
      <div class="panel">
        <h3>モード</h3>
        <div class="seg"><button class:sel={!pvp} onclick={() => (host.mode = 'cpu')}>CPU戦</button><button class:sel={pvp} onclick={() => (host.mode = 'pvp')}>ユーザー対戦</button></div>
        <div class="sub" style="margin-top:8px">{pvp ? '参加者を2チームに分けて戦います。片方が全滅したら決着です。' : '全員で協力して、魔王（CPU）を倒します。'}</div>
      </div>

      <details class="panel genres">
        <summary>盗賊が選べるジャンル（{host.genreList.length}個）</summary>
        <div class="gchips">{#each host.genreList as g}<span class="chip">{g}</span>{/each}</div>
        <input class="input" bind:value={host.genresText} placeholder="理系、文系、青問、緑問、赤問" aria-label="ジャンル一覧">
        <div class="sub" style="margin-top:6px">「、」や「,」、スペースで区切って自由に増減できます（最大12個）。<button class="btn sm ghost" onclick={() => host.resetGenres()}>初期値に戻す</button></div>
      </details>

      {#if !pvp}
        <div class="panel" transition:slide={{ duration: 160 }}>
          <h3>魔王を選ぶ</h3>
          {#each Object.entries(BOSS) as [id, b]}
            <button class="bopt" class:sel={host.boss == id} onclick={() => (host.boss = +id)}>
              <span class="bi">{@html icon('boss')}</span>
              <span><b>{b.n}</b><small>{b.d}</small></span>
            </button>
          {/each}
          <label class="switch"><input type="checkbox" bind:checked={host.penalty}><span>魔王も誤答で2ダメージを受ける</span></label>
        </div>
      {/if}

      <div class="startbar">
        <button class="btn primary xl wide" disabled={!!block} onclick={() => host.start()}>{block ? 'バトル開始' : `バトル開始（${host.playersNamed.length}人）`}</button>
        <div class="sub">{block || (pvp ? `チームA ${nA}人 vs チームB ${nB}人` : `${BOSS[host.boss].n} に挑みます`)}</div>
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
  .grid2{display:grid;grid-template-columns:1fr 370px;gap:18px;align-items:start}
  .col-main{display:flex;flex-direction:column;gap:16px;min-width:0}
  .col-side{position:sticky;top:16px;display:flex;flex-direction:column;gap:16px}
  @media(max-width:900px){.grid2{grid-template-columns:1fr}.col-side{position:static}}
  .roomtitle{display:flex;gap:14px;align-items:center;margin-bottom:12px}
  .rt{flex:1;min-width:0}
  .num{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;font-family:var(--display);font-weight:800;font-size:1.3rem;background:#120f0c;border:2px solid var(--gold);color:var(--gold);flex:none}
  .rt b{font-size:1.2rem;font-family:var(--serif);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .conn{display:flex;align-items:center;gap:6px;font-size:.8rem;color:var(--mut);flex:none}
  .urlrow{display:flex;gap:8px}.urlrow .input{flex:1;font-size:.85rem;color:var(--mut)}
  .chip.warn{border-color:var(--gold);color:var(--gold)}
  h3 .chip{font-family:var(--sans);font-weight:500;color:var(--tx);margin-left:6px}
  .rrow{display:grid;grid-template-columns:44px minmax(110px,1fr) minmax(130px,176px) auto;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;margin-bottom:8px;background:var(--s2)}
  .rrow.pvp{grid-template-columns:44px minmax(110px,1fr) minmax(130px,176px) auto auto}
  @media(max-width:560px){.rrow,.rrow.pvp{grid-template-columns:44px minmax(0,1fr) auto}.rrow .av{grid-row:1}.rrow .rname{grid-row:1}.rrow > .btn{grid-column:3;grid-row:1}.rrow select{grid-column:1/-1;grid-row:2}.rrow .seg{grid-column:1/-1;grid-row:3}}
  .av{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-size:1.5rem;background:#120f0c;border:2px solid var(--line2)}
  .rname{min-width:0}.rname .input{padding:6px 10px;font-weight:700}
  .rname .sub{display:flex;align-items:center;gap:6px;margin-top:3px}
  .rrow select.input{width:100%}
  .rrow .seg button{padding:6px 12px}
  .seg .tp.sel{background:var(--blu);color:#06182b}.seg .te.sel{background:var(--red);color:#2b0609}
  .empty{border:1px dashed var(--line2);border-radius:12px;padding:22px;text-align:center;color:var(--mut);margin-bottom:10px}
  .empty b{display:block;color:var(--tx)}
  .bopt{display:flex;gap:12px;text-align:left;width:100%;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--s2);cursor:pointer;margin-bottom:8px;align-items:flex-start;transition:.1s}
  .bopt:hover{border-color:var(--line2)}
  .bopt.sel{border-color:var(--gold);background:#3a2f1a;box-shadow:0 0 0 1px var(--gold)}
  .bi{font-size:1.8rem;width:44px;height:44px;display:grid;place-items:center;border-radius:50%;background:#120f0c;border:2px solid var(--red-d);flex:none}
  .bopt.sel .bi{border-color:var(--gold)}
  .bopt b{display:block}.bopt small{display:block;color:var(--mut);font-size:.78rem;line-height:1.4}
  .switch{display:flex;align-items:center;gap:10px;margin-top:6px;cursor:pointer;font-size:.9rem}
  .switch input{width:18px;height:18px;accent-color:var(--gold)}
  .genres summary{cursor:pointer;color:var(--gold);font-family:var(--serif);font-weight:800}
  .gchips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}
  .genres .input{margin-top:4px}
  .startbar{display:flex;flex-direction:column;gap:8px;padding:14px;border:1px solid var(--gold);border-radius:14px;background:linear-gradient(180deg,#2d2414,#1e1914)}
  .startbar .sub{text-align:center}
</style>
