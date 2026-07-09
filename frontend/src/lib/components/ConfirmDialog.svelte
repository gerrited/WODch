<script lang="ts">
  let {
    title,
    message = '',
    confirmLabel = 'Löschen',
    cancelLabel = 'Abbrechen',
    onConfirm,
    onCancel,
  }: {
    title: string
    message?: string
    confirmLabel?: string
    cancelLabel?: string
    onConfirm: () => void
    onCancel: () => void
  } = $props()

  // Events enden am Overlay — die UI dahinter (z. B. die Timer-Leiste) darf nicht reagieren
  function onOverlayClick(e: MouseEvent) {
    e.stopPropagation()
    if (e.target === e.currentTarget) onCancel()
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onConfirm()
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div
  class="modal-overlay"
  onclick={onOverlayClick}
  onpointerdown={(e) => e.stopPropagation()}
  ontouchstart={(e) => e.stopPropagation()}
  role="presentation"
>
  <div class="modal" role="dialog" aria-modal="true">
    <button class="close-btn" onclick={onCancel} aria-label={cancelLabel}>✕</button>

    <div class="title">{title}</div>
    {#if message}
      <div class="message">{message}</div>
    {/if}
    <div class="actions">
      <button class="btn btn-cancel" onclick={onCancel}>{cancelLabel}</button>
      <button class="btn btn-confirm" onclick={onConfirm}>{confirmLabel}</button>
    </div>
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
    overscroll-behavior: contain;
    touch-action: none;
  }
  .modal {
    background: #111;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 24px;
    width: 320px;
    position: relative;
    text-align: center;
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
  .title {
    color: #fff;
    font-size: 15px;
    margin-bottom: 8px;
  }
  .message {
    color: #999;
    font-size: 13px;
    margin-bottom: 20px;
    word-break: break-word;
  }
  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 16px;
  }
  .btn {
    border: 1px solid #333;
    border-radius: 4px;
    background: none;
    color: #ccc;
    font-family: monospace;
    font-size: 13px;
    letter-spacing: 1px;
    padding: 8px 16px;
    cursor: pointer;
  }
  .btn-cancel:hover {
    color: #fff;
    border-color: #555;
  }
  .btn-confirm {
    color: #e63946;
    border-color: #e63946;
  }
  .btn-confirm:hover {
    background: #e63946;
    color: #fff;
  }
</style>
