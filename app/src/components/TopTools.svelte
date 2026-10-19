<script>
  import { fly } from 'svelte/transition';

  // 右上のボタン列（参加者・進行役・準備中・バトル中で共通）。アイコンのボタンを並べ、「☰」に、あまり使わない操作をまとめる。
  // tools: [{ key, icon, label, title?, onclick, disabled?, active?, badge?, hidden? }]
  // menu : [{ icon, label, onclick, danger? } | { hr: true }]
  // labels: 画面が広いとき、アイコンの横に名前も出す（進行役の画面）
  let { tools = [], menu = [], labels = false } = $props();
  // 絵文字・記号は、フォントによって上下の位置が違う（実測: 多くは約1.5px高く、📖は約1px低い）ので、見た目の中心がそろうように、1つずつ補正する
  const NUDGE = { '📖': -1, '📚': 1, '📜': 1 };
  const nudge = ic => (NUDGE[ic] ?? 1.5);
  let open = $state(false);
  let root = $state();
  export function close() { open = false; }
  const items = $derived(menu.filter(m => !m.hidden));
</script>

<svelte:window onclick={(e) => { if (open && root && !root.contains(e.target)) open = false; }} />

<div class="tt" class:labels role="toolbar" aria-label="操作" bind:this={root}>
  {#each tools.filter(t => !t.hidden) as t (t.key)}
    <button type="button" class="tb" class:on={t.active} disabled={t.disabled} title={t.title ?? t.label} aria-label={t.label} onclick={t.onclick}>
      <span class="ic" style:transform="translateY({nudge(t.icon)}px)" aria-hidden="true">{t.icon}</span><span class="lb">{t.label}</span>{#if t.badge}<span class="bd">{t.badge}</span>{/if}
    </button>
  {/each}
  {#if items.length}
    <span class="mw">
      <button type="button" class="tb" class:on={open} title="メニュー" aria-label="メニュー" aria-haspopup="true" aria-expanded={open} onclick={() => (open = !open)}><span class="ic" style:transform="translateY({nudge('☰')}px)" aria-hidden="true">☰</span></button>
      {#if open}
        <div class="mn" role="menu" transition:fly={{ y: -6, duration: 120 }}>
          {#each items as m}
            {#if m.hr}<div class="hr"></div>
            {:else}<button type="button" role="menuitem" class="mi" class:danger={m.danger} onclick={() => { open = false; m.onclick(); }}><span class="mic" style:transform="translateY({nudge(m.icon)}px)">{m.icon}</span>{m.label}</button>{/if}
          {/each}
        </div>
      {/if}
    </span>
  {/if}
</div>

<style>
  .tt{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
  .tb{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:40px;height:40px;padding:0 5px;border-radius:10px;background:var(--s2);border:1px solid var(--line);color:var(--tx);font-size:1.1rem;line-height:1;cursor:pointer}
  .tb:hover:not(:disabled){border-color:var(--gold)}
  .tb:disabled{opacity:.4;cursor:default}
  .tb.on{border-color:var(--gold);background:#3a2f1a}
  .tb:focus-visible{outline:2px solid var(--gold);outline-offset:1px}
  /* 絵文字は、フォントによって上下・左右にずれるので、決まった大きさの箱の真ん中に置く */
  .ic{display:inline-flex;align-items:center;justify-content:center;width:1.5em;height:1.5em;line-height:1;font-size:1.1rem;font-family:'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif;text-align:center}
  .lb{display:none;font-size:.82rem;font-weight:600}
  @media(min-width:901px){.labels .lb{display:inline}.labels .tb{padding:0 12px}}
  .bd{position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--gold);color:#2a1c06;font-size:.7rem;font-weight:800;display:grid;place-items:center}
  .mw{position:relative}
  .mn{position:absolute;right:0;top:calc(100% + 8px);background:var(--s1);border:1px solid var(--line2);border-radius:12px;padding:6px;min-width:230px;z-index:80;box-shadow:0 14px 34px #000d}
  .mi{display:flex;width:100%;gap:10px;align-items:center;padding:10px 12px;background:none;border:0;border-radius:8px;text-align:left;cursor:pointer;color:var(--tx);font-size:.92rem}
  .mi:hover{background:var(--s3)}.mi.danger{color:#ff9aa2}
  .mic{width:1.4em;text-align:center;flex:none}
  .hr{height:1px;background:var(--line);margin:4px 6px}
</style>
