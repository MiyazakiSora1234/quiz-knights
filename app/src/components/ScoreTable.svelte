<script>
  import { icon } from '../lib/icons.js';

  // 結果の成績表（進行役も参加者も同じものを見る）。units は魔王以外を表示、mine は自分のユニットid
  let { units = [], stats = {}, mine = null } = $props();
  const players = $derived(units.filter(u => !u.isBoss));
  const stat = (u, k) => stats?.[u.id]?.[k] ?? 0;
</script>

<table class="score">
  <thead><tr><th>プレイヤー</th><th>正解</th><th>誤答</th></tr></thead>
  <tbody>
    {#each players as u (u.id)}
      <tr class:dead={!u.alive} class:me={u.id === mine}><td><span class="si">{@html icon(u.job)}</span>{u.name}</td><td class="ok">{stat(u, 'correct')}</td><td class="ng">{stat(u, 'wrong')}</td></tr>
    {/each}
  </tbody>
</table>

<style>
  .score{border-collapse:collapse;min-width:min(86vw,340px);background:#0006;border:1px solid var(--line2);border-radius:12px;overflow:hidden;font-size:.95rem}
  .score th,.score td{padding:6px 14px;text-align:center}.score th{color:var(--mut);font-weight:500;font-size:.8rem;border-bottom:1px solid var(--line)}
  .score td:first-child,.score th:first-child{text-align:left}
  .score td.ok{color:#8fe0a6;font-weight:700}.score td.ng{color:#ff9aa2;font-weight:700}.score tr.dead td:first-child{opacity:.55}
  .score tr.me td:first-child{color:var(--gold);font-weight:800}.score tr.me{background:#e3b84f1a}
  .si{display:inline-block;width:1.4em;margin-right:6px;font-size:1.1rem;vertical-align:middle}
</style>
