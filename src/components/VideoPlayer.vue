<template>
  <div class="video-player">
    <div class="url-bar">
      <input
        v-model="rawUrl"
        class="url-input"
        placeholder="YouTube URL einfügen..."
        @paste="onPaste"
      />
      <label class="loop-toggle" title="Dauerschleife">
        <input type="checkbox" v-model="loop" />
        ∞
      </label>
    </div>
    <div class="embed-area">
      <iframe
        v-if="embedUrl"
        :key="embedUrl"
        :src="embedUrl"
        class="embed-frame"
        frameborder="0"
        allowfullscreen
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      />
      <div v-else-if="rawUrl && !embedUrl" class="error">
        Keine gültige YouTube URL.
      </div>
      <div v-else class="placeholder">YouTube URL eingeben</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useVideoEmbed } from '../composables/useVideoEmbed'

const { toEmbedUrl } = useVideoEmbed()
const rawUrl = ref('')
const loop = ref(false)
const embedUrl = computed(() => toEmbedUrl(rawUrl.value, loop.value))

function onPaste(e: ClipboardEvent) {
  e.preventDefault()
  const text = e.clipboardData?.getData('text') ?? ''
  if (text) rawUrl.value = text
}
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
  border: none;
}

.placeholder, .error {
  color: #444;
  font-size: 13px;
  text-align: center;
  padding: 20px;
}

.error { color: #e63946; }
</style>
