import type { TimerDoc } from '../types'
import type { Derived } from '../timer/engine'

export type Cue = 'short' | 'long' | null

export interface CueSnapshot {
  isRunning: boolean
  phase: 'countdown' | 'warmup' | 'work' | 'rest' | 'done'
  round: number
  secondsLeft: number
}

// Reduziert den Timer-Zustand auf das, was für Ton-Cues relevant ist.
// null = Modus/Phase ohne Töne (clock, stopwatch, countup, interval-idle).
export function snapshot(doc: TimerDoc, derived: Derived, elapsed: number): CueSnapshot | null {
  if (doc.mode === 'countdown') {
    const secondsLeft = Math.max(0, Math.ceil((doc.countdownTarget - elapsed) / 1000))
    return { isRunning: doc.isRunning, phase: 'countdown', round: 0, secondsLeft }
  }
  if (doc.mode === 'interval') {
    // 'running' kommt im Intervall-Modus nicht vor (deriveInterval liefert es nie)
    if (derived.phase === 'idle' || derived.phase === 'running') return null
    if (derived.phase === 'done') return { isRunning: doc.isRunning, phase: 'done', round: 0, secondsLeft: 0 }
    return {
      isRunning: doc.isRunning,
      phase: derived.phase,
      round: derived.round,
      secondsLeft: Math.ceil(derived.remaining / 1000),
    }
  }
  return null
}

// Vergleicht zwei aufeinanderfolgende Ticks. Cues feuern nur bei natürlichem
// Sekundenwechsel (Differenz genau 1) bzw. Phasenwechsel aus Sekunde 1 heraus —
// Sync-Sprünge (applyRemote, Tab im Hintergrund) erzeugen so keine Töne.
export function detectCue(prev: CueSnapshot | null, next: CueSnapshot | null): Cue {
  if (!prev || !next) return null
  if (!prev.isRunning || !next.isRunning) return null
  if (prev.phase !== next.phase || prev.round !== next.round) {
    return prev.secondsLeft === 1 ? 'long' : null
  }
  if (prev.secondsLeft - next.secondsLeft !== 1) return null
  if (next.secondsLeft === 0) return 'long'
  if (next.secondsLeft <= 3) return 'short'
  return null
}
