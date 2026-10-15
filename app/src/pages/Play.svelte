<script>
  import { onMount, tick } from 'svelte';
  import { fade, scale, fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import Unit from '../components/Unit.svelte';
  import { icon } from '../lib/icons.js';
  import { JOB, SELECTABLE } from '../lib/engine.js';
  import { Conn } from '../lib/net.js';
  import { toast, store, sound, toggleSound, sfx, vib, unlockAudio, panel } from '../lib/ui.svelte.js';

  let { id } = $props();
  // svelte-ignore state_referenced_locally
  const PIDKEY = 'qr_pid_' + id;

  let phase = $state('loading');          // loading | join | lobby | game
  let info = $state(null);
  let name = $state(store.get('qr_name') ?? '');
  let flavor = $state(store.get('qr_flavor') ?? '');
  let pw = $state('');
  let err = $state('');
  let pid = $state(null);
  let roomName = $state('');
  let myJob = $state('warrior');
  let myTeam = $state('p');
  let members = $state([]);
  let gs = $state(null);                  // 進行役から届く表示用の状態
  let open = $state(false);
  let eligible = $state([]);
  let sent = $state(false);
  let winner = $state(null);
  let status = $state('connecting');
  let rtt = $state(null);
  let nameEl = $state();

  let conn;
  let leaving = false;
  let wake = null;

  const mine = $derived(gs?.pids?.[pid]);
  const me = $derived(gs && mine != null ? gs.units.find(u => u.id === mine) : null);
  const canBuzz = $derived(open && eligible.includes(pid) && !sent && gs && !gs.over);
  const myWin = $derived(winner && winner.q === gs?.q && winner.pid === pid);

  async function init() {
    try { info = (await (await fetch('/api/rooms', { cache: 'no-store' })).json()).find(r => String(r.id) === String(id)); } catch { /* noop */ }
    if (!info || !info.used) { toast('その部屋は存在しません'); setTimeout(() => (location.href = '/'), 1200); return; }
    roomName = info.name;
    phase = 'join';
    const known = sessionStorage.getItem(PIDKEY);
    // 再接続、または名前が保存済みでパスワード不要なら、入力なしで自動入室
    if ((known && name) || (!info.hasPw && name && !location.hash.includes('edit'))) join(true);
    else await tick(), nameEl?.focus();
  }

  function join(auto = false) {
    if (!name.trim()) { err = '名前を入力してください'; nameEl?.focus(); return; }
    err = ''; unlockAudio();
    if (!auto) sessionStorage.removeItem(PIDKEY);
    leaving = false;
    conn?.close();
    conn = new Conn(id, {
      status: s => { status = s; },
      clock: c => { rtt = Math.round(c.rtt); },
      open: () => conn.send({ t: 'join', id, name: name.trim(), flavor: flavor.trim(), password: pw, pid: sessionStorage.getItem(PIDKEY) || undefined }),
      message: onMessage,
    });
    conn.connect();
    if (auto) phase = 'connecting';
  }

  function onMessage(m) {
    if (m.t === 'error') {
      if (m.code === 'gone') { sessionStorage.removeItem(PIDKEY); leaving = true; toast(m.msg); setTimeout(() => (location.href = '/'), 1200); return; }
      sessionStorage.removeItem(PIDKEY); pid = null; leaving = true; conn.close();
      phase = 'join'; err = m.msg;
      if (m.code === 'pw') { info = { ...info, hasPw: true }; tick().then(() => document.getElementById('pw')?.focus()); }
    } else if (m.t === 'joined') {
      pid = m.pid; leaving = false; sessionStorage.setItem(PIDKEY, pid);
      store.set('qr_name', m.name); store.set('qr_flavor', m.flavor || '');
      myJob = m.job; myTeam = m.team; roomName = m.roomName;
      // 前回選んだ職業・チームを引き継ぐ
      const sj = store.get('qr_job'), st = store.get('qr_team');
      if ((sj && SELECTABLE.includes(sj) && sj !== m.job) || (st && st !== m.team)) { if (sj && SELECTABLE.includes(sj)) myJob = sj; if (st === 'p' || st === 'e') myTeam = st; setProfile(); }
      phase = gs ? 'game' : 'lobby'; keepAwake();
    } else if (m.t === 'members') members = m.players;
    else if (m.t === 'state') { const first = !gs; gs = m.state; phase = 'game'; if (first) toast('バトル開始！'); }
    else if (m.t === 'ended') { gs = null; open = false; winner = null; sent = false; phase = 'lobby'; }
    else if (m.t === 'open') { open = true; eligible = m.eligible; sent = false; winner = null; if (m.eligible.includes(pid)) { sfx.open(); vib(30); } }
    else if (m.t === 'locked') open = false;
    else if (m.t === 'ack') sent = true;
    else if (m.t === 'winner') { open = false; winner = m; if (m.pid === pid) { sfx.win(); vib([120, 60, 200]); } else sfx.other(); }
    else if (m.t === 'closed') { leaving = true; sessionStorage.removeItem(PIDKEY); toast(m.why || '部屋が閉じられました', 3500); setTimeout(() => (location.href = '/'), 2200); }
  }

  /* ---------- 早押し ---------- */
  function buzz() {
    if (!canBuzz) return;
    unlockAudio(); sfx.press(); vib(25);
    conn.send({ t: 'buzz', ts: conn.now() });
    sent = true; // 通信を待たずに押した感触を返す
  }
  function onkey(e) {
    if (e.code === 'Space' && phase === 'game' && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement?.tagName)) { e.preventDefault(); buzz(); }
  }

  /* ---------- ロビー ---------- */
  const setProfile = () => conn.send({ t: 'profile', job: myJob, team: myTeam });
  function pickJob(j) { myJob = j; store.set('qr_job', j); setProfile(); }
  function pickTeam(t) { myTeam = t; store.set('qr_team', t); setProfile(); }
  function leave() { leaving = true; conn.send({ t: 'leave' }); sessionStorage.removeItem(PIDKEY); location.href = '/'; }
  function rename() { leaving = true; conn.send({ t: 'leave' }); sessionStorage.removeItem(PIDKEY); conn.close(); pid = null; gs = null; phase = 'join'; tick().then(() => { nameEl?.focus(); nameEl?.select(); }); }

  /* ---------- 演出 ---------- */
  let flash = $state('');
  let prevHp = null;
  $effect(() => {
    const hp = me?.hp;
    if (hp == null) { prevHp = null; return; }
    if (prevHp != null && hp !== prevHp) {
      flash = hp < prevHp ? 'd' : 'h';
      if (hp < prevHp) { sfx.hit(); vib(prevHp - hp > 3 ? [80, 40, 120] : 60); } else sfx.heal();
      setTimeout(() => (flash = ''), 600);
    }
    prevHp = hp;
  });
  // 別のタブを見ていても受付開始に気づけるよう、タブの題名で知らせる
  $effect(() => {
    const base = roomName ? `${roomName} - QUIZ KNIGHTS` : 'QUIZ KNIGHTS';
    document.title = (canBuzz && gs) ? `🔔 押せ！ ${base}` : (myWin ? `🎉 回答権！ ${base}` : base);
  });
  async function keepAwake() { try { if ('wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => (wake = null)); } } catch { /* noop */ } }

  onMount(() => {
    init();
    const vis = () => { if (document.visibilityState === 'visible' && gs) keepAwake(); };
    document.addEventListener('visibilitychange', vis);
    return () => { document.removeEventListener('visibilitychange', vis); leaving = true; conn?.close(); };
  });

  const overText = $derived.by(() => {
    if (!gs?.over) return '';
    if (gs.over === 'win') return '勝利！';
    if (gs.over === 'lose') return '全滅…';
    if (gs.over === 'draw') return '引き分け';
    const winSide = gs.over === 'teamp' ? 'p' : 'e';
    return me ? (me.side === winSide ? '勝利！' : '敗北…') : (winSide === 'p' ? 'チームAの勝利' : 'チームBの勝利');
  });
  const bannerKind = $derived(gs?.over ? '' : myWin ? 'win' : (winner && winner.q === gs?.q) ? 'other' : (open && eligible.includes(pid)) ? 'open' : '');
  const bannerText = $derived.by(() => {
    if (!gs) return '';
    if (gs.over) return 'バトル終了';
    if (winner && winner.q === gs.q) return myWin ? '回答権を獲得！答えてください' : `回答権：${winner.name}`;
    if (open && eligible.includes(pid)) return '受付中！ 押せ！';
    if (open) return '受付中（今回は押せません）';
    return '問題を待っています…';
  });
  const buzzLabel = $derived(canBuzz ? '押す！' : sent ? (myWin ? '回答権獲得' : '送信済み') : (me && !me.alive && !me.ghost) ? '戦闘不能' : (me && me.restNow) ? '今回は休み' : '待機中');
</script>

<svelte:window onkeydown={onkey} />

{#if status === 'reconnecting'}<div class="conn" transition:fade>接続が切れました。再接続しています…</div>{/if}
<div class="flash {flash}"></div>

<div class="tools"><button onclick={toggleSound} aria-label="効果音">{sound.on ? '🔊' : '🔇'}</button></div>

<div class="wrap">
  {#if phase === 'loading' || phase === 'connecting'}
    <div class="center"><div class="spin"></div><div class="sub">{phase === 'connecting' ? '入室しています…' : '読み込み中…'}</div></div>

  {:else if phase === 'join'}
    <form class="panel card-join" onsubmit={(e) => { e.preventDefault(); join(); }} in:fly={{ y: 12, duration: 220 }}>
      <h2>部屋に参加</h2>
      <div class="roomlabel">{id}番「{roomName}」</div>
      <label class="field"><span>あなたの名前</span><input class="input" bind:this={nameEl} bind:value={name} maxlength="12" autocomplete="nickname" enterkeyhint="go"></label>
      <label class="field"><span>ひとこと（任意）</span><input class="input" bind:value={flavor} maxlength="20" placeholder="例：本日の意気込み"></label>
      {#if info?.hasPw}<label class="field"><span>パスワード</span><input id="pw" class="input" type="password" bind:value={pw} maxlength="20" autocomplete="off"></label>{/if}
      <div class="err">{err}</div>
      <div class="joinrow"><a href="/">← 部屋一覧に戻る</a><button class="btn primary lg" type="submit">参加する</button></div>
    </form>

  {:else if phase === 'lobby'}
    <div class="panel lobby" in:fly={{ y: 12, duration: 220 }}>
      <div class="lobby-h"><div class="num">{id}</div><div><h2>{roomName}</h2><div class="sub">{name} として参加中</div></div></div>
      <div class="chips">
        {#each members as p (p.pid)}<span class="chip" class:off={!p.online} animate:flip={{ duration: 200 }}><span class="dot {p.online ? 'on' : ''}"></span>{p.name}{p.flavor ? ` 〈${p.flavor}〉` : ''}</span>{/each}
      </div>
      <div class="step">① 職業を選んでください</div>
      <div class="jobs">
        {#each SELECTABLE as j}
          <button class="job" class:sel={myJob === j} onclick={() => pickJob(j)}>
            <span class="e">{@html icon(j)}</span>
            <span><b>{JOB[j].n}</b><small>ATK{JOB[j].atk} / HP{JOB[j].hp}</small></span>
          </button>
        {/each}
      </div>
      <div class="jobdesc">{JOB[myJob].d}</div>
      <div class="step">② チーム（ユーザー対戦のときだけ使われます）</div>
      <div class="seg wide"><button class:sel={myTeam === 'p'} onclick={() => pickTeam('p')}>チームA</button><button class:sel={myTeam === 'e'} onclick={() => pickTeam('e')}>チームB</button></div>
      <div class="sub center-t">進行役がバトルを開始すると、自動で画面が切り替わります</div>
      <div class="two"><button class="btn ghost" onclick={rename}>名前を変える</button><button class="btn ghost danger" onclick={leave}>退室する</button></div>
    </div>

  {:else if gs}
    <div class="game">
      <div class="top">
        <div><span class="qn">第{gs.q}問</span>{#if gs.genre}<span class="chip pur" transition:fade>{gs.genre}</span>{/if}</div>
        <div class="net"><span class="dot {status === 'open' ? (rtt != null && rtt < 150 ? 'on' : 'warn') : ''}"></span>{rtt != null ? `${rtt}ms` : ''}</div>
      </div>

      <div class="me panel">
        {#if me}
          <div class="em">{@html icon(me.job)}</div>
          <div class="mi">
            <div class="nm">{me.name} <span class="sub">{me.jobName}</span></div>
            <div class="bar {me.hp / me.maxHp <= .25 ? 'crit' : me.hp / me.maxHp <= .5 ? 'low' : ''}"><i style="width:{Math.max(0, me.hp / me.maxHp * 100)}%"></i></div>
            <div class="st">HP <b>{Math.max(0, me.hp)}</b> / {me.maxHp}{me.restNow ? '　💤 今回は休み' : ''}{me.job === 'tank' ? `　🛡 守り×${me.guards}` : ''}{me.alive ? '' : me.ghost ? '　👻 幽霊（あと1回だけ答えられる）' : '　💀 戦闘不能'}</div>
          </div>
        {:else}
          <div class="sub">観戦中です（進行役が席に割り当てるとプレイヤーになります）</div>
        {/if}
      </div>

      <div class="banner {bannerKind}">
        <b>{bannerText}</b>
        {#if winner && winner.q === gs.q}<div class="rank">{winner.ranking.slice(0, 4).map((x, i) => `${i + 1}. ${x.name}${i ? ` (+${Math.round(x.ms)}ms)` : ''}`).join('　')}</div>{/if}
      </div>

      <div class="mid">
        <div class="strip">
          {#each gs.units as u (u.id)}
            <Unit {u} compact ribbon={u.id === mine ? 'あなた' : ''} sel={u.id === mine} jobLabel={u.jobName}
              tags={[...(u.restNow ? [{ t: '💤 休み', cls: 'warn' }] : []), ...(u.job === 'tank' ? [{ t: `🛡×${u.guards}`, cls: 'warn' }] : []), ...(u.st ?? [])]} />
          {/each}
        </div>
        <details class="logbox parch">
          <summary>年代記</summary>
          {#each gs.log ?? [] as l}<p>{l}</p>{/each}
        </details>
      </div>

      {#if me}
        <div class="buzzarea">
          <button class="buzz" class:on={canBuzz} class:sent class:win={myWin} disabled={!canBuzz} onpointerdown={(e) => { e.preventDefault(); buzz(); }}>{buzzLabel}</button>
        </div>
      {/if}
    </div>

    {#if gs.over}
      <div class="over" transition:fade={{ duration: 200 }}>
        <div in:scale={{ start: .9, duration: 260 }} class="ov-in"><h2 class:lose={overText.includes('全滅') || overText.includes('敗北')}>{overText}</h2>{#if me && gs.stats?.[me.id]}<div class="mine">あなたの成績：正解 <b class="ok">{gs.stats[me.id].correct}</b>　誤答 <b class="ng">{gs.stats[me.id].wrong}</b></div>{/if}<div class="sub">進行役の操作を待っています</div></div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .wrap{max-width:560px;margin:0 auto;padding:12px 12px calc(12px + env(safe-area-inset-bottom));-webkit-user-select:none;user-select:none}
  .wrap :global(input){-webkit-user-select:text;user-select:text}
  .conn{position:fixed;left:0;right:0;top:0;z-index:90;background:var(--red-d);text-align:center;padding:5px;font-size:.85rem}
  .flash{position:fixed;inset:0;pointer-events:none;z-index:60;opacity:0}
  .flash.d{background:radial-gradient(circle,#0000 40%,#ff2030aa);animation:fo .5s}
  .flash.h{background:radial-gradient(circle,#0000 40%,#40ff80aa);animation:fo .6s}
  @keyframes fo{from{opacity:1}to{opacity:0}}
  .tools{position:fixed;right:10px;top:calc(10px + env(safe-area-inset-top));z-index:50}
  .tools button{width:38px;height:38px;border-radius:50%;background:#000a;border:1px solid var(--line2);font-size:1rem;line-height:1;padding:0;cursor:pointer}
  .center{display:grid;place-items:center;gap:12px;margin-top:30vh}
  .spin{width:34px;height:34px;border:3px solid var(--line2);border-top-color:var(--gold);border-radius:50%;animation:sp .8s linear infinite}
  @keyframes sp{to{transform:rotate(360deg)}}

  .card-join{max-width:440px;margin:6vh auto 0}
  .card-join h2{font-size:1.4rem;color:var(--gold);text-align:center}
  .roomlabel{text-align:center;color:var(--mut);margin:4px 0 6px}
  .err{color:#ff9aa2;font-size:.86rem;min-height:1.3em;margin-top:8px}
  .joinrow{display:flex;gap:12px;align-items:center;justify-content:space-between;margin-top:16px}

  .lobby{max-width:640px;margin:0 auto}
  .lobby-h{display:flex;align-items:center;gap:12px;margin-bottom:6px}
  .num{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;font-family:var(--display);font-weight:800;background:#120f0c;border:2px solid var(--gold);color:var(--gold)}
  .lobby-h h2{font-size:1.3rem}
  .chips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}.chip.off{opacity:.45}
  .step{color:var(--mut);font-size:.86rem;margin-top:8px}
  .jobs{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:8px 0}
  .job{background:var(--s2);border:1px solid var(--line);border-radius:10px;padding:9px 10px;text-align:left;cursor:pointer;display:flex;gap:10px;align-items:center;transition:.1s}
  .job:hover{border-color:var(--line2)}
  .job.sel{background:#3a2f1a;border-color:var(--gold);box-shadow:0 0 0 1px var(--gold)}
  .job .e{font-size:1.6rem;flex:none}.job b{display:block;font-size:.92rem}.job small{color:var(--mut)}
  .jobdesc{min-height:2.8em;color:var(--mut);font-size:.88rem;margin:4px 0 10px;padding:8px 10px;border-left:3px solid var(--gold);background:#0003;border-radius:0 8px 8px 0}
  .seg.wide{display:flex;width:100%;margin:6px 0 14px}.seg.wide button{flex:1}
  .center-t{text-align:center;margin-bottom:12px}
  .two{display:flex;gap:10px}.two .btn{flex:1}

  .game{display:flex;flex-direction:column;min-height:calc(100dvh - 24px);gap:10px}
  .top{display:flex;justify-content:space-between;align-items:center;padding:2px 2px 8px;border-bottom:1px solid var(--line)}
  .qn{font-family:var(--serif);font-size:1.5rem;font-weight:800;color:var(--gold)}
  .chip.pur{border-color:var(--pur);color:#d3b6ee;margin-left:8px}
  .net{display:flex;align-items:center;gap:6px;color:var(--mut);font-size:.8rem;margin-right:48px}
  .me{display:flex;gap:14px;align-items:center;padding:12px 14px}
  .em{font-size:2rem;width:58px;height:58px;display:grid;place-items:center;border:2px solid var(--blu);border-radius:50%;background:radial-gradient(circle,#3b2f21,#17120d);flex:none}
  .mi{flex:1;min-width:0}
  .nm{font-weight:800;font-size:1.1rem}
  .me .bar{margin:6px 0}
  .st{font-size:.9rem;font-variant-numeric:tabular-nums}
  .banner{text-align:center;padding:12px;border:1px solid var(--line);background:var(--s1);border-radius:12px;transition:.2s}
  .banner b{font-size:1.15rem;display:block}
  .banner.open{background:#4a1519;border-color:var(--red);animation:pulse 1s infinite}
  .banner.win{background:linear-gradient(180deg,#f0c964,var(--gold-d));color:#2a1c06;border-color:#fff3c0}
  .banner.other{background:#1f3350;border-color:var(--blu)}
  @keyframes pulse{50%{box-shadow:0 0 20px #e5545f88}}
  .rank{font-size:.8rem;margin-top:4px;opacity:.9}
  .mid{flex:1;min-width:0}
  .strip{display:flex;gap:12px;overflow-x:auto;padding:12px 4px 12px;scroll-snap-type:x proximity}
  .strip :global(.unit){flex:0 0 138px;scroll-snap-align:start}
  .logbox{border-radius:12px;padding:10px 14px;box-shadow:inset 0 0 30px #8a6a3566;margin-bottom:8px}
  .logbox summary{cursor:pointer;color:#7a1f26;font-weight:800;letter-spacing:.3em;text-align:center;font-family:var(--serif)}
  .logbox p{margin:6px 0 0;font-size:.82rem;border-bottom:1px dotted #8a6a3577;padding-bottom:3px}
  .buzzarea{position:sticky;bottom:0;padding:14px 0 calc(8px + env(safe-area-inset-bottom));background:linear-gradient(180deg,#0000,var(--bg) 30%)}
  .buzz{display:block;margin:0 auto;width:min(66vw,250px,36dvh);aspect-ratio:1;border-radius:50%;font-size:2rem;font-weight:900;letter-spacing:.1em;border:6px double var(--line2);cursor:pointer;
    background:radial-gradient(circle at 35% 30%,#555,#2a2a2a);color:#999;touch-action:manipulation;transition:transform .05s;font-family:var(--sans)}
  .buzz:disabled{cursor:default}
  .buzz.on{background:radial-gradient(circle at 35% 30%,#f0626c,#a92b36 70%,#6a1119);color:#fff;border-color:var(--gold);text-shadow:0 2px 0 #0008;box-shadow:0 0 40px #e5545faa,inset 0 0 20px #0009;cursor:pointer}
  .buzz.on:active,.buzz.sent{transform:scale(.94)}
  .buzz.sent{background:radial-gradient(circle at 35% 30%,#7ad493,var(--grn-d));color:#fff;border-color:#c8e8b0}
  .buzz.win{background:radial-gradient(circle at 35% 30%,#f7d778,var(--gold-d));color:#2a1c06;border-color:#fff3c0;text-shadow:none;font-size:1.5rem}
  .over{position:fixed;inset:0;background:#000d;z-index:70;display:flex;align-items:center;justify-content:center;text-align:center}
  .ov-in{display:flex;flex-direction:column;gap:10px;align-items:center}
  .over h2{font-size:3rem;color:var(--gold)}.over h2.lose{color:var(--red)}
  .mine{font-size:1.05rem}.mine .ok{color:#8fe0a6}.mine .ng{color:#ff9aa2}

  @media(min-width:900px){
    .wrap{max-width:1060px;padding:20px 24px}
    .game{display:grid;grid-template-columns:380px 1fr;grid-template-areas:"top top" "me mid" "banner mid" "buzz mid";gap:14px 28px;align-items:start;min-height:0}
    .top{grid-area:top}.me{grid-area:me}.banner{grid-area:banner}.mid{grid-area:mid}
    .buzzarea{grid-area:buzz;position:static;background:none;padding:6px 0}
    .buzz{width:280px}
    .strip{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));overflow:visible;gap:16px;padding:4px 0 14px}
    .strip :global(.unit){flex:none}
    .logbox[open]{max-height:40vh;overflow:auto}
    .card-join{margin-top:10vh}
  }
</style>
