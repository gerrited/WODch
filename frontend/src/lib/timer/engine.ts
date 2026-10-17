import type { TimerDoc } from '../types'
import { formatMs, formatClock } from './format'

export const DEFAULT_AMRAP_MS = 20 * 60 * 1000

// Felder fehlen in TimerDocs älterer Clients — deshalb nur über diese Helfer lesen
export function amrapMs(doc: Pick<TimerDoc, 'amrapDuration'>): number {
  return Number.isFinite(doc.amrapDuration) ? (doc.amrapDuration as number) : DEFAULT_AMRAP_MS
}

// 0 = For Time ohne Zeitlimit
export function capMs(doc: Pick<TimerDoc, 'timeCap'>): number {
  return Number.isFinite(doc.timeCap) && (doc.timeCap as number) > 0 ? (doc.timeCap as number) : 0
}

// Zielzeit der „Runterzähl"-artigen Modi: Countdown/AMRAP enden dort, For Time
// endet am Cap (ohne Cap: null, läuft unbegrenzt).
export function endMs(doc: TimerDoc): number | null {
  if (doc.mode === 'countdown') return doc.countdownTarget
  if (doc.mode === 'amrap') return amrapMs(doc)
  if (doc.mode === 'fortime') return capMs(doc) || null
  return null
}

export type IntervalConfig = Pick<
  TimerDoc,
  'warmupEnabled' | 'warmupDuration' | 'workDuration' | 'restDuration' | 'totalRounds'
>

export type Derived =
  | { phase: 'idle' }
  | { phase: 'running' }
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
  const idx = Math.floor(t / cycle)
  if (idx >= cfg.totalRounds) return { phase: 'done' }
  const tIn = t - idx * cycle
  if (tIn < cfg.workDuration) return { phase: 'work', round: idx + 1, remaining: cfg.workDuration - tIn }
  return { phase: 'rest', round: idx + 1, remaining: cycle - tIn }
}

// Modus-bewusste Phase: Intervall behält work/rest/done, einfache Modi kennen
// nur warmup → running (Countdown/AMRAP/For Time mit Cap zusätzlich done).
// Uhrzeit hat keine Phasen.
export function derivePhase(doc: TimerDoc, elapsed: number, started: boolean): Derived {
  if (!started) return { phase: 'idle' }
  if (doc.mode === 'interval') return deriveInterval(doc, elapsed, started)
  if (doc.mode === 'clock') return { phase: 'running' }
  const warmup = doc.warmupEnabled ? doc.warmupDuration : 0
  if (elapsed < warmup) return { phase: 'warmup', round: 0, remaining: warmup - elapsed }
  const end = endMs(doc)
  if (end !== null) return elapsed - warmup >= end ? { phase: 'done' } : { phase: 'running' }
  return { phase: 'running' } // stopwatch, countup, For Time ohne Cap
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
  if (doc.mode === 'amrap') return formatMs(amrapMs(doc) - t)
  // For Time zählt hoch und bleibt am Cap stehen
  if (doc.mode === 'fortime') return formatMs(capMs(doc) ? Math.min(t, capMs(doc)) : t)
  return formatMs(doc.countupStart + t) // countup
}

export function displayRound(doc: TimerDoc, elapsed: number): string | null {
  const d = derivePhase(doc, elapsed, isStarted(doc))
  if (d.phase === 'warmup') return 'WARMUP'
  if (doc.mode === 'amrap') return d.phase === 'done' ? 'ZEIT' : 'AMRAP'
  if (doc.mode === 'fortime') {
    if (d.phase === 'done') return 'TIME CAP'
    return capMs(doc) ? `CAP ${formatMs(capMs(doc))}` : 'FOR TIME'
  }
  if (doc.mode !== 'interval') return null
  if (d.phase !== 'work' && d.phase !== 'rest') return null
  return `${d.round} / ${doc.totalRounds}`
}
