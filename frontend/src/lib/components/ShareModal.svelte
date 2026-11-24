<script lang="ts">
  import { renderSVG } from 'uqr'

  let { url, onClose }: { url: string; onClose: () => void } = $props()

  const qrSvg = $derived(renderSVG(url, { border: 1 }))

  // Events enden am Overlay — die UI dahinter (z. B. die Timer-Leiste) darf nicht reagieren
  function onOverlayClick(e: MouseEvent) {
    e.stopPropagation()
    if (e.target === e.currentTarget) onClose()
  }
</script>

<div
  class="modal-overlay"
  onclick={onOverlayClick}
  onpointerdown={(e) => e.stopPropagation()}
  ontouchstart={(e) => e.stopPropagation()}
  role="presentation"
>
  <div class="modal">
    <button class="close-btn" onclick={onClose} aria-label="Schließen">✕</button>

    <div class="title">Session teilen</div>
    <!-- eslint-disable-next-line svelte/no-at-html-tags — SVG stammt aus uqr, nicht aus Nutzereingaben -->
    <div class="qr">{@html qrSvg}</div>
    <div class="link">{url}</div>
    <div class="hint">Link wurde in die Zwischenablage kopiert</div>
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
    width: 340px;
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
  .close-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .title {
    margin-bottom: 16px;
  }
  .qr {
    background: #fff;
    border-radius: var(--radius-sm);
    padding: 8px;
    margin: 0 auto 16px;
    width: 220px;
    height: 220px;
  }
  .qr :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }
  .link {
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 13px;
    text-align: center;
    word-break: break-all;
    margin-bottom: 8px;
    user-select: all;
  }
  .hint {
    color: var(--accent);
    font-size: 13px;
    text-align: center;
  }
</style>
