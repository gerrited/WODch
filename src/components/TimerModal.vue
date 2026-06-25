<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal">
      <button class="close-btn" @click="emit('close')">✕</button>

      <!-- Modus-Auswahl -->
      <section class="section">
        <div class="label">MODUS</div>
        <div class="radio-group">
          <label v-for="m in modes" :key="m.value" class="radio-label">
            <input type="radio" :value="m.value" v-model="selectedMode" @change="onModeChange" />
            {{ m.label }}
          </label>
        </div>
      </section>

      <!-- Countdown-Ziel -->
      <section v-if="selectedMode === 'countdown'" class="section">
        <div class="label">ZIEL-ZEIT</div>
        <div class="time-input-row">
          <input type="number" v-model.number="countdownMinutes" min="0" max="99" class="time-input" /> Min
          <input type="number" v-model.number="countdownSeconds" min="0" max="59" class="time-input" /> Sek
        </div>
      </section>

      <!-- Count-Up Startzeit -->
      <section v-if="selectedMode === 'countup'" class="section">
        <div class="label">START-ZEIT</div>
        <div class="time-input-row">
          <input type="number" v-model.number="countupMinutes" min="0" max="99" class="time-input" /> Min
          <input type="number" v-model.number="countupSeconds" min="0" max="59" class="time-input" /> Sek
        </div>
      </section>

      <!-- Uhrzeit-Format -->
      <section v-if="selectedMode === 'clock'" class="section">
        <div class="label">FORMAT</div>
        <div class="radio-group">
          <label class="radio-label">
            <input type="radio" :value="false" v-model="store.clock12h" /> 24h
          </label>
          <label class="radio-label">
            <input type="radio" :value="true" v-model="store.clock12h" /> 12h (AM/PM)
          </label>
        </div>
      </section>

      <!-- Intervall-Preset-Auswahl -->
      <section v-if="selectedMode === 'interval'" class="section">
        <div class="label">PRESET</div>
        <div class="radio-group">
          <label v-for="p in presets" :key="p.value" class="radio-label">
            <input type="radio" :value="p.value" v-model="selectedPreset" @change="onPresetChange" />
            {{ p.label }}
          </label>
        </div>
      </section>

      <!-- EMOM-Konfiguration -->
      <section v-if="selectedPreset === 'emom'" class="section">
        <div class="label">EMOM EINSTELLUNGEN</div>
        <div class="config-row">
          <span>Intervall</span>
          <div class="time-input-row">
            <input type="number" v-model.number="emomMinutes" min="0" max="99" class="time-input" /> Min
            <input type="number" v-model.number="emomSeconds" min="0" max="59" class="time-input" /> Sek
          </div>
        </div>
        <div class="config-row">
          <span>Runden</span>
          <input type="number" v-model.number="store.emomRounds" min="1" max="99" class="time-input" />
        </div>
      </section>

      <!-- Custom Interval -->
      <section v-if="selectedPreset && selectedPreset.startsWith('custom-')" class="section">
        <div class="label">CUSTOM INTERVAL</div>
        <div class="config-row">
          <span>Name</span>
          <input type="text" v-model="customName" class="text-input" maxlength="20" />
        </div>
        <div class="config-row">
          <span>Runden</span>
          <input type="number" v-model.number="customRounds" min="1" max="99" class="time-input" />
        </div>
        <div class="config-row">
          <span>Work</span>
          <div class="time-input-row">
            <input type="number" v-model.number="customWorkMinutes" min="0" max="99" class="time-input" /> Min
            <input type="number" v-model.number="customWorkSeconds" min="0" max="59" class="time-input" /> Sek
          </div>
        </div>
        <div class="config-row">
          <span>Rest</span>
          <div class="time-input-row">
            <input type="number" v-model.number="customRestMinutes" min="0" max="99" class="time-input" /> Min
            <input type="number" v-model.number="customRestSeconds" min="0" max="59" class="time-input" /> Sek
          </div>
        </div>
      </section>

      <!-- Warmup -->
      <section v-if="selectedMode === 'interval'" class="section">
        <div class="label">WARMUP</div>
        <div class="config-row">
          <label class="radio-label">
            <input type="checkbox" v-model="store.warmupEnabled" /> Aktiviert
          </label>
          <div v-if="store.warmupEnabled" class="time-input-row">
            <input type="number" v-model.number="warmupMinutes" min="0" max="99" class="time-input" /> Min
            <input type="number" v-model.number="warmupSeconds" min="0" max="59" class="time-input" /> Sek
          </div>
        </div>
      </section>

      <!-- Steuerung -->
      <div class="controls">
        <button class="btn btn-primary" @click="handleStart">▶ Start</button>
        <button class="btn" @click="store.pause()" :disabled="!store.isRunning">⏸ Pause</button>
        <button class="btn" @click="store.reset()">↺ Reset</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useTimerStore } from '../stores/timerStore'
import type { TimerMode, IntervalPreset } from '../types'

const emit = defineEmits<{ close: [] }>()
const store = useTimerStore()

const modes: { value: TimerMode; label: string }[] = [
  { value: 'clock', label: 'Uhrzeit' },
  { value: 'stopwatch', label: 'Stoppuhr' },
  { value: 'countdown', label: 'Count-Down' },
  { value: 'countup', label: 'Count-Up' },
  { value: 'interval', label: 'Intervall' },
]

const presets = computed(() => [
  { value: 'tabata', label: 'Tabata (20s/10s × 8)' },
  { value: 'fgb1', label: 'Fight Gone Bad 1 (5×5min)' },
  { value: 'fgb2', label: 'Fight Gone Bad 2 (3×5min)' },
  { value: 'emom', label: 'EMOM' },
  ...Array.from({ length: 10 }, (_, i) => ({
    value: `custom-${i}` as IntervalPreset,
    label: store.customIntervals[i]?.name || `Custom ${i + 1}`,
  })),
])

const selectedMode = ref<TimerMode>(store.mode)
const selectedPreset = ref<IntervalPreset | null>(store.preset)

// Countdown
const countdownMinutes = ref(Math.floor(store.countdownTarget / 60000))
const countdownSeconds = ref(Math.floor((store.countdownTarget % 60000) / 1000))

// Count-up
const countupMinutes = ref(Math.floor(store.countupStart / 60000))
const countupSeconds = ref(Math.floor((store.countupStart % 60000) / 1000))

// EMOM
const emomMinutes = ref(Math.floor(store.emomInterval / 60000))
const emomSeconds = ref(Math.floor((store.emomInterval % 60000) / 1000))

// Warmup
const warmupMinutes = ref(Math.floor(store.warmupDuration / 60000))
const warmupSeconds = ref(Math.floor((store.warmupDuration % 60000) / 1000))

// Custom
const customSlot = computed(() =>
  selectedPreset.value?.startsWith('custom-')
    ? parseInt(selectedPreset.value.replace('custom-', ''), 10)
    : -1
)
const existingCustom = computed(() =>
  customSlot.value >= 0 ? store.customIntervals[customSlot.value] : null
)
const customName = ref(existingCustom.value?.name ?? '')
const customRounds = ref(existingCustom.value?.rounds ?? 5)
const customWorkMinutes = ref(Math.floor((existingCustom.value?.workDuration ?? 300000) / 60000))
const customWorkSeconds = ref(Math.floor(((existingCustom.value?.workDuration ?? 300000) % 60000) / 1000))
const customRestMinutes = ref(Math.floor((existingCustom.value?.restDuration ?? 60000) / 60000))
const customRestSeconds = ref(Math.floor(((existingCustom.value?.restDuration ?? 60000) % 60000) / 1000))

onMounted(() => store.loadCustomIntervals())

function onModeChange() {
  store.setMode(selectedMode.value)
  selectedPreset.value = null
}

function onPresetChange() {
  if (selectedPreset.value) store.applyPreset(selectedPreset.value)
}

function handleStart() {
  if (selectedMode.value === 'countdown') {
    store.countdownTarget = (countdownMinutes.value * 60 + countdownSeconds.value) * 1000
  } else if (selectedMode.value === 'countup') {
    store.countupStart = (countupMinutes.value * 60 + countupSeconds.value) * 1000
  } else if (selectedPreset.value === 'emom') {
    store.emomInterval = (emomMinutes.value * 60 + emomSeconds.value) * 1000
    store.applyPreset('emom')
  } else if (selectedPreset.value?.startsWith('custom-') && customSlot.value >= 0) {
    store.saveCustomInterval(customSlot.value, {
      name: customName.value || `Custom ${customSlot.value + 1}`,
      rounds: customRounds.value,
      workDuration: (customWorkMinutes.value * 60 + customWorkSeconds.value) * 1000,
      restDuration: (customRestMinutes.value * 60 + customRestSeconds.value) * 1000,
    })
    store.applyPreset(selectedPreset.value)
  }
  if (store.warmupEnabled) {
    store.warmupDuration = (warmupMinutes.value * 60 + warmupSeconds.value) * 1000
  }
  store.reset()
  store.start()
  emit('close')
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: #111;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 24px;
  width: 420px;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
}

.close-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  background: none;
  border: none;
  color: #666;
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
}

.close-btn:hover { color: #fff; }

.section { margin-bottom: 20px; }

.label {
  font-size: 10px;
  letter-spacing: 3px;
  color: #666;
  margin-bottom: 8px;
}

.radio-group {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #ccc;
  font-size: 13px;
  cursor: pointer;
}

.time-input-row {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #888;
  font-size: 13px;
}

.time-input {
  width: 52px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 4px;
  padding: 4px 8px;
  color: #fff;
  font-size: 14px;
  text-align: center;
}

.text-input {
  flex: 1;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 4px;
  padding: 4px 8px;
  color: #fff;
  font-size: 13px;
}

.config-row {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #888;
  font-size: 13px;
  margin-bottom: 8px;
}

.config-row span { min-width: 60px; }

.controls {
  display: flex;
  gap: 10px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #222;
}

.btn {
  flex: 1;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 4px;
  color: #ccc;
  padding: 10px;
  font-size: 13px;
  cursor: pointer;
}

.btn:hover:not(:disabled) { background: #222; color: #fff; }
.btn:disabled { opacity: 0.4; cursor: default; }

.btn-primary {
  background: #e63946;
  border-color: #e63946;
  color: #fff;
  font-weight: 700;
}

.btn-primary:hover { background: #c1121f; border-color: #c1121f; }
</style>
