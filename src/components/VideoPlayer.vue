<template>
  <div class="video-player">
    <div class="url-bar">
      <input
        v-model="rawUrl"
        class="url-input"
        placeholder="YouTube oder Instagram URL einfügen..."
        @paste="onPaste"
      />
    </div>
    <div class="embed-area">
      <iframe
        v-if="embedUrl"
        :src="embedUrl"
        class="embed-frame"
        frameborder="0"
        allowfullscreen
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      />
      <div v-else-if="rawUrl && !embedUrl" class="error">
        URL wird nicht unterstützt — oder Instagram-Post ist nicht öffentlich.
      </div>
      <div v-else class="placeholder">YouTube / Instagram URL eingeben</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useVideoEmbed } from '../composables/useVideoEmbed'

const { toEmbedUrl } = useVideoEmbed()
const rawUrl = ref('')
const embedUrl = computed(() => toEmbedUrl(rawUrl.value))

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
  padding: 8px 12px;
  border-bottom: 1px solid #222;
  flex-shrink: 0;
}

.url-input {
  width: 100%;
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
