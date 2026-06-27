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
import { useSession, extractSessionId } from './composables/useSession'

const store = useTimerStore()
const { joinSession } = useSession()
const showModal = ref(false)

function onKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

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
  store.start()
  document.addEventListener('keydown', onKeydown)

  const id = extractSessionId()
  if (id) joinSession(id)
})

onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #app { height: 100%; background: #000; color: #fff; font-family: monospace; }

.root-panes { height: 100%; }
.inner-panes { height: 100%; }

/* splitpanes Handles */
.splitpanes--horizontal > .splitpanes__splitter {
  height: 4px !important;
  background: #333 !important;
  z-index: 1;
}
.splitpanes--vertical > .splitpanes__splitter {
  width: 12px !important;
  background: #0d0d0d !important;
  z-index: 1;
}
.splitpanes__splitter:hover {
  background: #555 !important;
}
</style>
