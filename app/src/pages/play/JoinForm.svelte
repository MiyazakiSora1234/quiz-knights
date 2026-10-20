<script>
  import { fly } from 'svelte/transition';
  import { focusOnMount } from '../../lib/actions.js';

  let { p } = $props();   // PlayStore
</script>

<form class="panel card" onsubmit={(e) => { e.preventDefault(); p.join(); }} in:fly={{ y: 12, duration: 220 }}>
  <h2>部屋に参加</h2>
  <div class="roomlabel">{p.id}番「{p.roomName}」</div>
  <label class="field"><span>あなたの名前</span>
    <input class="input" use:focusOnMount={{ when: !p.name || !p.info?.hasPw, select: true }} bind:value={p.name} maxlength="12" placeholder="例：たろう" autocomplete="nickname" enterkeyhint="go">
  </label>
  <label class="field"><span>ひとこと（任意）</span><input class="input" bind:value={p.flavor} maxlength="20" placeholder="例：本日の意気込み"></label>
  {#if p.info?.hasPw}
    <label class="field"><span>パスワード</span>
      <input class="input" use:focusOnMount={{ when: !!p.name }} type="password" bind:value={p.pw} maxlength="20" autocomplete="off">
    </label>
  {/if}
  <div class="err">{p.err}</div>
  <div class="row"><a href="/">← 部屋一覧に戻る</a><button class="btn primary lg" type="submit">参加する</button></div>
</form>

<style>
  .card{max-width:440px;margin:6vh auto 0}
  h2{font-size:1.4rem;color:var(--gold);text-align:center}
  .roomlabel{text-align:center;color:var(--mut);margin:4px 0 6px}
  .err{color:#ff9aa2;font-size:.86rem;min-height:1.3em;margin-top:8px}
  .row{display:flex;gap:12px;align-items:center;justify-content:space-between;margin-top:16px}
  .row a{display:inline-flex;align-items:center;min-height:44px}
  @media(min-width:900px){.card{margin-top:10vh}}
</style>
