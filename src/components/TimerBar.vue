<template>
  <div class="timer-bar" @click="handleClick">
    <div class="timer-center">
      <span v-if="store.displayRound" class="round">{{ store.displayRound }}</span>
      <span class="time">{{ store.displayTime }}</span>
    </div>
    <button class="gear" @click.stop="emit('openModal')" title="Timer-Einstellungen">⚙</button>
  </div>
</template>

<script setup lang="ts">
import { useTimerStore } from '../stores/timerStore'

const emit = defineEmits<{ openModal: [] }>()
const store = useTimerStore()

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
  border-bottom: 1px solid #222;
  cursor: pointer;
  user-select: none;
}

.timer-bar:hover { background: #161616; }

.timer-center {
  display: flex;
  align-items: baseline;
  gap: 24px;
}

.round {
  font-size: clamp(14px, 2vh, 22px);
  color: #888;
  letter-spacing: 2px;
  font-weight: 600;
}

.time {
  font-size: clamp(28px, 5vh, 72px);
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
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  line-height: 1;
}

.gear:hover { color: #888; background: #222; }
</style>
