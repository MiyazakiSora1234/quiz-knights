<script>
  import { fly } from 'svelte/transition';

  // CPU（魔王など）が何をしたかを、画面の上に数秒だけ知らせる。notice = {id, text, detail, side}
  let { notice = null } = $props();
  let shown = $state(null), timer = null;
  // 開いた時点ですでにある通知は出さない（再読み込み・途中入室で古い通知が出ないように）
  // svelte-ignore state_referenced_locally
  let last = notice?.id ?? null;

  $effect(() => {
    const n = notice;
    if (!n || n.id === last) return;
    last = n.id;
    shown = n;
    clearTimeout(timer);
    timer = setTimeout(() => { shown = null; }, 3800);
  });
  $effect(() => () => clearTimeout(timer));
</script>

<div class="wrap" aria-live="polite">
  {#if shown}
    {#key shown.id}
      <div class="note" in:fly={{ y: -14, duration: 200 }} out:fly={{ y: -8, duration: 150 }}>
        <b>{shown.text}</b>
        {#if shown.detail}<span>{shown.detail}</span>{/if}
      </div>
    {/key}
  {/if}
</div>

<style>
  /* 画面の上の中央。位置は外側の枠で決め、動きは内側だけにつける（ずれないように） */
  .wrap{position:fixed;top:64px;left:0;right:0;z-index:65;display:flex;justify-content:center;padding:0 12px;pointer-events:none}
  .note{display:flex;flex-direction:column;gap:2px;max-width:min(100%,560px);padding:10px 18px;border-radius:14px;background:#3a1217;border:2px solid var(--red);color:#fff;text-align:center;box-shadow:0 12px 40px #000c,0 0 30px #e5545f66}
  .note b{font-size:1.05rem}
  .note span{font-size:.85rem;color:#ffd5d9}
  @media(max-width:900px){.wrap{top:56px}.note b{font-size:.98rem}}
</style>
