import {
  defaultTimerDoc,
  type CustomInterval,
  type IntervalPreset,
  type TimerDoc,
  type TimerMode,
} from '../types'
import { elapsedNow, derivePhase, displayTime, displayRound, type Derived } from '../timer/engine'
import { clockOffset, syncedNow } from '../sync/clock'

export const CUSTOM_KEY = 'wodch-custom-interval'
export const LEGACY_CUSTOM_KEY = 'wodch-custom-intervals'

export class TimerStore {
  doc = $state<TimerDoc>(defaultTimerDoc())
  now = $state(Date.now())
  customInterval = $state<CustomInterval | null>(null)

  // Vom Session-Layer gesetzt; feuert nach jeder lokalen Aktion (nie bei applyRemote)
  onDocChange?: (doc: TimerDoc) => void

  // startedAt steht in Server-Zeit → lokale Uhr um den gemessenen Versatz korrigieren
  elapsed = $derived(elapsedNow(this.doc, this.now + clockOffset()))
  derived: Derived = $derived(
    derivePhase(this.doc, this.elapsed, this.doc.isRunning || this.doc.accumulatedMs > 0),
  )
  displayTime = $derived(displayTime(this.doc, this.elapsed, new Date(this.now)))
  displayRound = $derived(displayRound(this.doc, this.elapsed))

  constructor() {
    this.loadCustomInterval()
  }

  private commit(changes: Partial<TimerDoc>) {
    this.doc = { ...this.doc, ...changes }
    this.onDocChange?.(this.doc)
  }

  start() {
    if (this.doc.isRunning) return
    this.now = Date.now()
    this.commit({ isRunning: true, startedAt: syncedNow() })
  }

  pause() {
    if (!this.doc.isRunning) return
    this.commit({ isRunning: false, startedAt: null, accumulatedMs: elapsedNow(this.doc, syncedNow()) })
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
    }
    if (preset === 'tabata') {
      this.commit({ ...base, workDuration: 20_000, restDuration: 10_000, totalRounds: 8 })
    } else if (preset === 'fgb1') {
      this.commit({ ...base, workDuration: 300_000, restDuration: 60_000, totalRounds: 5 })
    } else if (preset === 'fgb2') {
      this.commit({ ...base, workDuration: 300_000, restDuration: 60_000, totalRounds: 3 })
    } else if (preset === 'emom') {
      this.commit({ ...base, workDuration: this.doc.emomInterval, restDuration: 0, totalRounds: this.doc.emomRounds })
    } else if (preset === 'custom') {
      const ci = this.customInterval
      if (!ci) return
      this.commit({ ...base, workDuration: ci.workDuration, restDuration: ci.restDuration, totalRounds: ci.rounds })
    }
  }

  loadCustomInterval() {
    localStorage.removeItem(LEGACY_CUSTOM_KEY)
    try {
      const raw = localStorage.getItem(CUSTOM_KEY)
      if (!raw) return
      const p = JSON.parse(raw)
      if (
        typeof p === 'object' && p !== null && !Array.isArray(p) &&
        Number.isFinite(p.rounds) && Number.isFinite(p.workDuration) && Number.isFinite(p.restDuration)
      ) {
        this.customInterval = { rounds: p.rounds, workDuration: p.workDuration, restDuration: p.restDuration }
      }
    } catch {
      // korrupte Daten ignorieren
    }
  }

  saveCustomInterval(interval: CustomInterval) {
    this.customInterval = interval
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(interval))
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
