<script>
  import { onMount } from 'svelte';
  import { fade, scale, fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { wsUrl } from '../lib/net.js';
  import { toast, panel } from '../lib/ui.svelte.js';
  import { store, session, KEY } from '../lib/storage.js';

  let rooms = $state(null);
  let status = $state('読み込み中…');
  let dlg = $state(null); // { id, name, pw, busy, err }
  const focusOnMount = node => { node.focus(); };


  async function load() {
    try {
      const t0 = performance.now();
      rooms = await (await fetch('/api/rooms', { cache: 'no-store' })).json();
      status = `サーバー接続OK ・ ${Math.round(performance.now() - t0)}ms ・ 5秒ごとに自動更新`;
    } catch { status = 'サーバーに接続できません。しばらくして再読み込みしてください'; }
  }
  onMount(() => { document.title = 'QUIZ KNIGHTS - 部屋一覧'; load(); const t = setInterval(load, 5000); return () => clearInterval(t); });

  const used = $derived((rooms ?? []).filter(r => r.used));
  const free = $derived((rooms ?? []).filter(r => !r.used));
  const mine = id => !!store.get(KEY.hostKey(id));

  function join(id) {
    location.href = `/play?id=${id}`;
  }

  function openCreate(id) { dlg = { id, name: '', pw: '', busy: false, err: '' }; }
  function create() {
    const d = dlg; if (!d || d.busy) return;
    if (!d.name.trim()) { d.err = '部屋名を入力してください'; return; }
    d.busy = true; d.err = '';
    const ws = new WebSocket(wsUrl(d.id));
    ws.onopen = () => ws.send(JSON.stringify({ t: 'create', id: d.id, name: d.name.trim(), password: d.pw, host: false }));
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.t === 'created') { session.set(KEY.pw(m.room), d.pw); location.href = `/play?id=${m.room}`; }
      else if (m.t === 'error') { d.busy = false; d.err = m.msg; ws.close(); load(); }
    };
    ws.onerror = () => { d.busy = false; d.err = '接続に失敗しました。もう一度お試しください'; };
  }
</script>

<div class="page">
  <header class="hero">
    <svg class="crest" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 2l26 9v22c0 16-11 25-26 29C17 58 6 49 6 33V11z" fill="#e3b84f"/><path d="M32 7l21 7.4V33c0 13-9 20.5-21 24.5C20 53.5 11 46 11 33V14.4z" fill="#1e1914"/><path d="M32 14c3 5 3 9 0 13-3-4-3-8 0-13zM21 24c5-1 8 1 9 5-5 1-8-1-9-5zM43 24c-5-1-8 1-9 5 5 1 8-1 9-5z" fill="#e3b84f"/><rect x="27" y="29" width="10" height="4" rx="1" fill="#e3b84f"/><path d="M32 33v14M26 42l6 5 6-5" stroke="#e3b84f" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <h1 class="logo">QUIZ KNIGHTS<small>クイズ騎士団</small></h1>
  </header>

  <div class="who"><button class="btn sm ghost" onclick={() => (panel.rules = true)}>職業・ルールを見る</button></div>

  <h2 class="sec">開いている部屋</h2>
  {#if rooms === null}
    <div class="rooms"><div class="skel"></div><div class="skel"></div></div>
  {:else if used.length}
    <div class="rooms">
      {#each used as r (r.id)}
        <div class="room" animate:flip={{ duration: 200 }} in:fly={{ y: 10, duration: 200 }}>
          <div class="num">{r.id}</div>
          <div class="info">
            <b title={r.name}>{r.name}</b>
            <div class="meta">
              <span class="chip {r.online ? 'blu' : ''}"><span class="dot {r.online ? 'on' : ''}"></span>{r.online}人</span>
              {#if r.hasPw}<span class="chip">🔒 パスワード</span>{/if}
              {#if !r.hasHost}<span class="chip gold">👑 進行役募集中</span>{/if}
              {#if r.started}<span class="chip gold">バトル中</span>{:else}<span class="chip">待機中</span>{/if}
            </div>
          </div>
          <div class="acts">
            {#if mine(r.id)}<button class="btn" onclick={() => (location.href = `/host?id=${r.id}`)}>管理へ戻る</button>{/if}
            <button class="btn primary" onclick={() => join(r.id)}>参加</button>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="empty"><b>いま開いている部屋はありません</b>下の「部屋を作る」から、空き番号を選んで作成してください。</div>
  {/if}

  <h2 class="sec">部屋を作る（進行役）</h2>
  <div class="slots">
    {#each free as r (r.id)}
      <button class="slot" onclick={() => openCreate(r.id)}><b>{r.id}</b>作成</button>
    {/each}
  </div>

  <div class="status">{status}</div>
</div>

{#if dlg}
  <div class="backdrop" transition:fade={{ duration: 120 }} onmousedown={(e) => e.target === e.currentTarget && (dlg = null)} role="presentation">
    <form class="dlg" transition:scale={{ start: .96, duration: 140 }} onsubmit={(e) => { e.preventDefault(); create(); }}>
      <h2>{dlg.id}番の部屋を作る</h2>
      <label class="field"><span>部屋名</span><input class="input" use:focusOnMount bind:value={dlg.name} maxlength="30" placeholder="部屋の名前"></label>
      <label class="field"><span>パスワード（任意）</span><input class="input" bind:value={dlg.pw} maxlength="20" autocomplete="off"></label>
      <div class="err">{dlg.err}</div>
      <div class="row">
        <button type="button" class="btn ghost" onclick={() => (dlg = null)}>キャンセル</button>
        <button type="submit" class="btn primary" disabled={dlg.busy}>{dlg.busy ? '作成中…' : '作成する'}</button>
      </div>
    </form>
  </div>
{/if}

<svelte:window onkeydown={(e) => e.key === 'Escape' && (dlg = null)} />

<style>
  .page{max-width:1000px;margin:0 auto;padding:22px 18px 60px}
  .hero{text-align:center;padding:12px 0 22px}
  .crest{display:block;width:56px;height:56px;margin:0 auto 6px}
  .logo{font-family:var(--display);font-size:clamp(1.8rem,5vw,2.5rem);line-height:1.15;letter-spacing:.1em}
  .logo small{display:block;font-family:var(--serif);font-size:.95rem;letter-spacing:.4em;color:var(--mut);margin-top:6px;font-weight:700}
  .who{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:26px;padding:12px 16px}
  .hint{font-size:.82rem;color:var(--mut);flex:1 1 200px}
  .input.need{animation:shake .4s;border-color:var(--red);box-shadow:0 0 0 3px #e5545f44}
  @keyframes shake{25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
  h2.sec{font-size:1.05rem;color:var(--gold);margin:6px 0 12px;display:flex;align-items:center;gap:10px}
  h2.sec::after{content:"";flex:1;height:1px;background:var(--line)}
  .rooms{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,400px),1fr));gap:12px;margin-bottom:30px}
  .room{display:flex;align-items:center;flex-wrap:wrap;gap:12px 14px;background:var(--s1);border:1px solid var(--line);border-radius:14px;padding:14px 16px;transition:.12s}
  .room:hover{border-color:var(--line2);background:#241e17}
  .info{flex:1 1 150px;min-width:0}
  .info b{display:block;font-size:1.05rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .meta{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:4px}
  .chip{white-space:nowrap}
  .acts{display:flex;gap:8px;margin-left:auto}
  .empty{border:1px dashed var(--line2);border-radius:14px;padding:26px;text-align:center;color:var(--mut);margin-bottom:30px}
  .empty b{display:block;color:var(--tx);margin-bottom:4px}
  .slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px;margin-bottom:12px}
  .slot{padding:12px 6px;border-radius:10px;background:transparent;border:1px dashed var(--line2);cursor:pointer;color:var(--mut);transition:.12s}
  .slot:hover{border-style:solid;border-color:var(--gold);color:var(--gold);background:#e3b84f12}
  .slot b{display:block;font-family:var(--display);font-size:1.2rem;color:var(--tx)}
  .slot:hover b{color:var(--gold)}
  .skel{height:74px;border-radius:14px;background:linear-gradient(90deg,var(--s1),var(--s2),var(--s1));background-size:200%;animation:sk 1.2s infinite}
  @keyframes sk{to{background-position:-200% 0}}
  .status{margin-top:22px;font-size:.8rem;color:var(--dim);text-align:center}
  .backdrop{position:fixed;inset:0;background:#000b;display:flex;align-items:center;justify-content:center;padding:16px;z-index:70}
  .dlg{width:min(420px,100%);background:var(--s1);border:1px solid var(--line2);border-radius:16px;padding:24px;box-shadow:0 20px 60px #000}
  .dlg h2{font-size:1.25rem;color:var(--gold);margin-bottom:4px}
  .row{display:flex;gap:10px;justify-content:flex-end;margin-top:18px}
  .err{color:#ff9aa2;font-size:.85rem;min-height:1.3em;margin-top:8px}
  @media(max-width:560px){.page{padding:14px 12px 50px}.acts{width:100%}.acts .btn{flex:1}}
</style>
