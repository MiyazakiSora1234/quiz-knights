<script>
  import { SELECTABLE, BOSS, ITEM_KEYS } from '../lib/engine.js';

  // このゲームの紹介ページ（/about）。数字は、データから数えるので、職業や魔王を増やしても、そのまま合う
  const jobs = SELECTABLE.length, bosses = Object.keys(BOSS).length, items = ITEM_KEYS.length;
  const STEPS = [
    ['部屋に集まる', '進行役が部屋を作り、参加者がURLから入室します。'],
    ['早押しで答える', '進行役が問題を読み、参加者は「押す！」で早押し。いちばん早かった人が答えます。'],
    ['正解したら行動', '通常攻撃・職業の能力・アイテムから選んで戦います。誤答は、答えた本人だけが2ダメージ。'],
    ['魔王を倒そう', '1問ごとにCPUが動きます。魔王を倒せば勝ち。1試合は約20問です。'],
  ];
  const FEATURES = [
    [`職業${jobs}種`, '戦士・僧侶・魔法使い・賢者・怪盗・道具使い・ばくだんいわ…。名前をクリックすると、説明が出ます。'],
    [`魔王${bosses}体`, 'それぞれ3〜4種類の技を持つ強敵。魔王を、参加者が操作する遊び方もできます。'],
    [`アイテム${items}種`, '開始時にランダムで配られ、正解したときに使えます。仲間の持ち物は見えて、敵は個数だけ。'],
    ['CPU戦とユーザー対戦', '魔王や職業のCPUと協力して戦う「CPU戦」と、最大3チームで戦う「ユーザー対戦」。'],
    ['遠隔の早押しも公平', 'サーバーが時刻をそろえて判定。個人ごとのディレイ設定もできます。'],
    ['途中参加・引き継ぎ', '途中の入退室はいつでもOK。進行役が落ちても、ほかの人が引き継いで、続きから進められます。'],
  ];
  const SHOTS = [
    ['/screenshots/03-boss-intro.jpg', '魔王の登場演出'],
    ['/screenshots/04-host-battle.jpg', 'バトル中の画面（進行役）'],
    ['/screenshots/02-host-setup.jpg', '進行役の準備画面'],
    ['/screenshots/05-phone-buzzer.jpg', 'スマホの早押し画面'],
  ];
</script>

<svelte:head><title>このゲームについて - QUIZ KNIGHTS</title></svelte:head>

<div class="page">
  <header class="hero">
    <h1 class="logo">QUIZ KNIGHTS<small>クイズ騎士団</small></h1>
    <p class="lead">早押しクイズが、みんなで挑む<b>RPGバトル</b>になる。</p>
    <p class="sub">ブラウザだけで遊べて、スマホにも対応。通話アプリと一緒に、気軽に始められます。</p>
    <a class="btn primary lg" href="/">部屋一覧へ</a>
  </header>

  <h2 class="sec">遊び方</h2>
  <ol class="steps">
    {#each STEPS as [t, d], i}<li><span class="no">{i + 1}</span><div><b>{t}</b><span>{d}</span></div></li>{/each}
  </ol>

  <h2 class="sec">特徴</h2>
  <div class="feats">
    {#each FEATURES as [t, d]}<div class="f"><b>{t}</b><span>{d}</span></div>{/each}
  </div>

  <h2 class="sec">画面</h2>
  <div class="shots">
    {#each SHOTS as [src, cap]}<figure><img {src} alt={cap} loading="lazy"><figcaption>{cap}</figcaption></figure>{/each}
  </div>

  <div class="cta"><a class="btn primary lg" href="/">部屋一覧へ</a></div>
</div>

<style>
  .page{max-width:900px;margin:0 auto;padding:18px 16px 60px}
  .hero{text-align:center;padding:26px 0 8px;display:flex;flex-direction:column;align-items:center;gap:10px}
  .logo{font-family:var(--serif);font-size:2.4rem;color:var(--gold);letter-spacing:.08em;margin:0}.logo small{display:block;font-size:.9rem;letter-spacing:.3em;color:var(--mut);margin-top:4px}
  .lead{font-size:1.4rem;margin:6px 0 0}.lead b{color:var(--gold)}
  .sub{color:var(--mut);margin:0 0 8px}
  h2.sec{color:var(--gold);font-size:1.05rem;letter-spacing:.14em;margin:30px 2px 10px;border-bottom:1px solid var(--line);padding-bottom:6px}
  .steps{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}
  .steps li{display:flex;gap:10px;align-items:flex-start;background:var(--s2);border:1px solid var(--line);border-radius:12px;padding:12px}
  .no{flex:none;width:28px;height:28px;border-radius:50%;background:var(--gold);color:#2a1c06;font-weight:900;display:grid;place-items:center}
  .steps b{display:block;color:var(--gold);margin-bottom:2px}.steps span:not(.no){font-size:.88rem;color:var(--tx);line-height:1.55}
  .feats{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px}
  .f{background:var(--s2);border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:4px}
  .f b{color:var(--gold)}.f span{font-size:.88rem;color:var(--mut);line-height:1.55}
  .shots{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px}
  figure{margin:0;background:var(--s1);border:1px solid var(--line);border-radius:12px;overflow:hidden}
  figure img{display:block;width:100%;height:auto}
  figcaption{padding:8px 12px;color:var(--mut);font-size:.84rem;text-align:center}
  .cta{text-align:center;margin-top:34px}
  a.btn{text-decoration:none}
</style>
