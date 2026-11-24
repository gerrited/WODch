<script lang="ts">
  import { session } from '../sync/session.svelte'
  import ShareModal from './ShareModal.svelte'

  // Sichtbarer Text bleibt „Teilen“; der Tooltip sagt, was der Klick konkret tut
  const label = $derived(session.id ? 'Link kopieren' : 'Session teilen')

  let shareUrl = $state<string | null>(null)

  async function handleClick(e: MouseEvent) {
    e.stopPropagation()
    if (session.id) await session.copyLink()
    else await session.create()
    shareUrl = window.location.href
  }
</script>

<button class="share-btn" data-tour="share" onclick={handleClick} title={label}>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
  </svg>
  <span class="share-text">Teilen</span>
</button>

{#if shareUrl}
  <ShareModal url={shareUrl} onClose={() => (shareUrl = null)} />
{/if}

<style>
  .share-btn {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 8px;
    height: var(--tap);
    padding: 0 16px;
    font: 500 14px/1 var(--font-ui);
    color: var(--text);
    background: none;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    cursor: pointer;
    transition: border-color 0.15s;
  }
  .share-btn:hover {
    border-color: var(--text-ghost);
  }
  .share-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
</style>
