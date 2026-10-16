<script>
  import { slide } from 'svelte/transition';
  import { icon } from '../lib/icons.js';
  import { SELECTABLE, BOSS, LEVELS } from '../lib/engine.js';
  import OptionSelect from './OptionSelect.svelte';
  import JobSelect from './JobSelect.svelte';
  import PresetSelect from './PresetSelect.svelte';

  // 戦う相手を自由に並べる部品（進行役が使う）。魔王も職業のCPUも、同じものを何体でも
  // who: 相手の一覧 foes と、変更する setFoes(list) を持つもの（進行役の HostStore）
  let { who, title = '戦う相手' } = $props();
  const MAX = 12;
  const LEVEL_OPTIONS = Object.entries(LEVELS).filter(([, l]) => !l.hidden).map(([v, l]) => ({ v, n: l.n, d: l.d }));
  const isBoss = f => /^boss\d+$/.test(f);
  const foes = $derived(who.foes);
  const set = list => who.setFoes(list.slice(0, MAX));
  const count = id => foes.filter(f => f === 'boss' + id).length;
  const jobsIdx = $derived(foes.map((f, i) => [f, i]).filter(([f]) => !isBoss(f)));
  let focus = $state(1);
  $effect(() => { const b = foes.find(isBoss); if (b && !foes.includes('boss' + focus)) focus = +b.slice(4); });

  const addBoss = id => { focus = id; if (foes.length < MAX) set([...foes, 'boss' + id]); };
  const removeBoss = id => { const i = foes.lastIndexOf('boss' + id); if (i >= 0) set(foes.filter((_, k) => k !== i)); };
  const addJob = () => { if (foes.length < MAX) set([...foes, 'warrior']); };
  const setAt = (i, v) => set(foes.map((f, k) => (k === i ? v : f)));
  const del = i => set(foes.filter((_, k) => k !== i));
  const randomJobs = () => set(foes.map(f => (isBoss(f) ? f : SELECTABLE[Math.floor(Math.random() * SELECTABLE.length)])));
  const rnd = n => [...Array(n)].map(() => SELECTABLE[Math.floor(Math.random() * SELECTABLE.length)]);

  const PRESET_GROUPS = [
    { n: '魔王', items: [
      { n: '魔王1だけ', d: '力押しの魔王。まずはこれ', foes: ['boss1'] },
      { n: '魔王2だけ', d: '3つの形態に変身する', foes: ['boss2'] },
      { n: '魔王3だけ', d: '体力を吸い取る', foes: ['boss3'] },
      { n: '魔王4だけ', d: '毒で追い詰める', foes: ['boss4'] },
      { n: '魔王5だけ', d: '敵の技をまねる', foes: ['boss5'] },
      { n: '魔王6だけ', d: '捨て身の竜', foes: ['boss6'] },
    ] },
    { n: '魔王の混成', items: [
      { n: '魔王とお供', d: '魔王1＋戦士・僧侶', foes: ['boss1', 'warrior', 'monk'] },
      { n: '双子の魔王', d: '魔王1が2体', foes: ['boss1', 'boss1'] },
      { n: '魔王の連合', d: '魔王1・2・3', foes: ['boss1', 'boss2', 'boss3'] },
      { n: '毒蛇の教団', d: '魔王4＋毒使い・ネクロマンサー', foes: ['boss4', 'poisoner', 'necro'] },
      { n: '竜と爆弾', d: '魔王6＋ばくだんいわ×2', foes: ['boss6', 'bomb', 'bomb'] },
      { n: '大魔王軍', d: '魔王全6体', foes: ['boss1', 'boss2', 'boss3', 'boss4', 'boss5', 'boss6'] },
    ] },
    { n: '職業のチーム', items: [
      { n: '基本の3人', d: '戦士・僧侶・魔法使い', foes: ['warrior', 'monk', 'mage'] },
      { n: '守りの布陣', d: 'タンク・僧侶・守護神官・戦士', foes: ['tank', 'monk', 'cleric', 'warrior'] },
      { n: '攻めの布陣', d: 'バトルマスター・バーサーカー・魔法戦士', foes: ['bm', 'berserker', 'mw'] },
      { n: '騎士団', d: '戦士×2・タンク・僧侶', foes: ['warrior', 'warrior', 'tank', 'monk'] },
      { n: '魔法団', d: '魔法使い・魔法戦士・賢者', foes: ['mage', 'mw', 'sage'] },
      { n: '暗殺団', d: '盗賊・地雷屋・毒使い', foes: ['thief', 'minelayer', 'poisoner'] },
      { n: '賭博場', d: '賭博師・道化師・遊び人', foes: ['gambler', 'jester', 'playboy'] },
      { n: '爆弾地帯', d: 'ばくだんいわ×3', foes: ['bomb', 'bomb', 'bomb'] },
      { n: '呪いの教団', d: 'ネクロマンサー・幽霊・預言者', foes: ['necro', 'ghost', 'oracle'] },
      { n: '支援の軍勢', d: '吟遊詩人・軍師・守護神官・戦士', foes: ['bard', 'tactician', 'cleric', 'warrior'] },
      { n: '見習いの大群', d: '見習い×4', foes: ['apprentice', 'apprentice', 'apprentice', 'apprentice'] },
    ] },
  ];
  // ランダムは選ぶたびに中身が変わるので、選ぶ瞬間に作る
  const groups = $derived([...PRESET_GROUPS, { n: 'ランダム', items: [{ n: '職業をランダムに4体', d: '選ぶたびに変わります', get foes() { return rnd(4); } }, { n: '魔王1＋職業ランダム3体', d: '', get foes() { return ['boss1', ...rnd(3)]; } }] }]);
</script>

<div class="panel">
  <h3>{title} <span class="chip">{foes.length}体</span>{#if foes.length}<button class="btn ghost sm clr" onclick={() => set([])}>全部外す</button>{/if}</h3>
  <div class="presets"><PresetSelect {groups} onpick={set} /></div>
  <div class="sec">難易度</div>
  <div class="lv"><OptionSelect value={who.level} options={LEVEL_OPTIONS} onchange={(v) => who.setLevel(v)} label="難易度" /></div>

  <div class="sec">魔王（押すと1体ずつ加わります。同じ魔王を何体でも）</div>
  <div class="bgrid">
    {#each Object.entries(BOSS) as [id, b]}
      {@const n = count(id)}
      <div class="bchip" class:sel={n > 0} class:foc={focus === +id} onmouseenter={() => (focus = +id)} role="group">
        <button class="bmain" onclick={() => addBoss(+id)} disabled={foes.length >= MAX} title={b.intro}>
          <span class="bi">{@html icon('boss' + id)}</span><b>{b.n}</b>
        </button>
        {#if n > 0}<span class="cnt">×{n}</span><button class="minus" onclick={() => removeBoss(+id)} aria-label="{b.n}を1体外す">−</button>{/if}
      </div>
    {/each}
  </div>
  {#if BOSS[focus]}
    {@const b = BOSS[focus]}
    <div class="detail" transition:slide={{ duration: 120 }}>
      <div class="dh"><span class="bi sm">{@html icon('boss' + focus)}</span><div><b>{b.n}</b><small>{b.intro}</small></div></div>
      <div class="row"><span class="k">体力</span><span>{b.hpText}</span></div>
      {#each b.skills as sk}<div class="row"><span class="k">{sk.n}</span><span>{sk.d}</span></div>{/each}
      {#each b.traits as t}<div class="row"><span class="k tr">特性</span><span>{t}</span></div>{/each}
    </div>
  {/if}

  <div class="sec">職業のCPU</div>
  {#each jobsIdx as [f, i] (i)}
    <div class="frow">
      <span class="fi">{@html icon(f)}</span>
      <div class="fsel"><JobSelect value={f} onchange={(v) => setAt(i, v)} label="CPUの職業" /></div>
      <button class="btn ghost sm" onclick={() => del(i)} aria-label="外す">✕</button>
    </div>
  {:else}<div class="none">職業のCPUはいません</div>{/each}
  <div class="btns">
    <button class="btn ghost sm" onclick={addJob} disabled={foes.length >= MAX}>＋ 職業のCPUを追加</button>
    <button class="btn ghost sm" onclick={randomJobs} disabled={!jobsIdx.length}>🎲 職業をランダムに</button>
  </div>
</div>

<style>
  .presets{margin-bottom:4px}.lv{margin-bottom:4px}
  .sec{margin:12px 2px 6px;color:var(--gold);font-weight:700;font-size:.85rem}
  .clr{margin-left:auto}
  .bgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
  .bchip{position:relative;display:flex;flex-direction:column;align-items:center;background:var(--s2);border:1px solid var(--line);border-radius:12px}
  .bchip:hover,.bchip.foc{border-color:var(--line2)}
  .bchip.sel{border-color:var(--gold);background:#3a2f1a;box-shadow:0 0 0 1px var(--gold)}
  .bmain{display:flex;flex-direction:column;align-items:center;gap:4px;width:100%;padding:8px 4px;background:none;border:0;cursor:pointer}
  .bmain:disabled{cursor:default;opacity:.5}
  .bmain b{font-size:.85rem}
  .cnt{position:absolute;top:4px;left:6px;color:var(--gold);font-weight:900;font-size:.8rem}
  .minus{position:absolute;top:3px;right:3px;width:24px;height:24px;border-radius:50%;border:1px solid var(--line2);background:#000a;color:var(--tx);cursor:pointer;padding:0;line-height:1}
  .minus:hover{border-color:var(--gold);color:var(--gold)}
  .bi{width:40px;height:40px;display:grid;place-items:center;border-radius:50%;background:#120f0c;border:2px solid var(--red-d);flex:none;font-size:1.5rem}
  .bi.sm{width:34px;height:34px;font-size:1.2rem}
  .bchip.sel .bi{border-color:var(--gold)}
  .detail{margin:8px 0 4px;padding:10px 12px;background:#0003;border:1px solid var(--line);border-radius:12px;display:flex;flex-direction:column;gap:6px;font-size:.83rem}
  .dh{display:flex;gap:10px;align-items:center}.dh b{display:block}.dh small{color:var(--mut);font-size:.78rem;line-height:1.35}
  .row{display:grid;grid-template-columns:5.2em 1fr;gap:8px;align-items:start;line-height:1.45}
  .k{font-weight:700;color:var(--gold);font-size:.76rem;background:#0004;border-radius:6px;padding:1px 6px;text-align:center}.k.tr{color:#ff9aa2}
  .frow{display:flex;align-items:center;gap:8px;margin-bottom:8px}
  .fi{width:38px;height:38px;flex:none;border-radius:50%;display:grid;place-items:center;font-size:1.3rem;background:#120f0c;border:2px solid var(--red-d)}
  .fsel{flex:1;min-width:0}
  .none{color:var(--dim);font-size:.85rem;margin-bottom:8px}
  .btns{display:flex;gap:6px;flex-wrap:wrap}
</style>
