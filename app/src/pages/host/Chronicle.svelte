<script>
  /** バトルログ。新しいものが上。log = [{m, c}] */
  let { log } = $props();
</script>

<div class="logwrap parch">
  <div class="head">バトルログ</div>
  <div class="log">
    {#each log.slice(0, 60) as l, i (log.length - i)}
      <p class={l.c}>{l.m}</p>
    {/each}
  </div>
</div>

<style>
  .logwrap{border-radius:12px;padding:12px 16px;overflow:auto;flex:1;min-height:120px;box-shadow:inset 0 0 40px #8a6a3566}
  .head{text-align:center;font-family:var(--serif);font-weight:800;color:#7a1f26;letter-spacing:.2em;margin-bottom:6px}
  p{margin:0 0 6px;padding-bottom:6px;border-bottom:1px dotted #8a6a3577;font-size:.85rem}
  p.sys{color:#7a1f26;font-weight:700}p.dmg{color:#9a2630}p.heal{color:#2f6a2a}
  @media(max-width:900px){.logwrap{display:none}}
</style>
