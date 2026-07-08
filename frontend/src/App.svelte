<script lang="ts">
  import MobileTabs from './lib/components/MobileTabs.svelte'
  import SplitPane from './lib/components/SplitPane.svelte'
  import TimerBar from './lib/components/TimerBar.svelte'
  import TimerModal from './lib/components/TimerModal.svelte'
  import WorkoutEditor from './lib/components/WorkoutEditor.svelte'
  import VideoPlayer from './lib/components/VideoPlayer.svelte'
  import Tour from './lib/components/Tour.svelte'
  import { desktopSteps, mobileSteps, shouldAutoStart } from './lib/components/tour'
  import { timer } from './lib/stores/timer.svelte'
  import { session } from './lib/sync/session.svelte'
  import { onMount } from 'svelte'

  let showModal = $state(false)
  let showTour = $state(false)
  let mobileTabs = $state<{ selectTab: (i: number) => void }>()

  function endTour() {
    showTour = false
    try {
      localStorage.setItem('wodch.tourDone', '1')
    } catch {
      // localStorage nicht verfügbar — Tour startet dann bei jedem Besuch
    }
  }

  // Schmal (Hochformat) oder flach (Smartphone im Querformat) → mobile Tab-Ansicht
  const mobileQuery = window.matchMedia('(max-width: 768px), (max-height: 500px)')
  let isMobile = $state(mobileQuery.matches)

  function onKeydown(e: KeyboardEvent) {
    if (showTour) return
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
    if (e.code === 'Space') {
      e.preventDefault()
      timer.toggle()
    } else if (e.code === 'KeyR') {
      timer.reset()
    } else if (e.code === 'KeyM') {
      showModal = !showModal
    }
  }

  onMount(() => {
    session.joinFromLocation()
    const onChange = (e: MediaQueryListEvent) => (isMobile = e.matches)
    mobileQuery.addEventListener('change', onChange)
    try {
      showTour = shouldAutoStart(localStorage.getItem('wodch.tourDone'))
    } catch {
      showTour = true
    }
    return () => mobileQuery.removeEventListener('change', onChange)
  })
</script>

<svelte:window onkeydown={onKeydown} onhashchange={() => session.joinFromLocation()} />

<div id="layout">
  {#if isMobile}
    <MobileTabs bind:this={mobileTabs}>
      {#snippet video()}
        <VideoPlayer />
      {/snippet}
      {#snippet workout()}
        <WorkoutEditor />
      {/snippet}
      {#snippet timer()}
        <TimerBar onOpenModal={() => (showModal = true)} onStartTour={() => (showTour = true)} />
      {/snippet}
    </MobileTabs>
  {:else}
    <SplitPane orientation="rows" initial={15} min={5} storageKey="wodch-split-timer">
      {#snippet a()}
        <TimerBar onOpenModal={() => (showModal = true)} onStartTour={() => (showTour = true)} />
      {/snippet}
      {#snippet b()}
        <SplitPane orientation="columns" initial={50} min={10} storageKey="wodch-split-editor">
          {#snippet a()}
            <WorkoutEditor />
          {/snippet}
          {#snippet b()}
            <VideoPlayer />
          {/snippet}
        </SplitPane>
      {/snippet}
    </SplitPane>
  {/if}
</div>

{#if showModal}
  <TimerModal onClose={() => (showModal = false)} />
{/if}

{#if showTour}
  <Tour
    steps={isMobile ? mobileSteps : desktopSteps}
    onClose={endTour}
    onTab={(i) => mobileTabs?.selectTab(i)}
  />
{/if}

<style>
  #layout {
    height: 100%;
  }
</style>
