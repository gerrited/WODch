<script lang="ts">
  import App from './App.svelte'
  import LandingPage from './lib/components/LandingPage.svelte'
  import { router } from './lib/router.svelte'
</script>

{#if router.pathname === '/'}
  <LandingPage />
{:else}
  <App />
{/if}
