import type { TimerDoc } from '../types'
import type { Derived } from './engine'

// Anzeige-Werte für Timer-Leiste und Fernbedienung: Phasen-Label über der Zeit,
// Farbton und Fortschritt der aktuellen Phase. Rein abgeleitet aus Doc + Laufzeit —
// nichts davon wird synchronisiert (AGENTS.md: Timer wird abgeleitet, nicht gestreamt).

// work = Lime, rest/paused = Orange, warmup = gedämpft, idle/done = neutral
export type PhaseTone = 'work' | 'rest' | 'warmup' | 'paused' | 'idle' | 'done'

export interface PhaseInfo {
  label: string
  tone: PhaseTone
  progress: number // 0…1
}

const MINUTE = 60_000

export const PAUSED_LABEL = 'Pausiert — tippen zum Fortsetzen'

export function modeName(doc: Pick<TimerDoc, 'mode' | 'preset'>): string {
  switch (doc.mode) {
    case 'clock':
      return 'Uhrzeit'
    case 'stopwatch':
      return 'Stoppuhr'
    case 'countdown':
      return 'Count-Down'
    case 'countup':
      return 'Count-Up'
    case 'interval':
      if (doc.preset === 'tabata') return 'Tabata'
      if (doc.preset === 'emom') return 'EMOM'
      if (doc.preset === 'fgb1') return 'Fight Gone Bad 1'
      if (doc.preset === 'fgb2') return 'Fight Gone Bad 2'
      return 'Intervall'
  }
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0
}

function roundLabel(doc: TimerDoc, round: number): string {
  // EMOM mit 1-Minuten-Takt liest sich als Minute; alles andere als Runde n/N
  if (doc.preset === 'emom' && doc.workDuration === MINUTE) return `EMOM · Minute ${round}`
  return `${modeName(doc)} · Runde ${round}/${doc.totalRounds}`
}

export function phaseInfo(doc: TimerDoc, derived: Derived, elapsed: number, now: Date): PhaseInfo {
  const name = modeName(doc)

  if (doc.mode === 'clock') {
    const ms = now.getSeconds() * 1000 + now.getMilliseconds()
    return { label: name, tone: 'idle', progress: clamp01(ms / MINUTE) }
  }

  const progress = phaseProgress(doc, derived, elapsed)

  if (derived.phase === 'idle') {
    const label = doc.mode === 'interval' ? `${name} · ${doc.totalRounds} Runden` : name
    return { label, tone: 'idle', progress: 0 }
  }
  if (derived.phase === 'done') return { label: `${name} · Fertig`, tone: 'done', progress: 1 }

  // Gestartet, aber angehalten: Pause des Nutzers hat Vorrang vor der Phasenfarbe
  if (!doc.isRunning) return { label: PAUSED_LABEL, tone: 'paused', progress }

  if (derived.phase === 'warmup') return { label: 'Warmup', tone: 'warmup', progress }
  if (derived.phase === 'work') return { label: roundLabel(doc, derived.round), tone: 'work', progress }
  if (derived.phase === 'rest') {
    return { label: `Pause · Runde ${derived.round}/${doc.totalRounds}`, tone: 'rest', progress }
  }
  return { label: name, tone: 'work', progress }
}

function phaseProgress(doc: TimerDoc, derived: Derived, elapsed: number): number {
  switch (derived.phase) {
    case 'idle':
      return 0
    case 'done':
      return 1
    case 'warmup':
      return clamp01(1 - derived.remaining / doc.warmupDuration)
    case 'work':
      return clamp01(1 - derived.remaining / doc.workDuration)
    case 'rest':
      return clamp01(1 - derived.remaining / doc.restDuration)
    case 'running': {
      const t = elapsed - (doc.warmupEnabled ? doc.warmupDuration : 0)
      if (doc.mode === 'countdown') return clamp01(t / doc.countdownTarget)
      // Stoppuhr/Count-Up haben kein Ende → Fortschritt der laufenden Minute
      const shown = doc.mode === 'countup' ? doc.countupStart + t : t
      return clamp01((shown % MINUTE) / MINUTE)
    }
  }
}
