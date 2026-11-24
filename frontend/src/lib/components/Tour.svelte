<script lang="ts">
  import { cardPlacement, type TourStep } from './tour'

  let {
    steps,
    onClose,
    onTab,
  }: {
    steps: TourStep[]
    onClose: () => void
    onTab?: (tab: number) => void
  } = $props()

  let index = $state(0)
  const step = $derived(steps[index])
  const isLast = $derived(index === steps.length - 1)

  let targetRect = $state<DOMRect | null>(null)

  function measure() {
    if (!step.target) {
      targetRect = null
      return
    }
    const el = document.querySelector(`[data-tour="${step.target}"]`)
    const rect = el?.getBoundingClientRect() ?? null
    // Element ohne Ausdehnung (nicht sichtbar / jsdom): zentrierte Karte statt Spotlight
    targetRect = rect && rect.width > 0 ? rect : null
  }

  // Bei Schrittwechsel: Tab melden, dann nach dem Rendern (Tab-Wechsel!) das Ziel vermessen
  $effect(() => {
    if (step.tab !== undefined) onTab?.(step.tab)
    targetRect = null
    const frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
  })

  function next() {
    if (isLast) onClose()
    else index += 1
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose()
  }

  const placement = $derived(
    targetRect ? cardPlacement(targetRect.top, targetRect.bottom, window.innerHeight) : 'center'
  )

  const CARD_WIDTH = 320
  let cardHeight = $state(0)

  const cardStyle = $derived.by(() => {
    if (!targetRect) return ''
    const left = Math.max(16, Math.min(targetRect.left, window.innerWidth - CARD_WIDTH - 16))
    const desired =
      placement === 'below' ? targetRect.bottom + 12 : targetRect.top - 12 - cardHeight
    // In den Viewport klemmen — bei großen Zielen liegt die Karte dann über dem Spotlight
    const top = Math.max(16, Math.min(desired, window.innerHeight - cardHeight - 16))
    return `left: ${left}px; top: ${top}px;`
  })
</script>

<svelte:window onkeydown={onKeydown} onresize={measure} />

<div class="tour">
  {#if targetRect}
    <div
      class="spotlight"
      style="top: {targetRect.top - 4}px; left: {targetRect.left -
        4}px; width: {targetRect.width + 8}px; height: {targetRect.height + 8}px"
    ></div>
  {:else}
    <div class="backdrop"></div>
  {/if}

  <div class="tour-card" class:center={!targetRect} style={cardStyle} bind:clientHeight={cardHeight}>
    <div class="tour-title">{step.title}</div>
    <div class="tour-body">{step.body}</div>
    <div class="tour-footer">
      <span class="tour-progress">{index + 1}/{steps.length}</span>
      <button class="tour-skip" onclick={onClose}>Überspringen</button>
      {#if index > 0}
        <button class="tour-back" onclick={() => (index -= 1)}>Zurück</button>
      {/if}
      <button class="tour-next" onclick={next}>{isLast ? 'Fertig' : 'Weiter'}</button>
    </div>
  </div>
</div>

<style>
  .tour {
    position: fixed;
    inset: 0;
    z-index: 1000;
  }
  .backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
  }
  .spotlight {
    position: fixed;
    border: 2px solid var(--accent);
    border-radius: var(--radius);
    /* dunkelt alles außer dem Ziel ab */
    box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.7);
    pointer-events: none;
  }
  .tour-card {
    position: fixed;
    width: 340px;
    max-width: calc(100vw - 32px);
    background: var(--surface);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-lg);
    padding: 20px;
    color: var(--text-2);
    font-family: var(--font-ui);
  }
  .tour-card.center {
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }
  .tour-title {
    font-size: 20px;
    font-weight: 600;
    line-height: 1.3;
    color: var(--text);
    margin-bottom: 8px;
  }
  .tour-body {
    font-size: 14px;
    line-height: 1.55;
    margin-bottom: 16px;
  }
  .tour-footer {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .tour-progress {
    color: var(--text-faint);
    font-family: var(--font-mono);
    font-size: 12px;
    margin-right: auto;
  }
  .tour-footer button {
    min-height: var(--tap);
    padding: 0 12px;
    background: none;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    color: var(--text);
    font: 500 13px/1 var(--font-ui);
    cursor: pointer;
    transition: border-color 0.15s, background-color 0.15s;
  }
  .tour-footer button:hover {
    border-color: var(--text-ghost);
  }
  .tour-footer button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .tour-skip {
    border-color: transparent !important;
    color: var(--text-muted) !important;
  }
  .tour-next {
    font-weight: 600 !important;
    color: var(--accent-ink) !important;
    background: var(--accent) !important;
    border-color: var(--accent) !important;
  }
</style>
