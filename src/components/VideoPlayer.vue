<template>
  <div class="video-player">
    <div class="url-bar">
      <input
        v-model="store.rawUrl"
        class="url-input"
        placeholder="YouTube URL einfügen..."
        @paste="onPaste"
      />
      <label class="loop-toggle" title="Dauerschleife">
        <input type="checkbox" v-model="store.loop" />
        ∞
      </label>
    </div>
    <div class="embed-area">
      <div v-if="store.rawUrl && !currentVideoId" class="error">
        Keine gültige YouTube URL.
      </div>
      <div v-else-if="!store.rawUrl" class="placeholder">YouTube URL eingeben</div>
      <div ref="playerContainer" class="embed-frame" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useVideoEmbed, extractVideoId, videoLoop } from '../composables/useVideoEmbed'
import { useVideoStore } from '../stores/videoStore'

const store = useVideoStore()
const { initPlayer } = useVideoEmbed()
const playerContainer = ref<HTMLElement>()
const currentVideoId = ref<string | null>(null)

function onPaste(e: ClipboardEvent) {
  e.preventDefault()
  const text = e.clipboardData?.getData('text') ?? ''
  if (text) store.rawUrl = text
}

watch(() => store.rawUrl, async (url) => {
  const id = extractVideoId(url)
  if (!id) { currentVideoId.value = null; return }
  if (id === currentVideoId.value) return
  currentVideoId.value = id
  if (playerContainer.value) {
    // initPlayer erwartet ein Element; ersetze den Container-Inhalt durch ein frisches div
    const el = document.createElement('div')
    playerContainer.value.innerHTML = ''
    playerContainer.value.appendChild(el)
    await initPlayer(el, id)
  }
}, { immediate: true })

// Loop-Zustand in das Singleton-Modul spiegeln
watch(() => store.loop, (val) => {
  videoLoop.value = val
}, { immediate: true })
</script>

<style scoped>
.video-player {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #0d0d0d;
}

.url-bar {
  height: 40px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-bottom: 2px solid #333;
  flex-shrink: 0;
}

.url-input {
  flex: 1;
  background: #111;
  border: 1px solid #333;
  border-radius: 4px;
  padding: 6px 10px;
  color: #ccc;
  font-size: 12px;
  font-family: monospace;
  outline: none;
}

.url-input:focus { border-color: #555; }
.url-input::placeholder { color: #444; }

.loop-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #555;
  font-size: 18px;
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
}

.loop-toggle input { display: none; }
.loop-toggle:has(input:checked) { color: #fff; }

.embed-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.embed-frame {
  width: 100%;
  height: 100%;
}

.placeholder, .error {
  color: #444;
  font-size: 13px;
  text-align: center;
  padding: 20px;
}

.error { color: #e63946; }
</style>
