<script>
  let { host } = $props();
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
  <div class="urlrow">
    <input class="input" readonly value={host.joinUrl} onfocus={(e) => e.currentTarget.select()} aria-label="参加用URL">
    <button class="btn primary" onclick={host.copyUrl}>URLをコピー</button>
  </div>
</div>

<style>
  .title{display:flex;gap:14px;align-items:center;margin-bottom:12px}
  .rt{flex:1;min-width:0}
  .rt b{font-size:1.2rem;font-family:var(--serif);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .conn{display:flex;align-items:center;gap:6px;font-size:.8rem;color:var(--mut);flex:none}
  .urlrow{display:flex;gap:8px}.urlrow .input{flex:1;font-size:.85rem;color:var(--mut)}
</style>
