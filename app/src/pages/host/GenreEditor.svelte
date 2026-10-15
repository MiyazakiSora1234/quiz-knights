<script>
  let { host } = $props();
</script>

<details class="panel">
  <summary>盗賊が選べるジャンル（{host.genreList.length}個）</summary>
  <div class="chips">{#each host.genreList as g}<span class="chip">{g}</span>{/each}</div>
  <input class="input" bind:value={host.genresText} placeholder="理系、文系、青問、緑問、赤問" aria-label="ジャンル一覧">
  <div class="sub hint">「、」や「,」、スペースで区切って自由に増減できます（最大12個）。<button class="btn sm ghost" onclick={() => host.resetGenres()}>初期値に戻す</button></div>
</details>

<style>
  summary{cursor:pointer;color:var(--gold);font-family:var(--serif);font-weight:800}
  .chips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}
  .input{margin-top:4px}
  .hint{margin-top:6px}
</style>
