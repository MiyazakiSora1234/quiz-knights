<script>
  import { fade, scale, fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import Unit from '../../components/Unit.svelte';
  import { icon } from '../../lib/icons.js';
  import { JOB, bonusOf, nm } from '../../lib/engine.js';
  import { panel, sound, toggleSound, confirmAsk, modal, sfx, unlockAudio } from '../../lib/ui.svelte.js';

  let { host } = $props();
  const G = $derived(host.G);
  const foes = $derived(G.units.filter(u => u.side === 'e'));
  const allies = $derived(G.units.filter(u => u.side === 'p'));
  const sel = $derived(G.sel != null ? G.units.find(u => u.id === G.sel) : null);
  const pvp = $derived(G.mode === 'pvp');
  const showGenre = $derived(G.genre && G.genreFor === G.q);
  let menu = $state(false);

  function seatOf(u) {
    if (u.isBoss) return null;
    const row = G.units.filter(x => !x.isBoss && (!pvp || x.side === u.side));
    return row.indexOf(u) + 1;
  }
  function tagsFor(u) {
    const t = [];
    if (u.restNow) t.push({ t: '💤 今回休み', cls: 'warn' });
    if (u.restNext) t.push({ t: '次は休み' });
    if (u.job === 'tank') t.push({ t: `🛡 守り×${u.guards}`, cls: 'warn' });
    if (u.job === 'bm') t.push({ t: u.used ? '技使用済' : '技未使用' });
    if (JOB[u.job]?.tag && u.job !== 'tank') t.push({ t: JOB[u.job].tag });
    if (u.converted) t.push({ t: '魔王軍に寝返り', cls: 'warn' });
    if (u.isBoss && u.bossId === 1 && bonusOf(u)) t.push({ t: '与ダメ+2', cls: 'warn' });
    if (u.isBoss && u.bossId === 4) t.push({ t: '通常/ディレイ' });
    return t;
  }
  const canPick = u => u.alive && !u.restNow && !G.over && !host.busy;

  async function quit() {
    if (await confirmAsk('最初からやり直しますか？', '進行中のバトルは破棄されて、準備画面に戻ります。', 'やり直す')) host.quit();
  }
  async function closeRoom() {
    if (await confirmAsk('部屋を閉じますか？', '参加者は全員退室になります。', '部屋を閉じる')) host.closeRoom();
  }
  function rematch() {
    host.start();
  }

  function onkey(e) {
    if (modal.req || panel.rules) return;
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || e.metaKey || e.altKey) return;
    if (G.over) return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey) { if (k === 'z') { e.preventDefault(); host.undo(); } return; }
    if (k === 'escape') { menu = false; return; }
    if (host.busy) return;
    if (k === 'o' && sel) host.correct();
    else if (k === 'x' && sel) host.wrong();
    else if (k === 's') host.skip();
    else if (k === 'r') (sel ? host.deselect() : host.reopen());
  }

  // 結果の効果音
  let played = null;
  $effect(() => { if (G.over && played !== G.over) { played = G.over; (G.over === 'lose' ? sfx.defeat : sfx.victory)(); } if (!G.over) played = null; });
  const overText = $derived({ win: '勝利！', lose: '全滅…', teamp: 'チームAの勝利！', teame: 'チームBの勝利！', draw: '引き分け' }[G.over] ?? 'バトル終了');
</script>

<svelte:window onkeydown={onkey} onclick={(e) => { if (!e.target.closest?.('.menuwrap')) menu = false; }} onpointerdown={unlockAudio} />

<header class="gbar"><div class="gbar-in">
  <div class="gl">
    <span class="logo">QUIZ KNIGHTS</span>
    <button class="chip room" onclick={host.copyUrl} title="参加用URLをコピー">{host.id}番「{host.roomName}」 ・ {host.online}人</button>
    {#if host.status !== 'ready'}<span class="chip red">再接続中…</span>{/if}
  </div>
  <div class="gc"><span class="qno">第{G.q}問</span>{#if showGenre}<span class="chip pur" transition:fade>ジャンル：{G.genre}</span>{/if}</div>
  <div class="gr">
    <button class="btn sm" disabled={!host.canUndo || host.busy} onclick={() => host.undo()}>↩ 1つ戻す<kbd>Ctrl+Z</kbd></button>
    <div class="menuwrap">
      <button class="btn sm" onclick={() => (menu = !menu)} aria-haspopup="true" aria-expanded={menu}>メニュー ▾</button>
      {#if menu}
        <div class="menu" transition:fly={{ y: -6, duration: 120 }}>
          <button class="mi" onclick={() => { panel.rules = true; menu = false; }}>📖 職業・ルール一覧</button>
          <button class="mi" onclick={() => { host.copyUrl(); menu = false; }}>🔗 参加用URLをコピー</button>
          <button class="mi" onclick={() => { toggleSound(); }}>{sound.on ? '🔊 効果音：オン' : '🔇 効果音：オフ'}</button>
          <div class="mhr"></div>
          <button class="mi danger" onclick={() => { menu = false; quit(); }}>↺ 最初からやり直す</button>
          <button class="mi danger" onclick={() => { menu = false; closeRoom(); }}>✕ 部屋を閉じる</button>
        </div>
      {/if}
    </div>
  </div>
</div></header>

<div class="layout2">
  <main class="stage">
    <div class="team-label foe">{pvp ? 'チームB' : '魔王軍'}</div>
    <div class="foes">
      {#each foes as u (u.id)}
        <Unit {u} sel={G.sel === u.id} can={canPick(u)} onpick={() => host.select(u.id)} ribbon={G.sel === u.id ? '回答中' : ''} tags={tagsFor(u)} seat={pvp ? seatOf(u) : null} />
      {/each}
    </div>
    <div class="team-label ally" style="margin-top:8px">{pvp ? 'チームA' : 'プレイヤー'}</div>
    <div class="units">
      {#each allies as u (u.id)}
        <div animate:flip={{ duration: 240 }}>
          <Unit {u} sel={G.sel === u.id} can={canPick(u)} onpick={() => host.select(u.id)} ribbon={G.sel === u.id ? '回答中' : ''} tags={tagsFor(u)} seat={seatOf(u)} />
        </div>
      {/each}
    </div>
  </main>

  <aside class="side">
    <div class="ctl panel" class:answering={!!sel}>
      {#if G.over}
        <div class="ctl-state">バトル終了</div>
      {:else}
        <div class="ctl-state"><span class="dot {sel ? 'warn' : 'blue'}"></span><span>{sel ? '回答中' : '早押し受付中…'}</span></div>
        <div class="ctl-who" class:none={!sel}>
          {#if sel}<span class="wi">{@html icon(sel.isBoss ? 'boss' : sel.job)}</span>{nm(sel)}{:else}押された人がここに表示されます{/if}
        </div>
        <div class="ctl-rank">{host.rank}</div>
        <div class="ctl-main">
          <button class="btn ok xl" disabled={!sel || host.busy} onclick={() => host.correct()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg><span>正解<kbd>O</kbd></span>
          </button>
          <button class="btn ng xl" disabled={!sel || host.busy} onclick={() => host.wrong()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l14 14M19 5L5 19"/></svg><span>誤答<kbd>X</kbd></span>
          </button>
        </div>
        <div class="ctl-sub">
          <button class="btn" disabled={host.busy} onclick={() => host.skip()} title="誰も答えなかった">誰も答えず<kbd>S</kbd></button>
          <button class="btn ghost" disabled={host.busy} onclick={() => (sel ? host.deselect() : host.reopen())}>{sel ? '選び直す' : '受付やり直し'}<kbd>R</kbd></button>
        </div>
      {/if}
    </div>
    <div class="logwrap parch">
      <div class="log-h">年代記</div>
      <div class="log">
        {#each G.log.slice(0, 60) as l, i (G.log.length - i)}
          <p class={l.c}>{l.m}</p>
        {/each}
      </div>
    </div>
  </aside>
</div>

{#if G.over}
  <div class="over" transition:fade={{ duration: 200 }}>
    <div class="ov-in" in:scale={{ start: .9, duration: 260 }}>
      <h2 class:lose={G.over === 'lose'}>{overText}</h2>
      <div class="sub">{G.q - 1}問で決着</div>
      <table class="score">
        <thead><tr><th>プレイヤー</th><th>正解</th><th>誤答</th></tr></thead>
        <tbody>
          {#each allies.concat(foes.filter(f => !f.isBoss)) as u (u.id)}
            <tr class:dead={!u.alive}><td><span class="si">{@html icon(u.job)}</span>{u.name}</td><td class="ok">{G.stats?.[u.id]?.correct ?? 0}</td><td class="ng">{G.stats?.[u.id]?.wrong ?? 0}</td></tr>
          {/each}
        </tbody>
      </table>
      <div class="ov-acts">
        <button class="btn primary lg" onclick={rematch}>同じメンバーでもう一度</button>
        <button class="btn lg" onclick={() => host.quit()}>準備画面に戻る</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .gbar{border-bottom:1px solid var(--line);background:#14110ee6;position:sticky;top:0;z-index:30;backdrop-filter:blur(6px)}
  .gbar-in{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;padding:10px 18px;max-width:1320px;margin:0 auto}
  .gl{display:flex;align-items:center;gap:12px;min-width:0}
  .gl .logo{font-size:1rem;white-space:nowrap}
  .gc{display:flex;align-items:center;gap:10px}
  .gr{display:flex;gap:8px;justify-content:flex-end}
  .qno{font-family:var(--serif);font-size:1.7rem;font-weight:800;color:var(--gold);white-space:nowrap}
  .chip.pur{border-color:var(--pur);color:#d3b6ee}
  .chip.room{cursor:pointer;background:var(--s2);padding:4px 12px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .chip.room:hover{border-color:var(--gold)}
  .menuwrap{position:relative}
  .menu{position:absolute;right:0;top:calc(100% + 8px);background:var(--s1);border:1px solid var(--line2);border-radius:12px;padding:6px;min-width:230px;z-index:40;box-shadow:0 14px 34px #000d}
  .mi{display:flex;width:100%;gap:10px;align-items:center;padding:10px 12px;background:none;border:0;border-radius:8px;text-align:left;cursor:pointer}
  .mi:hover{background:var(--s3)}.mi.danger{color:#ff9aa2}
  .mhr{height:1px;background:var(--line);margin:4px 6px}

  .layout2{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:22px;max-width:1320px;margin:0 auto;padding:18px}
  .team-label{display:flex;align-items:center;gap:8px;font-weight:700;margin:4px 0 12px}
  .team-label::before{content:"";width:10px;height:10px;border-radius:50%;background:currentColor}
  .team-label.foe{color:#ff9aa2}.team-label.ally{color:#9cc8ee}
  .team-label::after{content:"";flex:1;height:1px;background:var(--line)}
  .foes{display:flex;flex-wrap:wrap;justify-content:center;gap:16px;margin-bottom:22px}
  .foes :global(.unit){width:min(100%,176px)}
  .foes :global(.unit:only-child){width:min(100%,300px)}
  .foes :global(.unit:only-child .ic-wrap){width:64px;height:64px;font-size:2.4rem}
  .foes :global(.unit:only-child .nm){font-size:1.2rem}
  .units{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:16px;margin-bottom:22px}
  .units > div{display:flex}.units :global(.unit){width:100%}

  .side{position:sticky;top:76px;align-self:start;display:flex;flex-direction:column;gap:14px;max-height:calc(100vh - 92px)}
  .ctl{padding:16px;display:flex;flex-direction:column;gap:12px;transition:.15s}
  .ctl.answering{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold),0 0 28px #e3b84f33}
  .ctl-state{display:flex;align-items:center;gap:8px;color:var(--mut);font-size:.9rem;font-weight:500}
  .ctl-state .dot.blue{background:var(--blu);box-shadow:0 0 8px var(--blu);animation:pl 1.2s infinite}
  .ctl.answering .ctl-state{color:var(--gold)}
  @keyframes pl{50%{opacity:.35}}
  .ctl-who{font-family:var(--serif);font-size:1.45rem;font-weight:800;min-height:2.4rem;line-height:1.2;display:flex;align-items:center;gap:10px}
  .ctl-who.none{color:var(--dim);font-size:1rem;font-family:var(--sans);font-weight:400}
  .wi{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;font-size:1.4rem;background:#120f0c;border:2px solid var(--gold);flex:none}
  .ctl-rank{font-size:.8rem;color:var(--mut);min-height:1.2em}
  .ctl-main{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .ctl-main .btn{flex-direction:column;gap:2px;padding:16px 8px}
  .ctl-main svg{width:26px;height:26px}
  .ctl-main kbd{font-size:.65rem}
  .ctl-sub{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .logwrap{border-radius:12px;padding:12px 16px;overflow:auto;flex:1;min-height:120px;box-shadow:inset 0 0 40px #8a6a3566}
  .log-h{text-align:center;font-family:var(--serif);font-weight:800;color:#7a1f26;letter-spacing:.3em;margin-bottom:6px}
  .log p{margin:0 0 6px;padding-bottom:6px;border-bottom:1px dotted #8a6a3577;font-size:.85rem}
  .log p.sys{color:#7a1f26;font-weight:700}.log p.dmg{color:#9a2630}.log p.heal{color:#2f6a2a}

  .over{position:fixed;inset:0;background:radial-gradient(circle,#000a,#000f);display:flex;align-items:center;justify-content:center;z-index:60;text-align:center}
  .ov-in{display:flex;flex-direction:column;gap:18px;align-items:center}
  .over h2{font-size:clamp(2.4rem,8vw,4rem);color:var(--gold);text-shadow:0 0 30px currentColor}
  .over h2.lose{color:var(--red)}
  .score{border-collapse:collapse;min-width:min(86vw,340px);background:#0006;border:1px solid var(--line2);border-radius:12px;overflow:hidden;font-size:.95rem}
  .score th,.score td{padding:6px 14px;text-align:center}.score th{color:var(--mut);font-weight:500;font-size:.8rem;border-bottom:1px solid var(--line)}
  .score td:first-child,.score th:first-child{text-align:left}
  .score td.ok{color:#8fe0a6;font-weight:700}.score td.ng{color:#ff9aa2;font-weight:700}.score tr.dead td:first-child{opacity:.55}
  .si{display:inline-block;width:1.4em;margin-right:6px;font-size:1.1rem;vertical-align:middle}
  .ov-acts{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
  @media(max-width:560px){.ov-acts{flex-direction:column;align-items:stretch;width:min(86vw,320px)}}

  @media(max-width:900px){
    .gbar-in{display:flex;justify-content:space-between;padding:8px 12px}.gl{display:none}
    kbd{display:none}
    .layout2{grid-template-columns:1fr;padding:12px 12px 270px}
    .side{position:fixed;left:0;right:0;bottom:0;top:auto;z-index:30;max-height:none;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:linear-gradient(180deg,#14110ecc,#14110e 30%);border-top:1px solid var(--line2);gap:8px}
    .logwrap{display:none}
    .ctl{padding:10px;gap:8px}.ctl-who{font-size:1.15rem;min-height:1.8rem}
    .ctl-main .btn{flex-direction:row;padding:12px 8px;gap:8px}
    .units{grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}
    .foes :global(.unit:only-child){width:min(100%,230px)}
    .foes :global(.unit:only-child .ic-wrap){width:52px;height:52px;font-size:1.9rem}
  }
</style>
