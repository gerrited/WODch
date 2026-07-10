<script lang="ts">
  import { tick } from 'svelte'

  let { onSubmit, onCancel }: { onSubmit: (prompt: string) => void; onCancel: () => void } = $props()

  const MAX = 500
  let value = $state('')
  let inputEl: HTMLTextAreaElement | undefined = $state()
  // Merkt sich, ob der Klick auf dem Overlay begonnen hat – verhindert
  // versehentliches Schließen, wenn z. B. beim Vergrößern des Textfelds
  // die Maustaste außerhalb des Dialogs losgelassen wird.
  let pressStartedOnOverlay = false

  $effect(() => {
    // Beim Öffnen fokussieren
    tick().then(() => inputEl?.focus())
  })

  function submit() {
    const trimmed = value.trim()
    if (!trimmed) return
    onSubmit(trimmed)
  }

  function onOverlayPointerDown(e: PointerEvent) {
    e.stopPropagation()
    pressStartedOnOverlay = e.target === e.currentTarget
  }

  function onOverlayClick(e: MouseEvent) {
    e.stopPropagation()
    if (e.target === e.currentTarget && pressStartedOnOverlay) onCancel()
    pressStartedOnOverlay = false
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submit()
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div
  class="modal-overlay"
  onclick={onOverlayClick}
  onpointerdown={onOverlayPointerDown}
  ontouchstart={(e) => e.stopPropagation()}
  role="presentation"
>
  <div class="modal" role="dialog" aria-modal="true">
    <button class="close-btn" onclick={onCancel} aria-label="Abbrechen">✕</button>
    <div class="title">Workout mit AI erstellen</div>
    <textarea
      bind:this={inputEl}
      class="gen-input"
      bind:value
      maxlength={MAX}
      placeholder="z. B. 20 Min AMRAP mit Kettlebells, Fokus Beine"
      rows="4"
    ></textarea>
    <div class="counter">{value.length}/{MAX}</div>
    <div class="actions">
      <button class="btn btn-cancel" onclick={onCancel}>Abbrechen</button>
      <button class="btn btn-generate" onclick={submit} disabled={!value.trim()}>Generieren</button>
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
    width: 360px;
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
    margin-bottom: 16px;
  }
  .gen-input {
    width: 100%;
    box-sizing: border-box;
    background: #000;
    border: 1px solid #333;
    border-radius: 4px;
    color: #fff;
    font-family: monospace;
    font-size: 13px;
    padding: 10px;
    resize: vertical;
    outline: none;
  }
  .gen-input:focus {
    border-color: #555;
  }
  .counter {
    color: #555;
    font-size: 11px;
    text-align: right;
    margin-top: 4px;
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
  .btn-generate {
    color: #7cc;
    border-color: #7cc;
  }
  .btn-generate:hover:not(:disabled) {
    background: #7cc;
    color: #000;
  }
  .btn-generate:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
