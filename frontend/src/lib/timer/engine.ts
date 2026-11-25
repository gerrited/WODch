import type { TimerDoc } from '../types'
import { formatMs, formatClock } from './format'

export type IntervalConfig = Pick<
  TimerDoc,
  'warmupEnabled' | 'warmupDuration' | 'workDuration' | 'restDuration' | 'totalRounds' | 'sets' | 'setRest'
>

export type Derived =
  | { phase: 'idle' }
  | { phase: 'running' }
  // set (1-basiert) nur bei mehreren Blöcken; setBreak markiert die Pause zwischen zwei Blöcken
  | { phase: 'warmup' | 'work' | 'rest'; round: number; remaining: number; set?: number; setBreak?: boolean }
  | { phase: 'done' }

export function elapsedNow(
  t: Pick<TimerDoc, 'isRunning' | 'startedAt' | 'accumulatedMs'>,
  now: number,
): number {
  return t.accumulatedMs + (t.isRunning && t.startedAt !== null ? now - t.startedAt : 0)
}

// Deterministische Ableitung von Phase/Runde aus der Gesamt-Laufzeit —
// es gibt keine Transition-Writes, jeder Client rechnet identisch.
export function deriveInterval(
  cfg: IntervalConfig,
  elapsed: number,
  started: boolean,
): Exclude<Derived, { phase: 'running' }> {
  if (!started) return { phase: 'idle' }
  const warmup = cfg.warmupEnabled ? cfg.warmupDuration : 0
  if (elapsed < warmup) return { phase: 'warmup', round: 0, remaining: warmup - elapsed }
  const t = elapsed - warmup
  const cycle = cfg.workDuration + cfg.restDuration
  if (cycle <= 0 || cfg.totalRounds <= 0) return { phase: 'done' }
  const sets = Math.max(1, Math.floor(cfg.sets ?? 1))
  if (sets === 1) return deriveRounds(cfg, t, cycle)

  // Mehrere Blöcke: zwischen zwei Blöcken ersetzt die Blockpause die letzte kurze
  // Pause (ohne Blockpause bleibt die kurze). Der letzte Block endet wie ein einzelner.
  const gap = cfg.setRest && cfg.setRest > 0 ? cfg.setRest : cfg.restDuration
  const block = cfg.totalRounds * cycle - cfg.restDuration
  const span = block + gap
  const setIdx = Math.min(Math.floor(t / span), sets - 1)
  const tSet = t - setIdx * span
  const set = setIdx + 1
  if (setIdx < sets - 1 && tSet >= block) {
    return { phase: 'rest', round: cfg.totalRounds, remaining: span - tSet, set, setBreak: true }
  }
  const d = deriveRounds(cfg, tSet, cycle)
  return d.phase === 'done' ? d : { ...d, set }
}

function deriveRounds(
  cfg: IntervalConfig,
  t: number,
  cycle: number,
): { phase: 'work' | 'rest'; round: number; remaining: number } | { phase: 'done' } {
  const idx = Math.floor(t / cycle)
  if (idx >= cfg.totalRounds) return { phase: 'done' }
  const tIn = t - idx * cycle
  if (tIn < cfg.workDuration) return { phase: 'work', round: idx + 1, remaining: cfg.workDuration - tIn }
  return { phase: 'rest', round: idx + 1, remaining: cycle - tIn }
}

// Modus-bewusste Phase: Intervall behält work/rest/done, einfache Modi kennen
// nur warmup → running (Countdown zusätzlich done). Uhrzeit hat keine Phasen.
export function derivePhase(doc: TimerDoc, elapsed: number, started: boolean): Derived {
  if (!started) return { phase: 'idle' }
  if (doc.mode === 'interval') return deriveInterval(doc, elapsed, started)
  if (doc.mode === 'clock') return { phase: 'running' }
  const warmup = doc.warmupEnabled ? doc.warmupDuration : 0
  if (elapsed < warmup) return { phase: 'warmup', round: 0, remaining: warmup - elapsed }
  if (doc.mode === 'countdown') {
    return elapsed - warmup >= doc.countdownTarget ? { phase: 'done' } : { phase: 'running' }
  }
  return { phase: 'running' } // stopwatch, countup
}

function isStarted(doc: TimerDoc): boolean {
  return doc.isRunning || doc.accumulatedMs > 0
}

export function displayTime(doc: TimerDoc, elapsed: number, now: Date): string {
  if (doc.mode === 'clock') return formatClock(now, doc.clock12h)
  if (doc.mode === 'interval') {
    const d = deriveInterval(doc, elapsed, isStarted(doc))
    if (d.phase === 'idle' || d.phase === 'done') return formatMs(doc.workDuration)
    return formatMs(d.remaining)
  }
  const started = isStarted(doc)
  const warmup = doc.warmupEnabled ? doc.warmupDuration : 0
  if (started && elapsed < warmup) return formatMs(warmup - elapsed)
  const t = started ? elapsed - warmup : elapsed
  if (doc.mode === 'stopwatch') return formatMs(t, true)
  if (doc.mode === 'countdown') return formatMs(doc.countdownTarget - t)
  return formatMs(doc.countupStart + t) // countup
}

export function displayRound(doc: TimerDoc, elapsed: number): string | null {
  const d = derivePhase(doc, elapsed, isStarted(doc))
  if (d.phase === 'warmup') return 'WARMUP'
  if (doc.mode !== 'interval') return null
  if (d.phase !== 'work' && d.phase !== 'rest') return null
  return `${d.round} / ${doc.totalRounds}`
}
