<script>
  import Toast from './components/Toast.svelte';
  import Modal from './components/Modal.svelte';
  import RulesDialog from './components/RulesDialog.svelte';
  import List from './pages/List.svelte';
  import Host from './pages/Host.svelte';
  import Play from './pages/Play.svelte';
  import About from './pages/About.svelte';

  const path = location.pathname.replace(/\.html$/, '').replace(/\/+$/, '');
  const id = new URLSearchParams(location.search).get('id');
</script>

{#if path === '/host'}
  <Host {id} />
{:else if path === '/play'}
  <Play {id} />
{:else if path === '/about'}
  <About />
{:else}
  <List />
{/if}

<Toast />
<Modal />
<RulesDialog />
