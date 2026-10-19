<script>
  import { fly, fade } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { tick } from 'svelte';
  import { icon } from '../../lib/icons.js';
  import { JOB, SELECTABLE, BOSS, bossIdOf, jobDescOf } from '../../lib/engine.js';
  import { panel, confirmAsk, toast } from '../../lib/stores/ui.svelte.js';

  // 待機中の部屋の画面（taQu の部屋に合わせた配置）: 上に部屋名と操作、中央に参加者、下に チャット と 大きなボタン
  let { p } = $props();   // PlayStore
  let msg = $state(''), logEl = $state();
  const jobKey = m => (SELECTABLE.includes(m.job) || bossIdOf(m.job) ? m.job : 'warrior');
  const jobN = k => (bossIdOf(k) ? BOSS[bossIdOf(k)].n : JOB[k].n);

  function send(e) { e.preventDefault(); if (!msg.trim()) return; p.sendChat(msg); msg = ''; }
  async function leave() { if (await confirmAsk('退室しますか？', '部屋一覧に戻ります。', '退室する')) p.leave(); }
  const time = ts => new Date(ts).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

  $effect(() => { p.chat.length; tick().then(() => { if (logEl) logEl.scrollTop = logEl.scrollHeight; }); });
</script>

<div class="room" in:fade={{ duration: 160 }}>
  <header class="rbar">
    <div class="ttl"><b>{p.roomName}</b><span class="sub"><span class="dot {p.hasHost && p.hostOnline ? 'on' : ''}"></span>{p.hasHost ? (p.hostOnline ? '進行役あり' : '進行役：接続待ち') : '進行役なし'} ・ {p.id}番</span></div>
    <div class="tools">
      <button class="btn sm qz" onclick={() => (panel.settings = 'quiz')}>⏱ クイズ設定</button>
      <button class="ib" onclick={() => (panel.rules = true)} title="職業・ルール" aria-label="職業・ルール">📖</button>
      <button class="ib" onclick={() => (panel.settings = 'user')} title="設定（名前・職業・チーム）" aria-label="設定">⚙</button>
      <button class="ib" onclick={leave} title="退室" aria-label="退室">⎋</button>
    </div>
  </header>

  <div class="members">
    {#each p.members as m (m.pid)}
      <div class="mcard" class:tb={m.team === 'e'} class:tc={m.team === 'c'} class:me={m.pid === p.pid} class:off={!m.online} animate:flip={{ duration: 200 }} in:fly={{ y: 8, duration: 180 }}>
        <span class="av">{@html icon(jobKey(m))}</span>
        <div class="mi">
          <b><span class="dot {m.online ? 'on' : ''}"></span><span class="nm">{m.name}</span><span class="tm {m.team === 'e' ? 'b' : m.team === 'c' ? 'c' : 'a'}">{m.team === 'e' ? 'B' : m.team === 'c' ? 'C' : 'A'}</span></b>
          <small><span class="jbn" role="button" tabindex="0" title="クリックで職業の説明" onclick={() => toast(`${jobN(jobKey(m))}：${jobDescOf(jobKey(m))}`, 5000)} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toast(`${jobN(jobKey(m))}：${jobDescOf(jobKey(m))}`, 5000))}>{jobN(jobKey(m))}</span>{m.flavor ? ` ・ ${m.flavor}` : ''}</small>
        </div>
      </div>
    {/each}
  </div>

  <div class="bottom">
    <div class="chat">
      <div class="log" bind:this={logEl}>
        {#each p.chat as c}
          <p class:sys={c.sys} class:host={c.host}><time>{time(c.ts)}</time>{#if !c.sys}<b>{c.name}</b>{/if}<span>{c.text}</span></p>
        {:else}<p class="sys"><span>ここに入退室とチャットが表示されます。</span></p>{/each}
      </div>
      <form class="send" onsubmit={send}><input class="input" bind:value={msg} maxlength="200" placeholder="メッセージ…" aria-label="メッセージ"><button class="btn" type="submit">送信</button></form>
    </div>
    {#if !p.hostOnline}
      <button class="big claim" onclick={() => p.claimHost()}><span>👑 進行役になる</span><small>{p.hasHost ? '進行役の接続が切れています。引き継げます' : '進行役がまだいません'}</small></button>
    {:else}
      <div class="big wait"><span>待機中</span><small>進行役がバトルを開始すると、自動で画面が切り替わります</small></div>
    {/if}
  </div>
</div>

<style>
  .room{display:flex;flex-direction:column;min-height:calc(100dvh - 24px);gap:12px}
  .rbar{flex:none;display:flex;justify-content:space-between;align-items:center;gap:10px;border-bottom:1px solid var(--line);padding:2px 0 10px}
  .ttl b{display:block;font-family:var(--serif);font-size:1.25rem;color:var(--gold);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60vw}
  .ttl .sub{display:flex;align-items:center;gap:6px;font-size:.8rem}
  .tools{display:flex;gap:6px;margin-right:48px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
  .qz{height:40px}
  .ib{width:40px;height:40px;border-radius:10px;background:var(--s2);border:1px solid var(--line);font-size:1.1rem;padding:0;cursor:pointer}
  .ib:hover{border-color:var(--gold)}
  .members{flex:1;display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;align-content:start}
  .mcard{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--s1)}
  .mcard{border-left:5px solid var(--blu-d)}.mcard.tb{border-left-color:var(--red-d)}.mcard.tc{border-left-color:var(--grn-d)}
  .tm{flex:none;margin-left:auto;font-size:.7rem;font-weight:800;border-radius:6px;padding:0 7px;line-height:1.5}
  .tm.a{background:var(--blu);color:#06182b}.tm.b{background:var(--red);color:#2b0609}.tm.c{background:var(--grn);color:#06220f}
  .mcard.me{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold) inset}.mcard.off{opacity:.5}
  .av{width:40px;height:40px;flex:none;border-radius:50%;display:grid;place-items:center;font-size:1.4rem;background:#120f0c;border:2px solid var(--line2)}
  .mi{min-width:0;flex:1}.mi b{display:flex;align-items:center;gap:6px;min-width:0}.mi .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}.mi .dot{flex:none}
  .jbn{cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px}
  .mi small{color:var(--mut);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bottom{flex:none;display:grid;grid-template-columns:minmax(0,1fr);gap:10px;border-top:1px solid var(--line);padding-top:12px;position:sticky;bottom:0;background:linear-gradient(180deg,#0000,var(--bg) 14px)}
  .chat{display:flex;flex-direction:column;gap:8px;min-width:0}
  .log{height:150px;overflow:auto;border:1px solid var(--line);border-radius:10px;background:var(--s1);padding:6px 10px;font-size:.88rem}
  .log{overflow-x:hidden}
  .log p{margin:4px 0;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;min-width:0}
  .log span{min-width:0;overflow-wrap:anywhere;word-break:break-word}.log p.sys{color:var(--mut)}.log p.host b{color:var(--gold)}
  .log time{color:var(--mut);font-size:.72rem}
  .send{display:flex;gap:8px}.send .input{flex:1}
  .big{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:110px;border-radius:14px;border:2px solid var(--line2);background:var(--s2);font-weight:800;font-size:1.6rem;color:var(--mut);cursor:default;text-align:center;padding:10px}
  .big small{font-size:.78rem;font-weight:400;color:var(--mut)}
  .big.claim{cursor:pointer;border-color:var(--gold);background:#3a2f1a;color:var(--gold)}.big.claim:hover{background:#4a3c20}
  @media(max-width:899px){
    .log{height:84px}.big{min-height:64px;font-size:1.25rem}.big small{display:none}.bottom{gap:6px;padding-top:8px}
    .members{padding-bottom:4px}
  }
  @media(min-width:900px){
    .room{min-height:calc(100dvh - 40px)}
    .bottom{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:stretch}.log{height:180px}.big{min-height:0}
  }
</style>
