<template>
  <div class="timer-bar" @click="handleClick">
    <div class="timer-center">
      <span v-if="store.displayRound" class="round">{{ store.displayRound }}</span>
      <span class="time">{{ store.displayTime }}</span>
    </div>
    <ShareButton />
    <button class="gear" @click.stop="emit('openModal')" title="Timer-Einstellungen">⚙</button>
    <span class="connection-dot" :class="dotClass" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTimerStore } from '../stores/timerStore'
import { useSession } from '../composables/useSession'
import ShareButton from './ShareButton.vue'

const emit = defineEmits<{ openModal: [] }>()
const store = useTimerStore()
const { sessionId, isConnected, connectionError } = useSession()

const dotClass = computed(() => {
  if (!sessionId.value) return 'dot-off'
  if (connectionError.value) return 'dot-error'
  if (isConnected.value) return 'dot-ok'
  return 'dot-off'
})

function handleClick() {
  if (store.mode === 'clock' || (store.phase === 'idle' && !store.isRunning)) {
    emit('openModal')
  } else {
    store.toggle()
  }
}
</script>

<style scoped>
.timer-bar {
  position: relative;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #111;
  border-bottom: 2px solid #333;
  cursor: pointer;
  user-select: none;
  container-type: size;
}

.timer-bar:hover { background: #161616; }

.timer-center {
  display: flex;
  align-items: baseline;
  gap: 24px;
}

.round {
  font-size: clamp(14px, 25cqh, 9999px);
  color: #888;
  letter-spacing: 2px;
  font-weight: 600;
}

.time {
  font-size: clamp(28px, 60cqh, 9999px);
  font-weight: 900;
  color: #fff;
  letter-spacing: 4px;
  font-family: monospace;
}

.gear {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #444;
  font-size: 36px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  line-height: 1;
}

.gear:hover { color: #888; background: #222; }

.connection-dot {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transition: background-color 0.3s;
}

.dot-off { background: #333; }
.dot-ok { background: #4caf50; }
.dot-error { background: #e63946; }
</style>
