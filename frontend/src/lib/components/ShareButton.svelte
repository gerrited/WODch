<script lang="ts">
  import { session } from '../sync/session.svelte'

  const icon = $derived(session.id ? '🔗' : '📤')
  const label = $derived(session.id ? 'Link kopieren' : 'Session teilen')

  async function handleClick(e: MouseEvent) {
    e.stopPropagation()
    if (session.id) await session.copyLink()
    else await session.create()
  }
</script>

<button class="share-btn" onclick={handleClick} title={label}>{icon}</button>

<style>
  .share-btn {
    position: absolute;
    right: 60px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    font-size: 22px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    line-height: 1;
    opacity: 0.5;
    transition: opacity 0.15s;
  }
  .share-btn:hover {
    opacity: 1;
    background: #222;
  }
</style>
