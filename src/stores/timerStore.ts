import { defineStore } from 'pinia'
import type { TimerMode, TimerPhase, IntervalPreset, CustomInterval } from '../types'

const CUSTOM_KEY = 'wodch-custom-intervals'
const TICK_MS = 10
const CLOCK_TICK_MS = 1000

let _intervalId: ReturnType<typeof setInterval> | null = null

function formatClock(date: Date, is12h: boolean): string {
  const h = date.getHours()
  const m = date.getMinutes()
  const s = date.getSeconds()
  if (is12h) {
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 || 12
    return `${h12}:${pad(m)}:${pad(s)} ${ampm}`
  }
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function formatMs(ms: number, centiseconds = false): string {
  const clamped = Math.max(0, ms)
  if (centiseconds) {
    const totalSec = Math.floor(clamped / 1000)
    const cs = Math.floor((clamped % 1000) / 10)
    const sec = totalSec % 60
    const min = Math.floor(totalSec / 60) % 60
    return `${pad(min)}:${pad(sec)}.${pad(cs)}`
  }
  const totalSec = Math.ceil(clamped / 1000)
  const sec = totalSec % 60
  const min = Math.floor(totalSec / 60) % 60
  const hrs = Math.floor(totalSec / 3600)
  if (hrs > 0) return `${hrs}:${pad(min)}:${pad(sec)}`
  return `${pad(min)}:${pad(sec)}`
}

export const useTimerStore = defineStore('timer', {
  state: () => ({
    mode: 'clock' as TimerMode,
    preset: null as IntervalPreset | null,
    phase: 'idle' as TimerPhase,
    isRunning: false,
    elapsed: 0,
    lastElapsed: 0,
    startTime: null as number | null,
    clockDisplay: formatClock(new Date(), false),
    clock12h: false,
    countdownTarget: 3 * 60 * 1000,
    countupStart: 0,
    workDuration: 20 * 1000,
    restDuration: 10 * 1000,
    warmupDuration: 10 * 1000,
    warmupEnabled: false,
    emomInterval: 60 * 1000,
    emomRounds: 10,
    currentRound: 0,
    totalRounds: 8,
    customIntervals: [] as CustomInterval[],
  }),

  getters: {
    displayTime: (state): string => {
      if (state.mode === 'clock') return state.clockDisplay
      if (state.mode === 'stopwatch') return formatMs(state.elapsed, true)
      if (state.mode === 'countdown') return formatMs(state.countdownTarget - state.elapsed)
      if (state.mode === 'countup') return formatMs(state.countupStart + state.elapsed)
      // interval
      if (state.phase === 'warmup') return formatMs(state.warmupDuration - state.elapsed)
      if (state.phase === 'work') return formatMs(state.workDuration - state.elapsed)
      if (state.phase === 'rest') return formatMs(state.restDuration - state.elapsed)
      return formatMs(state.workDuration)
    },

    displayRound: (state): string | null => {
      if (state.mode !== 'interval') return null
      if (state.phase === 'idle' || state.phase === 'warmup') return null
      if (state.totalRounds === 0) return null
      return `${state.currentRound} / ${state.totalRounds}`
    },
  },

  actions: {
    setMode(mode: TimerMode) {
      this._stop()
      this.isRunning = false
      this.mode = mode
      this.preset = null
      this.phase = 'idle'
      this.elapsed = 0
      this.lastElapsed = 0
      this.startTime = null
      this.currentRound = 0
      if (mode === 'clock') this.clockDisplay = formatClock(new Date(), this.clock12h)
    },

    start() {
      if (this.isRunning) return
      this.startTime = Date.now()
      this.isRunning = true
      if (this.mode === 'clock') {
        this.clockDisplay = formatClock(new Date(), this.clock12h)
        _intervalId = setInterval(() => {
          this.clockDisplay = formatClock(new Date(), this.clock12h)
        }, CLOCK_TICK_MS)
        return
      }
      if (this.mode === 'interval' && this.phase === 'idle') {
        this.phase = this.warmupEnabled ? 'warmup' : 'work'
        if (this.phase === 'work') this.currentRound = 1
        this.elapsed = 0
        this.lastElapsed = 0
      }
      _intervalId = setInterval(() => this._tick(), TICK_MS)
    },

    pause() {
      if (!this.isRunning) return
      this._stop()
      this.lastElapsed = this.elapsed
      this.startTime = null
      this.isRunning = false
    },

    toggle() {
      if (this.isRunning) this.pause()
      else this.start()
    },

    reset() {
      this._stop()
      this.isRunning = false
      this.elapsed = 0
      this.lastElapsed = 0
      this.startTime = null
      this.phase = 'idle'
      this.currentRound = 0
    },

    applyPreset(preset: IntervalPreset) {
      this.reset()
      this.mode = 'interval'
      this.preset = preset
      this.warmupEnabled = false
      if (preset === 'tabata') {
        this.workDuration = 20 * 1000
        this.restDuration = 10 * 1000
        this.totalRounds = 8
      } else if (preset === 'fgb1') {
        this.workDuration = 5 * 60 * 1000
        this.restDuration = 60 * 1000
        this.totalRounds = 5
      } else if (preset === 'fgb2') {
        this.workDuration = 5 * 60 * 1000
        this.restDuration = 60 * 1000
        this.totalRounds = 3
      } else if (preset === 'emom') {
        this.workDuration = this.emomInterval
        this.restDuration = 0
        this.totalRounds = this.emomRounds
      } else if (preset.startsWith('custom-')) {
        const slot = parseInt(preset.replace('custom-', ''), 10)
        if (!Number.isFinite(slot)) return
        const ci = this.customIntervals[slot]
        if (ci) {
          this.workDuration = ci.workDuration
          this.restDuration = ci.restDuration
          this.totalRounds = ci.rounds
        }
      }
    },

    loadCustomIntervals() {
      try {
        const raw = localStorage.getItem(CUSTOM_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) this.customIntervals = parsed
        }
      } catch { /* ignore corrupt data */ }
    },

    saveCustomInterval(slot: number, interval: CustomInterval) {
      const empty: CustomInterval = { name: '', rounds: 1, workDuration: 60000, restDuration: 0 }
      while (this.customIntervals.length <= slot) this.customIntervals.push({ ...empty })
      this.customIntervals[slot] = interval
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(this.customIntervals))
    },

    _tick() {
      if (this.startTime === null) return
      this.elapsed = this.lastElapsed + (Date.now() - this.startTime)
      this._checkPhase()
    },

    _checkPhase() {
      if (this.mode === 'countdown') {
        if (this.elapsed >= this.countdownTarget) {
          this.elapsed = this.countdownTarget
          this._stop()
          this.isRunning = false
          this.phase = 'idle'
        }
        return
      }
      if (this.mode !== 'interval') return
      if (this.phase === 'warmup' && this.elapsed >= this.warmupDuration) {
        this._nextPhase('work', 1)
      } else if (this.phase === 'work' && this.elapsed >= this.workDuration) {
        if (this.restDuration > 0) {
          this._nextPhase('rest', this.currentRound)
        } else {
          this._nextRound()
        }
      } else if (this.phase === 'rest' && this.elapsed >= this.restDuration) {
        this._nextRound()
      }
    },

    _nextPhase(phase: TimerPhase, round: number) {
      this.phase = phase
      this.currentRound = round
      this.elapsed = 0
      this.lastElapsed = 0
      this.startTime = Date.now()
    },

    _nextRound() {
      const next = this.currentRound + 1
      if (next > this.totalRounds) {
        this._stop()
        this.isRunning = false
        this.phase = 'idle'
        this.currentRound = 0
      } else {
        this._nextPhase('work', next)
      }
    },

    _stop() {
      if (_intervalId !== null) {
        clearInterval(_intervalId)
        _intervalId = null
      }
    },
  },
})
