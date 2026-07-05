<script lang="ts">
  import ShareModal from './ShareModal.svelte'

  // Test-Fixture: bildet die Timer-Leiste nach, in der das ShareModal gerendert wird
  let {
    url,
    onClose,
    onParentClick,
    onParentPointerDown,
    onParentTouchStart,
  }: {
    url: string
    onClose: () => void
    onParentClick: () => void
    onParentPointerDown: () => void
    onParentTouchStart: () => void
  } = $props()
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="host" onclick={onParentClick} onpointerdown={onParentPointerDown} ontouchstart={onParentTouchStart}>
  <ShareModal {url} {onClose} />
</div>
