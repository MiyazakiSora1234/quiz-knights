<script>
  import { fly, fade } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { tick } from 'svelte';
  import { icon } from '../../lib/icons.js';
  import { JOB, SELECTABLE } from '../../lib/engine.js';
  import { panel, confirmAsk } from '../../lib/ui.svelte.js';

  // 待機中の部屋の画面（taQu の部屋に合わせた配置）: 上に部屋名と操作、中央に参加者、下に チャット と 大きなボタン
  let { p } = $props();   // PlayStore
  let dlg = $state(false), n = $state(''), f = $state(''), rn = $state(''), rp = $state('');
  let msg = $state(''), logEl = $state();
  const jobKey = m => (SELECTABLE.includes(m.job) ? m.job : 'warrior');

  function openSettings() { n = p.name; f = p.flavor; rn = p.roomName; rp = ''; dlg = true; }
  function save() {
    if (!n.trim()) return;
    p.saveProfile(n, f);
    if (!p.hasHost && rn.trim() && (rn.trim() !== p.roomName || rp !== '')) p.saveRoom(rn, rp);
    dlg = false;
  }
  function send(e) { e.preventDefault(); if (!msg.trim()) return; p.sendChat(msg); msg = ''; }
  async function leave() { if (await confirmAsk('退室しますか？', '部屋一覧に戻ります。', '退室する')) p.leave(); }
  const time = ts => new Date(ts).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

  $effect(() => { p.chat.length; tick().then(() => { if (logEl) logEl.scrollTop = logEl.scrollHeight; }); });
</script>

<div class="room" in:fade={{ duration: 160 }}>
  <header class="bar">
    <div class="ttl"><b>{p.roomName}</b><span class="sub"><span class="dot {p.hasHost && p.hostOnline ? 'on' : ''}"></span>{p.hasHost ? (p.hostOnline ? '進行役あり' : '進行役：接続待ち') : '進行役なし'} ・ {p.id}番</span></div>
    <div class="tools">
      <button class="ib" onclick={() => (panel.rules = true)} title="職業・ルール" aria-label="職業・ルール">📖</button>
      <button class="ib" onclick={openSettings} title="設定（名前・職業・チーム）" aria-label="設定">⚙</button>
      <button class="ib" onclick={leave} title="退室" aria-label="退室">⎋</button>
    </div>
  </header>

  <div class="members">
    {#each p.members as m (m.pid)}
      <div class="mcard" class:me={m.pid === p.pid} class:off={!m.online} animate:flip={{ duration: 200 }} in:fly={{ y: 8, duration: 180 }}>
        <span class="av">{@html icon(jobKey(m))}</span>
        <div class="mi">
          <b><span class="dot {m.online ? 'on' : ''}"></span>{m.name}</b>
          <small>{JOB[jobKey(m)].n}・チーム{m.team === 'e' ? 'B' : 'A'}{m.flavor ? ` ・ ${m.flavor}` : ''}</small>
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
    {#if !p.hasHost}
      <button class="big claim" onclick={() => p.claimHost()}><span>👑 進行役になる</span><small>進行役がまだいません</small></button>
    {:else}
      <div class="big wait"><span>待機中</span><small>進行役がバトルを開始すると、自動で画面が切り替わります</small></div>
    {/if}
  </div>
</div>

{#if dlg}
  <div class="back" role="presentation" onclick={(e) => e.target === e.currentTarget && (dlg = false)} transition:fade={{ duration: 120 }}>
    <div class="dialog panel" in:fly={{ y: 14, duration: 180 }}>
      <h3>設定</h3>
      <label class="field"><span>名前</span><input class="input" bind:value={n} maxlength="12"></label>
      <label class="field"><span>ひとこと（任意）</span><input class="input" bind:value={f} maxlength="20"></label>
      <div class="step">職業</div>
      <div class="jobs">
        {#each SELECTABLE as j}
          <button class="job" class:sel={p.myJob === j} onclick={() => p.pickJob(j)}><span class="e">{@html icon(j)}</span><span><b>{JOB[j].n}</b><small>ATK{JOB[j].atk} / HP{JOB[j].hp}</small></span></button>
        {/each}
      </div>
      <div class="jobdesc">{JOB[p.myJob].d}</div>
      <div class="step">チーム（ユーザー対戦のときだけ使われます）</div>
      <div class="seg wide"><button class:sel={p.myTeam === 'p'} onclick={() => p.pickTeam('p')}>チームA</button><button class:sel={p.myTeam === 'e'} onclick={() => p.pickTeam('e')}>チームB</button></div>
      {#if !p.hasHost}
        <div class="step">部屋の設定（進行役がいない間は誰でも変えられます）</div>
        <label class="field"><span>部屋名</span><input class="input" bind:value={rn} maxlength="30"></label>
        <label class="field"><span>パスワード（空なら変更なし）</span><input class="input" bind:value={rp} maxlength="20"></label>
      {/if}
      <div class="two"><button class="btn primary" onclick={save}>保存して閉じる</button><button class="btn ghost" onclick={() => (dlg = false)}>閉じる</button></div>
    </div>
  </div>
{/if}

<style>
  .room{display:flex;flex-direction:column;min-height:calc(100dvh - 24px);gap:12px}
  .bar{flex:none;display:flex;justify-content:space-between;align-items:center;gap:10px;border-bottom:1px solid var(--line);padding:2px 0 10px}
  .ttl b{display:block;font-family:var(--serif);font-size:1.25rem;color:var(--gold);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60vw}
  .ttl .sub{display:flex;align-items:center;gap:6px;font-size:.8rem}
  .tools{display:flex;gap:6px;margin-right:48px}
  .ib{width:40px;height:40px;border-radius:10px;background:var(--s2);border:1px solid var(--line);font-size:1.1rem;padding:0;cursor:pointer}
  .ib:hover{border-color:var(--gold)}
  .members{flex:1;display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;align-content:start}
  .mcard{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--s1)}
  .mcard.me{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold) inset}.mcard.off{opacity:.5}
  .av{width:40px;height:40px;flex:none;border-radius:50%;display:grid;place-items:center;font-size:1.4rem;background:#120f0c;border:2px solid var(--line2)}
  .mi{min-width:0}.mi b{display:flex;align-items:center;gap:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .mi small{color:var(--mut);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bottom{flex:none;display:grid;grid-template-columns:1fr;gap:10px;border-top:1px solid var(--line);padding-top:12px;position:sticky;bottom:0;background:linear-gradient(180deg,#0000,var(--bg) 14px)}
  .chat{display:flex;flex-direction:column;gap:8px;min-width:0}
  .log{height:150px;overflow:auto;border:1px solid var(--line);border-radius:10px;background:var(--s1);padding:6px 10px;font-size:.88rem}
  .log p{margin:4px 0;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}.log p.sys{color:var(--mut)}.log p.host b{color:var(--gold)}
  .log time{color:var(--mut);font-size:.72rem}
  .send{display:flex;gap:8px}.send .input{flex:1}
  .big{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:110px;border-radius:14px;border:2px solid var(--line2);background:var(--s2);font-weight:800;font-size:1.6rem;color:var(--mut);cursor:default;text-align:center;padding:10px}
  .big small{font-size:.78rem;font-weight:400;color:var(--mut)}
  .big.claim{cursor:pointer;border-color:var(--gold);background:#3a2f1a;color:var(--gold)}.big.claim:hover{background:#4a3c20}
  @media(min-width:900px){
    .room{min-height:calc(100dvh - 40px)}
    .bottom{grid-template-columns:1fr 1fr;align-items:stretch}.log{height:180px}.big{min-height:0}
  }
  .back{position:fixed;inset:0;background:#000b;z-index:80;display:flex;align-items:center;justify-content:center;padding:12px}
  .dialog{width:100%;max-width:560px;max-height:92dvh;overflow:auto}
  .dialog h3{color:var(--gold);font-size:1.2rem;margin-bottom:6px}
  .step{color:var(--mut);font-size:.86rem;margin-top:10px}
  .jobs{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:8px 0}
  .job{background:var(--s2);border:1px solid var(--line);border-radius:10px;padding:9px 10px;text-align:left;cursor:pointer;display:flex;gap:10px;align-items:center}
  .job.sel{background:#3a2f1a;border-color:var(--gold);box-shadow:0 0 0 1px var(--gold)}
  .e{font-size:1.6rem;flex:none}.job b{display:block;font-size:.92rem}.job small{color:var(--mut)}
  .jobdesc{color:var(--mut);font-size:.88rem;margin:4px 0 10px;padding:8px 10px;border-left:3px solid var(--gold);background:#0003;border-radius:0 8px 8px 0}
  .seg.wide{display:flex;width:100%;margin:6px 0 10px}.seg.wide button{flex:1}
  .two{display:flex;gap:10px;margin-top:14px}.two .btn{flex:1}
</style>
