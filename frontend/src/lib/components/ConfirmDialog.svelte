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
      <button class="btn btn-primary btn-confirm" onclick={onConfirm}>{confirmLabel}</button>
    </div>
  </div>
</div>

<style>
  /* Dialog-Grundstil des Redesigns: Overlay 70 %, Panel --surface, Radius 16px */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    z-index: 100;
    overscroll-behavior: contain;
    touch-action: none;
  }
  .modal {
    position: relative;
    width: 360px;
    max-width: 100%;
    background: var(--surface);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-lg);
    padding: 24px;
    color: var(--text);
    font-family: var(--font-ui);
    text-align: left;
  }
  .close-btn {
    position: absolute;
    top: 10px;
    right: 10px;
    display: grid;
    place-items: center;
    width: var(--tap);
    height: var(--tap);
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--text-faint);
    font-size: 16px;
    cursor: pointer;
  }
  .close-btn:hover {
    color: var(--text);
    background: var(--surface-hover);
  }
  .title {
    padding-right: 40px;
    margin-bottom: 8px;
    font-size: 20px;
    font-weight: 600;
    line-height: 1.3;
    color: var(--text);
  }
  .btn {
    min-height: var(--tap);
    padding: 0 18px;
    font: 500 14px/1 var(--font-ui);
    color: var(--text);
    background: none;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    cursor: pointer;
    transition: border-color 0.15s, background-color 0.15s;
  }
  .btn:hover:not(:disabled) {
    border-color: var(--text-ghost);
  }
  .btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  /* Primär = Lime mit dunkler Schrift */
  .btn-primary {
    font-weight: 600;
    color: var(--accent-ink);
    background: var(--accent);
    border-color: var(--accent);
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
  }
  .btn:focus-visible,
  .close-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .message {
    margin-bottom: 8px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--text-muted);
    word-break: break-word;
  }
  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 20px;
  }
</style>
