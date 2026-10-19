<script>
  import { fade, scale, fly } from 'svelte/transition';
  import { panel } from '../../lib/stores/ui.svelte.js';
  import { tick } from 'svelte';
  import Unit from '../../components/Unit.svelte';
  import ScoreTable from '../../components/ScoreTable.svelte';
  import Confetti from '../../components/Confetti.svelte';
  import BuzzButton from './BuzzButton.svelte';
  import { sfx, vib } from '../../lib/stores/sound.svelte.js';
  import { ITEMS } from '../../lib/engine.js';
  import { titles } from '../../lib/stores/titles.svelte.js';
  import TopTools from '../../components/TopTools.svelte';
  import { sound, toggleSound } from '../../lib/stores/sound.svelte.js';
  import { titleName } from '../../lib/titles.js';

  let { p } = $props();   // PlayStore
  const gs = $derived(p.gs);
  // 右上のボタンは、待機画面・進行役の画面と同じ並び（💬 📜 ⏱ 📖 🔊 ☰）。バトル中に開けない設定（⚙・📚）は出さない
  const tools = $derived([
    { key: 'chat', icon: '💬', label: 'チャット', badge: unread || '', active: chatOpen, onclick: toggleChat },
    { key: 'log', icon: '📜', label: 'バトルログ', onclick: () => (panel.log = true) },
    { key: 'quiz', icon: '⏱', label: 'クイズ設定', onclick: () => (panel.settings = 'quiz') },
    { key: 'rules', icon: '📖', label: 'ルール', title: '職業・ルール一覧', onclick: () => (panel.rules = true) },
    { key: 'sound', icon: sound.on ? '🔊' : '🔇', label: '効果音', title: sound.on ? '効果音：オン' : '効果音：オフ', onclick: toggleSound },
  ]);
  const menuItems = $derived([
    { icon: '🔗', label: '参加用URLをコピー', onclick: () => p.copyUrl() },
    { icon: '👑', label: '進行役になる', hidden: p.hostOnline, onclick: () => p.claimHost() },
    { icon: '🏅', label: '称号', onclick: () => (panel.settings = 'titles') },
    { hr: true },
    { icon: '⎋', label: '退室する', danger: true, onclick: () => p.confirmLeave() },
  ]);
  // 敵（自分と別の陣営）を上、味方を下に並べる
  const mySide = $derived(p.me?.side ?? 'p');
  const versus = $derived(gs.mode === 'pvp' && !gs.cpu);   // ユーザー対戦では、チームごとの色（A=青 / B=赤）で見せる
  // 敵を上、自分のチームを下に並べる。ユーザー対戦は、チームの名前と色（A=青 / B=赤 / C=緑）で見せる
  const TEAMS = { p: ['チームA', 'ta'], e: ['チームB', 'tb'], c: ['チームC', 'tc'] };
  const groups = $derived.by(() => {
    if (versus) {
      const sides = ['p', 'e', 'c'].filter(t => gs.units.some(u => u.side === t));
      const order = [...sides.filter(t => t !== mySide), ...sides.filter(t => t === mySide)];
      return order.map(t => ({ key: t, label: `${TEAMS[t][0]}（${t === mySide ? '味方' : '敵'}）`, cls: TEAMS[t][1], units: gs.units.filter(u => u.side === t) }));
    }
    const out = [];
    if (foes.length) out.push({ key: 'e', label: '敵', cls: 'foe', units: foes });
    out.push({ key: 'p', label: '味方', cls: 'ally', units: allies });
    return out;
  });
  const foes = $derived(gs.units.filter(u => u.side !== mySide));
  const allies = $derived(gs.units.filter(u => u.side === mySide));
  let text = $state(''), msg = $state(''), chatEl = $state();
  // チャットは初期状態では閉じておく。閉じている間に届いた分は件数で知らせる
  let chatOpen = $state(false), seen = $state(0);
  const unread = $derived(chatOpen ? 0 : Math.max(0, p.chat.filter(c => !c.answer && !c.sys).length - seen));
  const toggleChat = () => { chatOpen = !chatOpen; if (chatOpen) seen = p.chat.filter(c => !c.answer && !c.sys).length; };
  $effect(() => { if (chatOpen) seen = p.chat.filter(c => !c.answer && !c.sys).length; });
  $effect(() => { p.chat.length; tick().then(() => { if (chatEl) chatEl.scrollTop = chatEl.scrollHeight; }); });
  const bubbles = $derived.by(() => {
    const out = {};
    for (const c of p.chat) { const uid = c.answer && c.q === gs.q ? gs.pids?.[c.pid] : null; if (uid != null) out[uid] = c.text; }
    return out;
  });

  /** 自分のHPが変わったら、画面を一瞬赤（ダメージ）か緑（回復）に光らせる */
  let flash = $state('');
  let prevHp = null;
  $effect(() => {
    const hp = p.me?.hp;
    if (hp == null) { prevHp = null; return; }
    if (prevHp != null && hp !== prevHp) {
      flash = hp < prevHp ? 'd' : 'h';
      if (hp < prevHp) { sfx.hit(); vib(prevHp - hp > 3 ? [80, 40, 120] : 60); } else sfx.heal();
      setTimeout(() => { flash = ''; }, 600);
    }
    prevHp = hp;
  });

  /** 各ユニットのカードに出す印（休み・タンクの守り・サーバーが付けた状態） */
  /** 仲間の持ち物は名前まで見える（自分と相手は個数のまま）。仲間の持ち物の情報があれば、個数の印の代わりに出す */
  const allyTags = u => {
    const list = u.id === p.mine ? p.myItems : p.allyItems?.[u.id];     // 自分と仲間は、持ち物の名前まで見える
    if (!list) return null;
    return [...(u.st ?? []).filter(t => !t.t.startsWith('🎒')), ...list.map(k => ({ t: `${ITEMS[k]?.ic ?? '🎒'} ${ITEMS[k]?.n ?? k}`, cls: '', d: ITEMS[k]?.d ?? '' }))];
  };
  const tagsOf = u => [
    ...(u.restNow ? [{ t: '💤 今回休み', cls: 'warn' }] : []),
    ...(u.job === 'tank' ? [{ t: `🛡×${u.guards}`, cls: 'warn' }] : []),
    ...(allyTags(u) ?? (u.st ?? [])),
    ...(rankTagOf(u) ? [rankTagOf(u)] : []),
  ];
  /** この問題で押した順位（1着・2着 +〇ms）。pid から自分のユニットに結び付ける */
  const pidOf = u => Object.keys(gs.pids ?? {}).find(k => gs.pids[k] === u.id) ?? 'cpu:' + u.id;      // CPUの順位は、cpu:ID で届く
  const rankTagOf = u => p.ranks[pidOf(u)] ?? null;
</script>

<div class="flash {flash}"></div>

{#if !p.hostOnline}
  <div class="hostgone" role="alert">
    <span>{p.hasHost ? '進行役の接続が切れています。しばらく待っても戻らないときは、あなたが引き継げます（バトルは続きから進められます）。' : '進行役がいません。あなたが進行役になれます（バトルは続きから進められます）。'}</span>
    <button class="btn sm primary" type="button" onclick={() => p.claimHost()}>👑 進行役になる</button>
  </div>
{/if}

<div class="game">
  <div class="top">
    <div><span class="qn">第{gs.q}問</span>{#if gs.genre}<span class="chip pur" transition:fade>{gs.genre}</span>{/if}</div>
    <div class="topr">
      <TopTools {tools} menu={menuItems} />
      <div class="net"><span class="dot {p.netGood ? 'on' : p.status === 'open' ? 'warn' : ''}"></span>{p.rtt != null ? `${p.rtt}ms` : ''}{p.jitter != null ? ` ±${p.jitter}` : ''}</div>
    </div>
  </div>


  <div class="ansbox">
  <form class="ans" onsubmit={(e) => { e.preventDefault(); p.sendAnswer(text); text = ''; }}>
    <input class="input" bind:value={text} maxlength="60" placeholder="チャット回答" aria-label="チャット回答"><button class="btn sm" type="submit" disabled={!text.trim()}>回答</button>
  </form>
  </div>

  <div class="mid">
    {#each groups as g (g.key)}
      <div class="grp {g.cls}">{g.label}</div>
      <div class="strip">
        {#each g.units as u (u.id)}
          <Unit {u} compact ribbon={u.id === gs.sel ? (u.id === p.mine ? 'あなた・回答中' : '回答中') : (u.id === p.mine ? 'あなた' : '')} me={u.id === p.mine} jobLabel={u.jobName} tags={tagsOf(u)} bubble={bubbles[u.id] ?? ''} acting={gs.acting === u.id} fxs={(gs.fxs ?? []).filter(f => f.uid === u.id)} answering={gs.sel === u.id} dim={gs.sel != null && gs.sel !== u.id} />
        {/each}
      </div>
    {/each}
  </div>

  {#if p.me}<div class="buzzarea"><BuzzButton {p} /></div>{/if}
</div>

{#if chatOpen}
  <div class="chatfloat" transition:fly={{ y: -8, duration: 140 }}>
    <div class="cf-h"><b>チャット</b><button class="btn ghost sm" onclick={toggleChat} aria-label="閉じる">✕</button></div>
    <div class="cl" bind:this={chatEl}>
      {#each p.chat as c}
        <p class:sys={c.sys} class:ans={c.answer}>{#if !c.sys}<b>{c.name}</b>{/if}{#if c.answer}<i>回答</i>{/if}<span>{c.text}</span></p>
      {:else}<p class="sys"><span>まだメッセージはありません</span></p>{/each}
    </div>
    <form class="cs" onsubmit={(e) => { e.preventDefault(); p.sendChat(msg); msg = ''; }}><input class="input" bind:value={msg} maxlength="200" placeholder="メッセージ…" aria-label="メッセージ"><button class="btn sm" type="submit">送信</button></form>
  </div>
{/if}

{#if gs.over}
  <div class="over" transition:fade={{ duration: 200 }}>
    {#if !p.lost}<Confetti />{/if}
    <div class="ov-in" in:scale={{ start: .9, duration: 260 }}>
      <h2 class:lose={p.lost}>{p.overText}</h2>
      <div class="sub">{gs.q - 1}問で決着</div>
      <ScoreTable units={gs.units} stats={gs.stats} mine={p.mine} />
      {#if titles.fresh.length}
        <div class="newt"><b>🏅 新しい称号</b>{#each titles.fresh as id}<span>{titleName(id)}</span>{/each}</div>
      {/if}
      <div class="sub">進行役の操作を待っています</div>
    </div>
  </div>
{/if}

<style>
  .newt{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:6px;margin:10px 0 2px}
  .newt b{width:100%;text-align:center;color:var(--gold)}
  .newt span{background:#3a2f1a;border:1px solid var(--gold);color:#fff;border-radius:999px;padding:3px 12px;font-weight:700;font-size:.9rem}
  .hostgone{position:sticky;top:0;z-index:25;display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:0 0 8px;padding:8px 12px;border:1px solid var(--gold);border-radius:10px;background:#3a2f1af0;font-size:.86rem;line-height:1.5}
  .flash{position:fixed;inset:0;pointer-events:none;z-index:60;opacity:0}
  .flash.d{background:radial-gradient(circle,#0000 40%,#ff2030aa);animation:fo .5s}
  .flash.h{background:radial-gradient(circle,#0000 40%,#40ff80aa);animation:fo .6s}
  @keyframes fo{from{opacity:1}to{opacity:0}}

  .game{display:flex;flex-direction:column;min-height:calc(100dvh - 24px);gap:10px}
  .top{display:flex;justify-content:space-between;align-items:center;padding:2px 2px 8px;border-bottom:1px solid var(--line)}
  .qn{font-family:var(--serif);font-size:1.5rem;font-weight:800;color:var(--gold);white-space:nowrap}
  .chip.pur{margin-left:8px}
  .net{display:flex;align-items:center;gap:6px;color:var(--mut);font-size:.78rem;white-space:nowrap}

  .ansbox{display:flex;flex-direction:column;gap:4px}
  .ans{display:flex;gap:8px}.ans .input{flex:1;min-width:0}

  .mid{flex:1;min-width:0}
  .grp{font-size:.8rem;font-weight:700;margin:2px 4px 0;display:flex;align-items:center;gap:6px}
  .grp::before{content:"";width:8px;height:8px;border-radius:50%;background:currentColor}
  .grp.foe,.grp.tb{color:#ff9aa2}.grp.ally,.grp.ta{color:#9cc8ee}.grp.tc{color:#8fe0a6}
  .strip{display:flex;align-items:stretch;gap:12px;overflow-x:auto;padding:12px 4px 12px;scroll-snap-type:x proximity}
  .strip :global(.unit){flex:0 0 138px;scroll-snap-align:start}
  .logbox{border-radius:12px;padding:10px 14px;box-shadow:inset 0 0 30px #8a6a3566;margin-bottom:8px}
  .chat-t{position:relative;flex:none}
  .badge{position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;border-radius:9px;background:var(--red);color:#fff;font-size:.7rem;font-weight:800;display:grid;place-items:center;padding:0 4px}
  .topr{display:flex;align-items:center;gap:8px;min-width:0}
  @media(max-width:520px){
    .top{flex-wrap:wrap;gap:6px}
    .topr .btn{padding:6px 10px;font-size:.8rem}
  }
  .chatfloat{position:fixed;top:56px;right:10px;z-index:58;width:min(94vw,380px);display:flex;flex-direction:column;gap:8px;padding:10px;background:var(--s1);border:1px solid var(--gold);border-radius:14px;box-shadow:0 14px 40px #000c}
  .cf-h{display:flex;justify-content:space-between;align-items:center;color:var(--gold)}
  .cl{height:min(40dvh,16em);overflow:auto;border:1px solid var(--line);border-radius:10px;background:var(--s1);padding:4px 10px;font-size:.84rem}
  .cl{overflow-x:hidden}
  .cl p{margin:3px 0;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;min-width:0}
  .cl span{min-width:0;overflow-wrap:anywhere;word-break:break-word}.cl .sys{color:var(--mut)}.cl b{color:var(--mut);font-weight:600}
  .cl i{font-style:normal;font-size:.68rem;background:var(--gold);color:#2a1c06;border-radius:4px;padding:0 5px;font-weight:800}.cl .ans span{color:var(--gold);font-weight:700}
  .cs{display:flex;gap:6px}.cs .input{flex:1;min-width:0}
  .lh{text-align:center;color:#7a1f26;font-weight:800;letter-spacing:.2em;font-family:var(--serif)}
  .ll{height:9.5em;overflow:auto}
  .logbox p{margin:6px 0 0;font-size:.82rem;border-bottom:1px dotted #8a6a3577;padding-bottom:3px}
  .buzzarea{position:sticky;bottom:0;padding:14px 0 calc(8px + env(safe-area-inset-bottom));background:linear-gradient(180deg,#0000,var(--bg) 30%)}

  .over{position:fixed;inset:0;overflow:auto;padding:16px;background:#000d;z-index:70;display:flex;align-items:center;justify-content:center;text-align:center}
  .ov-in{display:flex;flex-direction:column;gap:12px;align-items:center;margin:auto}
  .over h2{font-size:3rem;color:var(--gold)}.over h2.lose{color:var(--red)}

  /* PC: 左に自分とボタン、右に全員とバトルログ */
  @media(min-width:900px){
    .game{display:grid;grid-template-columns:380px minmax(0,1fr);grid-template-areas:"top top" "ans mid" "buzz mid";gap:14px 28px;align-items:start;min-height:0}
    .ansbox{grid-area:ans}
    .top{grid-area:top}.mid{grid-area:mid}
    .buzzarea{grid-area:buzz;position:static;background:none;padding:6px 0}
    .strip{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));overflow:visible;gap:16px;padding:4px 0 14px}
    .strip :global(.unit){flex:none}
    .ll{height:22vh}
  }
</style>
