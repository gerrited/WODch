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

  const cardStyle = $derived.by(() => {
    if (!targetRect) return ''
    const left = Math.max(16, Math.min(targetRect.left, window.innerWidth - CARD_WIDTH - 16))
    const vertical =
      placement === 'below'
        ? `top: ${targetRect.bottom + 12}px;`
        : `bottom: ${window.innerHeight - targetRect.top + 12}px;`
    return `left: ${left}px; ${vertical}`
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

  <div class="tour-card" class:center={!targetRect} style={cardStyle}>
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
    border-radius: 8px;
    /* dunkelt alles außer dem Ziel ab */
    box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.7);
    pointer-events: none;
  }
  .tour-card {
    position: fixed;
    width: 320px;
    max-width: calc(100vw - 32px);
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 16px;
    color: #ddd;
    font-family: monospace;
  }
  .tour-card.center {
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }
  .tour-title {
    font-size: 16px;
    font-weight: 700;
    color: #fff;
    margin-bottom: 8px;
  }
  .tour-body {
    font-size: 13px;
    line-height: 1.5;
    margin-bottom: 14px;
  }
  .tour-footer {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .tour-progress {
    color: #666;
    font-size: 12px;
    margin-right: auto;
  }
  .tour-footer button {
    background: none;
    border: 1px solid #444;
    border-radius: 4px;
    color: #ccc;
    font-family: monospace;
    font-size: 12px;
    padding: 6px 10px;
    cursor: pointer;
  }
  .tour-footer button:hover {
    background: #222;
    color: #fff;
  }
  .tour-skip {
    border-color: transparent;
    color: #666;
  }
  .tour-next {
    border-color: #a8d129;
    color: #a8d129;
  }
</style>
