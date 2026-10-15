<script>
  import { tick } from 'svelte';

  // チャットと、参加者の「チャット回答」。回答は今の問題のものだけを上に並べ、その人を回答者に選べる
  let { host, G } = $props();
  let msg = $state(''), logEl = $state();
  const answers = $derived(host.chat.filter(c => c.answer && c.q === G.q));
  const time = ts => new Date(ts).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  const unitOf = pid => G.units.find(u => u.id === G.pids?.[pid]);
  const canPick = pid => { const u = unitOf(pid); return !!u && (u.alive || u.ghost) && !u.restNow && !G.over && !host.busy; };
  function send(e) { e.preventDefault(); host.sendChat(msg); msg = ''; }
  $effect(() => { host.chat.length; tick().then(() => { if (logEl) logEl.scrollTop = logEl.scrollHeight; }); });
</script>

<div class="chat panel">
  <h3>チャット回答 <span class="chip">{answers.length}</span></h3>
  <div class="answers">
    {#each answers as a (a.ts + a.pid)}
      <div class="ans">
        <b>{a.name}</b><span class="tx">{a.text}</span>
        <button class="btn sm" disabled={!canPick(a.pid) || G.sel === G.pids?.[a.pid]} onclick={() => host.select(G.pids[a.pid])} title="この人を回答者にする">回答者にする</button>
      </div>
    {:else}<div class="none">この問題のチャット回答はまだありません</div>{/each}
  </div>
  <h3>チャット</h3>
  <div class="log" bind:this={logEl}>
    {#each host.chat.filter(c => !c.answer) as c}
      <p class:sys={c.sys} class:host={c.host}><time>{time(c.ts)}</time>{#if !c.sys}<b>{c.name}</b>{/if}<span>{c.text}</span></p>
    {:else}<p class="sys"><span>参加者のチャットがここに出ます</span></p>{/each}
  </div>
  <form class="send" onsubmit={send}><input class="input" bind:value={msg} maxlength="200" placeholder="全員に送るメッセージ…" aria-label="メッセージ"><button class="btn sm" type="submit">送信</button></form>
</div>

<style>
  .chat{display:flex;flex-direction:column;gap:8px;padding:12px;min-height:0}
  h3{font-size:.95rem;display:flex;align-items:center;gap:8px}
  .answers{display:flex;flex-direction:column;gap:6px;max-height:160px;overflow:auto}
  .ans{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--s2)}
  .ans .tx{font-weight:700;color:var(--gold);word-break:break-all}
  .none{color:var(--dim);font-size:.85rem}
  .log{height:110px;overflow:auto;border:1px solid var(--line);border-radius:8px;background:var(--s1);padding:4px 8px;font-size:.85rem}
  .log p{margin:3px 0;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}.log .sys{color:var(--mut)}.log .host b{color:var(--gold)}
  .log time{color:var(--mut);font-size:.7rem}
  .send{display:flex;gap:6px}.send .input{flex:1}
</style>
