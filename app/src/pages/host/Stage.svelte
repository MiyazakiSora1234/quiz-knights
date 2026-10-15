<script>
  import { flip } from 'svelte/animate';
  import Unit from '../../components/Unit.svelte';
  import { seatOf, tagsFor } from './gameView.js';

  let { host, G } = $props();
  const foes = $derived(G.units.filter(u => u.side === 'e'));
  const allies = $derived(G.units.filter(u => u.side === 'p'));
  const pvp = $derived(G.mode === 'pvp');
  const versus = $derived(pvp && !G.cpu);          // ユーザー対戦: チームA（上）→ B → C の順に並べる
  const TEAM = { p: ['チームA', 'ally'], e: ['チームB', 'foe'], c: ['チームC', 'third'] };
  const groups = $derived(versus
    ? ['p', 'e', 'c'].map(t => ({ key: t, label: TEAM[t][0], cls: TEAM[t][1], units: G.units.filter(u => u.side === t), seats: true })).filter(g => g.units.length)
    : [{ key: 'e', label: G.cpu ? (foes.every(u => u.isBoss) ? '魔王軍' : 'CPUチーム') : '魔王軍', cls: 'foe', units: foes, seats: pvp, boss: foes.length === 1 && foes[0].isBoss },
       { key: 'p', label: 'プレイヤー', cls: 'ally', units: allies, seats: true }]);
  // 参加者（端末を持つ人）は早押しで決まるので、進行役は選べない。魔王・CPUだけ進行役が選ぶ
  // 接続が切れている参加者のカードには印を付ける（戻ってこられるので、ユニットは残る）
  const offlineIds = $derived(new Set(Object.entries(G.pids ?? {}).filter(([pid]) => !host.lobby.find(l => l.pid === pid)?.online).map(([, id]) => id)));
  const pidOf = u => Object.keys(G.pids ?? {}).find(k => G.pids[k] === u.id);
  const tagsOf = u => [...tagsFor(u, G), ...(offlineIds.has(u.id) ? [{ t: '📴 切断中', cls: 'warn' }] : []), ...(host.ranks[pidOf(u)] ? [host.ranks[pidOf(u)]] : [])];
  // チャット回答（今の問題）を、その人のカードに吹き出しで出す
  const bubbles = $derived.by(() => {
    const out = {};
    for (const c of host.chat) { const uid = c.answer && c.q === G.q ? G.pids?.[c.pid] : null; if (uid != null) out[uid] = c.text; }
    return out;
  });
  const isHuman = u => Object.values(G.pids ?? {}).includes(u.id);
  const canPick = u => !isHuman(u) && (u.alive || u.ghost) && !u.restNow && !G.over && !host.busy;
</script>

{#snippet card(u, seat)}
  <div class="cw">
  <Unit {u} sel={G.sel === u.id} can={canPick(u)} onpick={() => host.select(u.id)} ribbon={G.sel === u.id ? '回答中' : ''} tags={tagsOf(u)} {seat} bubble={bubbles[u.id] ?? ''} acting={G.acting === u.id} answering={G.sel === u.id} dim={G.sel != null && G.sel !== u.id} />
  <button class="edit" onclick={() => (host.editing = u.id)} disabled={host.busy} title="職業・HPなどを調整" aria-label="{u.name}を調整">✎</button>
  </div>
{/snippet}

<main>
  {#each groups as g, gi (g.key)}
    <div class="team-label {g.cls}" style={gi ? 'margin-top:8px' : ''}>{g.label}</div>
    {#if g.boss}
      <div class="foes">
        {#each g.units as u (u.id)}{@render card(u, g.seats ? seatOf(u, G) : null)}{/each}
      </div>
    {:else}
      <div class="units">
        {#each g.units as u (u.id)}<div animate:flip={{ duration: 240 }}>{@render card(u, g.seats ? seatOf(u, G) : null)}</div>{/each}
      </div>
    {/if}
  {/each}
</main>

<style>
  .cw{position:relative;display:flex}.cw :global(.unit){width:100%}
  .foes .cw{width:min(100%,176px)}.foes .cw:only-child{width:min(100%,300px)}
  .units .cw{width:100%}
  .edit{position:absolute;top:6px;right:6px;z-index:3;width:28px;height:28px;border-radius:50%;border:1px solid var(--line2);background:#000a;color:var(--tx);cursor:pointer;font-size:.85rem;padding:0;opacity:.7}
  .edit:hover:not(:disabled){opacity:1;border-color:var(--gold);color:var(--gold)}
  .team-label{display:flex;align-items:center;gap:8px;font-weight:700;margin:4px 0 12px}
  .team-label::before{content:"";width:10px;height:10px;border-radius:50%;background:currentColor}
  .team-label.foe{color:#ff9aa2}.team-label.ally{color:#9cc8ee}.team-label.third{color:#8fe0a6}
  .team-label::after{content:"";flex:1;height:1px;background:var(--line)}
  .foes{display:flex;flex-wrap:wrap;justify-content:center;gap:16px;margin-bottom:22px}
  .foes .cw:only-child :global(.ic-wrap){width:64px;height:64px;font-size:2.4rem}
  .foes .cw:only-child :global(.nm){font-size:1.2rem}
  .units{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:16px;margin-bottom:22px}
  .units > div{display:flex}.units :global(.unit){width:100%}
  @media(max-width:900px){
    .units{grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}
    .foes .cw:only-child{width:min(100%,230px)}
    .foes .cw:only-child :global(.ic-wrap){width:52px;height:52px;font-size:1.9rem}
  }
</style>
