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

// Sprachansage zum Tick-Übergang. Gleiche Regel wie detectCue: nur natürliche
// Übergänge (Phasenwechsel aus Sekunde 1 heraus, Sekunde für Sekunde) — Sync-Sprünge
// und der Start aus idle bleiben stumm.
export function announcement(prev: CueSnapshot | null, next: CueSnapshot | null, totalRounds: number): string | null {
  if (!prev || !next) return null
  if (!prev.isRunning || !next.isRunning) return null
  if (prev.phase !== next.phase || prev.round !== next.round) {
    if (prev.secondsLeft !== 1) return null
    if (next.phase === 'work') {
      if (next.round <= 1) return 'Los'
      return next.round === totalRounds ? 'Letzte Runde' : `Runde ${next.round}`
    }
    if (next.phase === 'rest') return 'Pause'
    if (next.phase === 'done') return 'Fertig'
    return null
  }
  if (prev.secondsLeft - next.secondsLeft !== 1) return null
  if (next.phase === 'countdown' && next.secondsLeft === 0) return 'Fertig'
  // Erreicht die Phase 10 s Rest per natürlichem Tick, war sie lang genug für die Ansage
  if ((next.phase === 'work' || next.phase === 'countdown') && next.secondsLeft === 10) return 'Noch zehn Sekunden'
  return null
}
