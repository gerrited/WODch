<template>
  <button class="share-btn" @click="handleClick" :title="label">
    {{ icon }}
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSession } from '../composables/useSession'

const { sessionId, createSession } = useSession()

const icon = computed(() => sessionId.value ? '🔗' : '📤')
const label = computed(() => sessionId.value ? 'Link kopieren' : 'Session teilen')

async function handleClick() {
  if (sessionId.value) {
    await navigator.clipboard.writeText(window.location.href).catch(() => {})
  } else {
    await createSession()
  }
}
</script>

<style scoped>
.share-btn {
  position: absolute;
  right: 60px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  font-size: 22px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  line-height: 1;
  opacity: 0.5;
  transition: opacity 0.15s;
}

.share-btn:hover { opacity: 1; background: #222; }
</style>
