<script>
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { HostStore } from '../lib/stores/host.svelte.js';
  import Setup from './host/Setup.svelte';
  import Game from './host/Game.svelte';
  import QuizSettings from '../components/QuizSettings.svelte';
  import QuestionBank from '../components/QuestionBank.svelte';

  let { id } = $props();
  // svelte-ignore state_referenced_locally
  const host = new HostStore(id);
  onMount(() => { document.title = '進行役 - QUIZ KNIGHTS'; host.connect(); return () => host.destroy(); });
</script>

{#if host.G}
  <Game {host} />
{:else}
  <Setup {host} />
{/if}

<QuizSettings who={host} />
<QuestionBank who={host} />

{#if host.status === 'replaced'}
  <div class="rep" transition:fade={{ duration: 150 }}>
    <div class="box panel">
      <h3>別の画面が進行役になりました</h3>
      <p class="sub">この部屋の進行役が、別のタブや端末で開かれました。操作が重ならないよう、こちらは停止しています。</p>
      <div class="acts"><button class="btn primary lg" onclick={() => host.takeOver()}>この画面を進行役にする</button><a class="btn lg" href="/">部屋一覧へ</a></div>
    </div>
  </div>
{/if}

<style>
  .rep{position:fixed;inset:0;background:#000d;z-index:80;display:flex;align-items:center;justify-content:center;padding:16px}
  .box{max-width:460px;text-align:center}
  .box h3{font-size:1.2rem;color:var(--gold);margin-bottom:8px}
  .acts{display:flex;flex-direction:column;gap:10px;margin-top:16px}
  a.btn{text-decoration:none;color:var(--tx)}
</style>
