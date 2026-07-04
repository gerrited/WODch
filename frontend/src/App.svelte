<script lang="ts">
  import SplitPane from './lib/components/SplitPane.svelte'
  import TimerBar from './lib/components/TimerBar.svelte'
  import TimerModal from './lib/components/TimerModal.svelte'
  import WorkoutEditor from './lib/components/WorkoutEditor.svelte'
  import VideoPlayer from './lib/components/VideoPlayer.svelte'
  import { timer } from './lib/stores/timer.svelte'
  import { session } from './lib/sync/session.svelte'
  import { onMount } from 'svelte'

  let showModal = $state(false)

  function onKeydown(e: KeyboardEvent) {
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
    session.joinFromHash()
  })
</script>

<svelte:window onkeydown={onKeydown} onhashchange={() => session.joinFromHash()} />

<div id="layout">
  <SplitPane orientation="rows" initial={15} min={5}>
    {#snippet a()}
      <TimerBar onOpenModal={() => (showModal = true)} />
    {/snippet}
    {#snippet b()}
      <SplitPane orientation="columns" initial={50} min={10}>
        {#snippet a()}
          <WorkoutEditor />
        {/snippet}
        {#snippet b()}
          <VideoPlayer />
        {/snippet}
      </SplitPane>
    {/snippet}
  </SplitPane>
</div>

{#if showModal}
  <TimerModal onClose={() => (showModal = false)} />
{/if}

<style>
  #layout {
    height: 100%;
  }
</style>
