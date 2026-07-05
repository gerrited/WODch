<script lang="ts">
  import { session } from '../sync/session.svelte'

  const label = $derived(session.id ? 'Link kopieren' : 'Session teilen')

  async function handleClick(e: MouseEvent) {
    e.stopPropagation()
    if (session.id) await session.copyLink()
    else await session.create()
  }
</script>

<button class="share-btn" onclick={handleClick} title={label} aria-label={label}>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {#if session.id}
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    {:else}
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="8.59" y1="10.49" x2="15.42" y2="6.51" />
    {/if}
  </svg>
</button>

<style>
  .share-btn {
    position: absolute;
    right: 60px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: #444;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    line-height: 0;
    transition: color 0.15s;
  }
  .share-btn svg {
    width: 22px;
    height: 22px;
  }
  .share-btn:hover {
    color: #888;
    background: #222;
  }
</style>
