<script lang="ts">
  let { onClose }: { onClose: () => void } = $props()

  function onOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }
</script>

<div class="modal-overlay" onclick={onOverlayClick} role="presentation">
  <div class="modal">
    <button class="close-btn" onclick={onClose}>✕</button>
    <!-- Inhalt folgt in Task 9 -->
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }
  .modal {
    background: #111;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 24px;
    width: 420px;
    max-height: 90vh;
    overflow-y: auto;
    position: relative;
  }
  .close-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    background: none;
    border: none;
    color: #666;
    font-size: 16px;
    cursor: pointer;
    padding: 4px 8px;
  }
  .close-btn:hover {
    color: #fff;
  }
</style>
