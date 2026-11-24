<script lang="ts">
  import type { Snippet } from 'svelte'
  import { onMount } from 'svelte'
  import { activeIndexFromScroll } from './tabScroll'

  let {
    video,
    workout,
    timer,
  }: {
    video: Snippet
    workout: Snippet
    timer: Snippet
  } = $props()

  const tabs = [
    { id: 'workout', label: 'Workout' },
    { id: 'timer', label: 'Timer' },
    { id: 'video', label: 'Video' },
  ]

  const STORAGE_KEY = 'wodch.activeTab'

  function initialActive(): number {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      const index = tabs.findIndex((t) => t.id === stored)
      if (index >= 0) return index
    } catch {
      // localStorage nicht verfügbar (z. B. Private Mode)
    }
    return 0
  }

  let active = $state(initialActive())
  let panelsEl: HTMLDivElement | undefined = $state()

  $effect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, tabs[active].id)
    } catch {
      // localStorage nicht verfügbar
    }
  })

  let scrollAnim = 0

  // Eigene, kurze Wisch-Animation — native 'smooth'-Scrolldauer ist nicht einstellbar.
  // Snap wird währenddessen abgeschaltet, sonst klemmt scroll-snap-stop den Sprung
  // über mehrere Panels auf ein einziges.
  function animateScrollTo(target: number) {
    if (!panelsEl) return
    cancelAnimationFrame(scrollAnim)
    const from = panelsEl.scrollLeft
    const dist = target - from
    if (dist === 0) return
    const duration = 180
    const start = performance.now()
    const easeOut = (t: number) => 1 - (1 - t) ** 3
    panelsEl.style.scrollSnapType = 'none'
    const step = (now: number) => {
      if (!panelsEl) return
      const t = Math.min(1, (now - start) / duration)
      panelsEl.scrollLeft = from + dist * easeOut(t)
      if (t < 1) {
        scrollAnim = requestAnimationFrame(step)
      } else {
        panelsEl.style.scrollSnapType = ''
      }
    }
    scrollAnim = requestAnimationFrame(step)
  }

  const prefersReducedMotion = () =>
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function scrollToActive(behavior: ScrollBehavior) {
    if (!panelsEl) return
    const target = active * panelsEl.clientWidth
    if (behavior === 'smooth' && !prefersReducedMotion()) {
      animateScrollTo(target)
    } else {
      cancelAnimationFrame(scrollAnim)
      panelsEl.style.scrollSnapType = ''
      panelsEl.scrollLeft = target
    }
  }

  function select(index: number) {
    active = index
    scrollToActive('smooth')
  }

  // Für die Onboarding-Tour: Tab von außen umschalten, ohne Scroll-Animation
  export function selectTab(index: number) {
    active = index
    scrollToActive('instant')
  }

  function onScroll() {
    if (!panelsEl) return
    active = activeIndexFromScroll(panelsEl.scrollLeft, panelsEl.clientWidth, tabs.length)
  }

  onMount(() => scrollToActive('instant'))
</script>

<!-- Nach Rotation/Resize wieder sauber auf den aktiven Tab einrasten -->
<svelte:window onresize={() => scrollToActive('instant')} />

<div class="mobile-tabs">
  <div class="panels" bind:this={panelsEl} onscroll={onScroll}>
    <div class="panel">{@render workout()}</div>
    <div class="panel">{@render timer()}</div>
    <div class="panel">{@render video()}</div>
  </div>
  <div class="tab-bar" role="tablist">
    {#each tabs as tab, i (tab.id)}
      <button
        role="tab"
        aria-selected={active === i}
        class="tab"
        class:active={active === i}
        onclick={() => select(i)}
      >
        {tab.label}
      </button>
    {/each}
  </div>
</div>

<style>
  .mobile-tabs {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }
  .panels {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x mandatory;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
  }
  .panels::-webkit-scrollbar {
    display: none;
  }
  .panel {
    flex: 0 0 100%;
    width: 100%;
    min-width: 0;
    scroll-snap-align: start;
    scroll-snap-stop: always;
    overflow: hidden;
    /* Containing Block für absolut positionierte Nachfahren: ohne ihn hängt z. B.
       ein visually-hidden-Label im Video-Panel am Dokument (x ≈ 2 × Viewport),
       wird vom Scroller nicht abgeschnitten und verbreitert die Seite. Mobile
       Browser vergrößern dann den Layout-Viewport, und alle fixed-Dialoge werden
       darin zentriert — also außerhalb des sichtbaren Bildes. */
    position: relative;
  }
  .tab-bar {
    flex-shrink: 0;
    display: flex;
    background: var(--bg-band);
    border-top: 1px solid var(--line);
    padding-bottom: env(safe-area-inset-bottom);
  }
  /* Mono wie die Editor-Tabs; aktiver Tab mit 2px-Lime-Linie an der Kante zum Inhalt */
  .tab {
    flex: 1;
    min-height: 52px;
    background: none;
    border: none;
    border-top: 2px solid transparent;
    margin-top: -1px;
    color: var(--text-faint);
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.04em;
    padding: 14px 0 12px;
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    transition: color 0.15s;
  }
  .tab.active {
    color: var(--text);
    font-weight: 700;
    border-top-color: var(--accent);
  }
  .tab:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
</style>
