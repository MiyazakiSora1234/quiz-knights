<script>
  let { host } = $props();
  let edit = $state(false), n = $state(''), pw = $state('');
  const open = () => { n = host.roomName; pw = host.password; edit = true; };
  const save = () => { if (n.trim()) { host.saveRoom(n, pw); edit = false; } };
</script>

<div class="panel">
  <div class="title">
    <div class="num" style="--sz:46px">{host.id}</div>
    <div class="rt">
      <b>{host.roomName || '接続中…'}</b>
      <div class="sub">URLを参加者に送るか、部屋一覧の「参加」から入室してもらいます</div>
    </div>
    <span class="conn" title="サーバーとの通信"><span class="dot {host.status === 'ready' ? 'on' : 'warn'}"></span>{host.status === 'ready' ? (host.rtt != null ? `${host.rtt}ms` : '接続OK') : '接続中'}</span>
  </div>
  {#if edit}
    <div class="edit">
      <input class="input" bind:value={n} maxlength="30" placeholder="部屋名" aria-label="部屋名" onkeydown={e => e.key === 'Enter' && save()}>
      <input class="input" bind:value={pw} maxlength="20" placeholder="パスワード（空で無し）" aria-label="パスワード" onkeydown={e => e.key === 'Enter' && save()}>
      <button class="btn primary sm" onclick={save}>保存</button><button class="btn ghost sm" onclick={() => (edit = false)}>キャンセル</button>
    </div>
  {:else}
    <div class="sub setrow">パスワード：{host.password || 'なし'} <button class="btn ghost sm" onclick={open}>✎ 部屋名・パスワードを変更</button></div>
  {/if}
  <div class="urlrow">
    <input class="input" readonly value={host.joinUrl} onfocus={(e) => e.currentTarget.select()} aria-label="参加用URL">
    <button class="btn primary" onclick={host.copyUrl}>参加用URLをコピー</button>
  </div>
</div>

<style>
  .title{display:flex;gap:14px;align-items:center;margin-bottom:12px}
  .rt{flex:1;min-width:0}
  .rt b{font-size:1.2rem;font-family:var(--serif);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .conn{display:flex;align-items:center;gap:6px;font-size:.8rem;color:var(--mut);flex:none}
  .edit{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.edit .input{flex:1;min-width:140px}
  .setrow{display:flex;align-items:center;gap:10px;justify-content:space-between;margin-bottom:10px}
  .urlrow{display:flex;gap:8px}.urlrow .input{flex:1;font-size:.85rem;color:var(--mut)}
</style>
