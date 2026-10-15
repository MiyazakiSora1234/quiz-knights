<script>
  import { flip } from 'svelte/animate';
  import Unit from '../../components/Unit.svelte';
  import { seatOf, tagsFor } from './gameView.js';

  let { host, G } = $props();
  const foes = $derived(G.units.filter(u => u.side === 'e'));
  const allies = $derived(G.units.filter(u => u.side === 'p'));
  const pvp = $derived(G.mode === 'pvp');
  // 参加者（端末を持つ人）は早押しで決まるので、進行役は選べない。魔王・CPUだけ進行役が選ぶ
  // 接続が切れている参加者のカードには印を付ける（戻ってこられるので、ユニットは残る）
  const offlineIds = $derived(new Set(Object.entries(G.pids ?? {}).filter(([pid]) => !host.lobby.find(l => l.pid === pid)?.online).map(([, id]) => id)));
  const tagsOf = u => [...tagsFor(u, G), ...(offlineIds.has(u.id) ? [{ t: '📴 切断中', cls: 'warn' }] : [])];
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
  <Unit {u} sel={G.sel === u.id} can={canPick(u)} onpick={() => host.select(u.id)} ribbon={G.sel === u.id ? '回答中' : ''} tags={tagsOf(u)} {seat} bubble={bubbles[u.id] ?? ''} />
  <button class="edit" onclick={() => (host.editing = u.id)} disabled={host.busy} title="職業・HPなどを調整" aria-label="{u.name}を調整">✎</button>
  </div>
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
  .cw{position:relative;display:flex;width:100%}.cw :global(.unit){width:100%}
  .edit{position:absolute;top:6px;right:6px;z-index:3;width:28px;height:28px;border-radius:50%;border:1px solid var(--line2);background:#000a;color:var(--tx);cursor:pointer;font-size:.85rem;padding:0;opacity:.7}
  .edit:hover:not(:disabled){opacity:1;border-color:var(--gold);color:var(--gold)}
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
