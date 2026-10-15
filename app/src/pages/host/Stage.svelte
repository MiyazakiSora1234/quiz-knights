<script>
  import { flip } from 'svelte/animate';
  import Unit from '../../components/Unit.svelte';
  import { seatOf, tagsFor } from './gameView.js';

  let { host, G } = $props();
  const foes = $derived(G.units.filter(u => u.side === 'e'));
  const allies = $derived(G.units.filter(u => u.side === 'p'));
  const pvp = $derived(G.mode === 'pvp');
  const canPick = u => (u.alive || u.ghost) && !u.restNow && !G.over && !host.busy;
</script>

{#snippet card(u, seat)}
  <Unit {u} sel={G.sel === u.id} can={canPick(u)} onpick={() => host.select(u.id)} ribbon={G.sel === u.id ? '回答中' : ''} tags={tagsFor(u, G)} {seat} />
{/snippet}

<main>
  <div class="team-label foe">{G.cpu ? 'CPUチーム' : pvp ? 'チームB' : '魔王軍'}</div>
  <div class="foes">
    {#each foes as u (u.id)}{@render card(u, pvp ? seatOf(u, G) : null)}{/each}
  </div>
  <div class="team-label ally" style="margin-top:8px">{G.cpu ? 'プレイヤー' : pvp ? 'チームA' : 'プレイヤー'}</div>
  <div class="units">
    {#each allies as u (u.id)}<div animate:flip={{ duration: 240 }}>{@render card(u, seatOf(u, G))}</div>{/each}
  </div>
</main>

<style>
  .team-label{display:flex;align-items:center;gap:8px;font-weight:700;margin:4px 0 12px}
  .team-label::before{content:"";width:10px;height:10px;border-radius:50%;background:currentColor}
  .team-label.foe{color:#ff9aa2}.team-label.ally{color:#9cc8ee}
  .team-label::after{content:"";flex:1;height:1px;background:var(--line)}
  .foes{display:flex;flex-wrap:wrap;justify-content:center;gap:16px;margin-bottom:22px}
  .foes :global(.unit){width:min(100%,176px)}
  .foes :global(.unit:only-child){width:min(100%,300px)}
  .foes :global(.unit:only-child .ic-wrap){width:64px;height:64px;font-size:2.4rem}
  .foes :global(.unit:only-child .nm){font-size:1.2rem}
  .units{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:16px;margin-bottom:22px}
  .units > div{display:flex}.units :global(.unit){width:100%}
  @media(max-width:900px){
    .units{grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}
    .foes :global(.unit:only-child){width:min(100%,230px)}
    .foes :global(.unit:only-child .ic-wrap){width:52px;height:52px;font-size:1.9rem}
  }
</style>
