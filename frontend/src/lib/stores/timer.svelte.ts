import {
  defaultTimerDoc,
  type CustomInterval,
  type IntervalPreset,
  type TimerDoc,
  type TimerMode,
} from '../types'
import { elapsedNow, deriveInterval, displayTime, displayRound, type Derived } from '../timer/engine'

export const CUSTOM_KEY = 'wodch-custom-intervals'

export class TimerStore {
  doc = $state<TimerDoc>(defaultTimerDoc())
  now = $state(Date.now())
  customIntervals = $state<CustomInterval[]>([])

  // Vom Session-Layer gesetzt; feuert nach jeder lokalen Aktion (nie bei applyRemote)
  onDocChange?: (doc: TimerDoc) => void

  elapsed = $derived(elapsedNow(this.doc, this.now))
  derived: Derived = $derived(
    deriveInterval(this.doc, this.elapsed, this.doc.isRunning || this.doc.accumulatedMs > 0),
  )
  displayTime = $derived(displayTime(this.doc, this.elapsed, new Date(this.now)))
  displayRound = $derived(displayRound(this.doc, this.elapsed))

  constructor() {
    this.loadCustomIntervals()
  }

  private commit(changes: Partial<TimerDoc>) {
    this.doc = { ...this.doc, ...changes }
    this.onDocChange?.(this.doc)
  }

  start() {
    if (this.doc.isRunning) return
    this.now = Date.now()
    this.commit({ isRunning: true, startedAt: Date.now() })
  }

  pause() {
    if (!this.doc.isRunning) return
    this.commit({ isRunning: false, startedAt: null, accumulatedMs: elapsedNow(this.doc, Date.now()) })
  }

  toggle() {
    if (this.doc.isRunning) this.pause()
    else this.start()
  }

  reset() {
    this.commit({ isRunning: false, startedAt: null, accumulatedMs: 0 })
  }

  setMode(mode: TimerMode) {
    this.commit({ mode, preset: null, isRunning: false, startedAt: null, accumulatedMs: 0 })
  }

  setConfig(partial: Partial<TimerDoc>) {
    this.commit(partial)
  }

  applyPreset(preset: IntervalPreset) {
    const base: Partial<TimerDoc> = {
      mode: 'interval',
      preset,
      isRunning: false,
      startedAt: null,
      accumulatedMs: 0,
      warmupEnabled: false,
    }
    if (preset === 'tabata') {
      this.commit({ ...base, workDuration: 20_000, restDuration: 10_000, totalRounds: 8 })
    } else if (preset === 'fgb1') {
      this.commit({ ...base, workDuration: 300_000, restDuration: 60_000, totalRounds: 5 })
    } else if (preset === 'fgb2') {
      this.commit({ ...base, workDuration: 300_000, restDuration: 60_000, totalRounds: 3 })
    } else if (preset === 'emom') {
      this.commit({ ...base, workDuration: this.doc.emomInterval, restDuration: 0, totalRounds: this.doc.emomRounds })
    } else if (preset.startsWith('custom-')) {
      const slot = parseInt(preset.replace('custom-', ''), 10)
      const ci = Number.isFinite(slot) ? this.customIntervals[slot] : undefined
      if (!ci) return
      this.commit({ ...base, workDuration: ci.workDuration, restDuration: ci.restDuration, totalRounds: ci.rounds })
    }
  }

  loadCustomIntervals() {
    try {
      const raw = localStorage.getItem(CUSTOM_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) this.customIntervals = parsed
      }
    } catch {
      // korrupte Daten ignorieren
    }
  }

  saveCustomInterval(slot: number, interval: CustomInterval) {
    const empty: CustomInterval = { name: '', rounds: 1, workDuration: 60_000, restDuration: 0 }
    const list = [...this.customIntervals]
    while (list.length <= slot) list.push({ ...empty })
    list[slot] = interval
    this.customIntervals = list
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(list))
  }

  applyRemote(doc: TimerDoc) {
    this.now = Date.now()
    this.doc = doc
  }
}

export const timer = new TimerStore()

if (typeof window !== 'undefined' && !import.meta.env.TEST) {
  setInterval(() => {
    timer.now = Date.now()
  }, 10)
}
