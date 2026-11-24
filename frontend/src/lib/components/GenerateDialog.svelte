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
      rows="8"
    ></textarea>
    <div class="counter">{value.length}/{MAX}</div>
    <div class="actions">
      <button class="btn btn-cancel" onclick={onCancel}>Abbrechen</button>
      <button class="btn btn-primary btn-generate" onclick={submit} disabled={!value.trim()}>Generieren</button>
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
    width: 420px;
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
  .title {
    margin-bottom: 16px;
  }
  .gen-input {
    width: 100%;
    box-sizing: border-box;
    background: var(--surface-2);
    border: 1px solid #26262b;
    border-radius: var(--radius-sm);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 14px;
    line-height: 1.5;
    padding: 12px;
    resize: vertical;
    outline: none;
  }
  .gen-input::placeholder {
    color: var(--text-faint);
  }
  .gen-input:focus-visible {
    border-color: var(--accent);
  }
  .counter {
    color: var(--text-faint);
    font-family: var(--font-mono);
    font-size: 11px;
    text-align: right;
    margin-top: 6px;
  }
  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 16px;
  }
</style>
