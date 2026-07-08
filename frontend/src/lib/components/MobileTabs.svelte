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
    { id: 'video', label: 'Video' },
    { id: 'workout', label: 'Workout' },
    { id: 'timer', label: 'Timer' },
  ]

  let active = $state(1) // Workout als Start-Tab (Mitte)
  let panelsEl: HTMLDivElement | undefined = $state()

  function scrollToActive(behavior: ScrollBehavior) {
    if (!panelsEl) return
    if (typeof panelsEl.scrollTo === 'function') {
      panelsEl.scrollTo({ left: active * panelsEl.clientWidth, behavior })
    } else {
      panelsEl.scrollLeft = active * panelsEl.clientWidth
    }
  }

  function select(index: number) {
    active = index
    scrollToActive('smooth')
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
    <div class="panel">{@render video()}</div>
    <div class="panel">{@render workout()}</div>
    <div class="panel">{@render timer()}</div>
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
    background: #000;
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
  }
  .tab-bar {
    flex-shrink: 0;
    display: flex;
    background: #111;
    border-top: 2px solid #333;
    padding-bottom: env(safe-area-inset-bottom);
  }
  .tab {
    flex: 1;
    background: none;
    border: none;
    border-top: 3px solid transparent;
    color: #666;
    font-family: monospace;
    font-size: 13px;
    letter-spacing: 1px;
    padding: 14px 0 12px;
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
  .tab.active {
    color: #fff;
    border-top-color: #e63946;
  }
</style>
