<script lang="ts">
  import { renderSVG } from 'uqr'

  let { url, onClose }: { url: string; onClose: () => void } = $props()

  const qrSvg = $derived(renderSVG(url, { border: 1 }))

  function onOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }
</script>

<div class="modal-overlay" onclick={onOverlayClick} role="presentation">
  <div class="modal">
    <button class="close-btn" onclick={onClose}>✕</button>

    <div class="label">SESSION TEILEN</div>
    <!-- eslint-disable-next-line svelte/no-at-html-tags — SVG stammt aus uqr, nicht aus Nutzereingaben -->
    <div class="qr">{@html qrSvg}</div>
    <div class="link">{url}</div>
    <div class="hint">Link wurde in die Zwischenablage kopiert</div>
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
  .label {
    font-size: 10px;
    letter-spacing: 3px;
    color: #666;
    margin-bottom: 16px;
    text-align: left;
  }
  .qr {
    background: #fff;
    border-radius: 4px;
    padding: 8px;
    margin: 0 auto 16px;
    width: 200px;
    height: 200px;
  }
  .qr :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }
  .link {
    color: #ccc;
    font-size: 13px;
    word-break: break-all;
    margin-bottom: 8px;
    user-select: all;
  }
  .hint {
    color: #666;
    font-size: 11px;
  }
</style>
