<template>
  <div id="app">
    <Splitpanes horizontal class="root-panes">
      <!-- Zeile 1: Timer-Leiste -->
      <Pane :size="15" :min-size="5">
        <TimerBar @open-modal="showModal = true" />
      </Pane>

      <!-- Zeile 2: Editor + Video -->
      <Pane :size="85">
        <Splitpanes class="inner-panes">
          <Pane :size="50">
            <WorkoutEditor />
          </Pane>
          <Pane :size="50">
            <VideoPlayer />
          </Pane>
        </Splitpanes>
      </Pane>
    </Splitpanes>

    <TimerModal v-if="showModal" @close="showModal = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Splitpanes, Pane } from 'splitpanes'
import TimerBar from './components/TimerBar.vue'
import WorkoutEditor from './components/WorkoutEditor.vue'
import VideoPlayer from './components/VideoPlayer.vue'
import TimerModal from './components/TimerModal.vue'
import { useTimerStore } from './stores/timerStore'

const store = useTimerStore()
const showModal = ref(false)

function onKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement).tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return

  if (e.code === 'Space') {
    e.preventDefault()
    store.toggle()
  } else if (e.code === 'KeyR') {
    store.reset()
  } else if (e.code === 'KeyM') {
    showModal.value = !showModal.value
  }
}

onMounted(() => {
  store.start() // Uhr startet direkt
  document.addEventListener('keydown', onKeydown)
})
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #app { height: 100%; background: #000; color: #fff; font-family: monospace; }

.root-panes { height: 100%; }
.inner-panes { height: 100%; }

/* splitpanes Handles */
:deep(.splitpanes__splitter) {
  background: #333 !important;
  z-index: 1;
}
:deep(.splitpanes--horizontal > .splitpanes__splitter) {
  height: 2px !important;
}
:deep(.splitpanes--vertical > .splitpanes__splitter) {
  width: 2px !important;
}
:deep(.splitpanes__splitter:hover) {
  background: #555 !important;
}
</style>
