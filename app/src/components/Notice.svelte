<script>
  import { fly } from 'svelte/transition';

  // CPU（魔王など）が何をしたかを、画面の中央上に数秒だけ大きく知らせる。notice = {id, text, side}
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
    timer = setTimeout(() => { shown = null; }, 3600);
  });
  $effect(() => () => clearTimeout(timer));
</script>

{#if shown}
  {#key shown.id}
    <div class="note" role="status" in:fly={{ y: -16, duration: 220 }} out:fly={{ y: -10, duration: 160 }}>
      <span class="ic">🤖</span><span>{shown.text}</span>
    </div>
  {/key}
{/if}

<style>
  .note{position:fixed;top:72px;left:50%;transform:translateX(-50%);z-index:65;display:flex;align-items:center;gap:10px;max-width:min(92vw,640px);padding:12px 20px;border-radius:14px;background:#3a1217;border:2px solid var(--red);color:#fff;font-weight:800;font-size:1.05rem;box-shadow:0 12px 40px #000c,0 0 30px #e5545f66;text-align:center}
  .ic{font-size:1.3rem}
  @media(max-width:900px){.note{top:60px;font-size:.95rem;padding:10px 14px}}
</style>
