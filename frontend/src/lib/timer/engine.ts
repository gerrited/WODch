import type { TimerDoc } from '../types'
import { formatMs, formatClock } from './format'

export type IntervalConfig = Pick<
  TimerDoc,
  'warmupEnabled' | 'warmupDuration' | 'workDuration' | 'restDuration' | 'totalRounds'
>

export type Derived =
  | { phase: 'idle' }
  | { phase: 'warmup' | 'work' | 'rest'; round: number; remaining: number }
  | { phase: 'done' }

export function elapsedNow(
  t: Pick<TimerDoc, 'isRunning' | 'startedAt' | 'accumulatedMs'>,
  now: number,
): number {
  return t.accumulatedMs + (t.isRunning && t.startedAt !== null ? now - t.startedAt : 0)
}

// Deterministische Ableitung von Phase/Runde aus der Gesamt-Laufzeit —
// es gibt keine Transition-Writes, jeder Client rechnet identisch.
export function deriveInterval(cfg: IntervalConfig, elapsed: number, started: boolean): Derived {
  if (!started) return { phase: 'idle' }
  const warmup = cfg.warmupEnabled ? cfg.warmupDuration : 0
  if (elapsed < warmup) return { phase: 'warmup', round: 0, remaining: warmup - elapsed }
  const t = elapsed - warmup
  const cycle = cfg.workDuration + cfg.restDuration
  if (cycle <= 0 || cfg.totalRounds <= 0) return { phase: 'done' }
  const idx = Math.floor(t / cycle)
  if (idx >= cfg.totalRounds) return { phase: 'done' }
  const tIn = t - idx * cycle
  if (tIn < cfg.workDuration) return { phase: 'work', round: idx + 1, remaining: cfg.workDuration - tIn }
  return { phase: 'rest', round: idx + 1, remaining: cycle - tIn }
}

function isStarted(doc: TimerDoc): boolean {
  return doc.isRunning || doc.accumulatedMs > 0
}

export function displayTime(doc: TimerDoc, elapsed: number, now: Date): string {
  if (doc.mode === 'clock') return formatClock(now, doc.clock12h)
  if (doc.mode === 'stopwatch') return formatMs(elapsed, true)
  if (doc.mode === 'countdown') return formatMs(doc.countdownTarget - elapsed)
  if (doc.mode === 'countup') return formatMs(doc.countupStart + elapsed)
  // interval
  const d = deriveInterval(doc, elapsed, isStarted(doc))
  if (d.phase === 'idle' || d.phase === 'done') return formatMs(doc.workDuration)
  return formatMs(d.remaining)
}

export function displayRound(doc: TimerDoc, elapsed: number): string | null {
  if (doc.mode !== 'interval') return null
  const d = deriveInterval(doc, elapsed, isStarted(doc))
  if (d.phase !== 'work' && d.phase !== 'rest') return null
  return `${d.round} / ${doc.totalRounds}`
}
