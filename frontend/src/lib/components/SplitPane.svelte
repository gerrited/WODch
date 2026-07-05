<script lang="ts">
  import type { Snippet } from 'svelte'

  let {
    orientation = 'columns',
    initial = 50,
    min = 0,
    storageKey,
    a,
    b,
  }: {
    orientation?: 'rows' | 'columns'
    initial?: number
    min?: number
    storageKey?: string
    a: Snippet
    b: Snippet
  } = $props()

  function loadSize(): number {
    if (!storageKey) return initial
    const raw = localStorage.getItem(storageKey)
    if (raw === null || raw.trim() === '') return initial
    const saved = Number(raw)
    if (!Number.isFinite(saved)) return initial
    return Math.min(100 - min, Math.max(min, saved))
  }

  // svelte-ignore state_referenced_locally — initial/storageKey bestimmen bewusst nur den Startwert
  let size = $state(loadSize()) // % des ersten Bereichs
  let container: HTMLDivElement | undefined = $state()
  let dragging = $state(false)

  function onPointerDown(e: PointerEvent) {
    dragging = true
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging || !container) return
    const rect = container.getBoundingClientRect()
    const pct =
      orientation === 'rows'
        ? ((e.clientY - rect.top) / rect.height) * 100
        : ((e.clientX - rect.left) / rect.width) * 100
    size = Math.min(100 - min, Math.max(min, pct))
  }

  function onPointerUp() {
    dragging = false
    if (storageKey) localStorage.setItem(storageKey, String(size))
  }
</script>

<div class="split {orientation}" bind:this={container}>
  <div class="pane first" style="flex-basis: {size}%">{@render a()}</div>
  <div
    class="divider"
    role="separator"
    aria-orientation={orientation === 'rows' ? 'horizontal' : 'vertical'}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
  ></div>
  <div class="pane rest">{@render b()}</div>
</div>

<style>
  .split {
    display: flex;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  .split.rows {
    flex-direction: column;
  }
  .pane {
    overflow: hidden;
    min-width: 0;
    min-height: 0;
  }
  .pane.first {
    flex-shrink: 0;
    flex-grow: 0;
  }
  .pane.rest {
    flex: 1;
  }
  .divider {
    flex-shrink: 0;
    z-index: 1;
    touch-action: none;
  }
  .rows > .divider {
    height: 4px;
    background: #333;
    cursor: row-resize;
  }
  .columns > .divider {
    width: 12px;
    background: #0d0d0d;
    cursor: col-resize;
  }
  .divider:hover {
    background: #555;
  }
</style>
