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
      if (doc.preset === 'fgb1' || doc.preset === 'fgb2') return 'Fight Gone Bad'
      return 'Intervall'
  }
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0
}

function setCount(doc: TimerDoc): number {
  return Math.max(1, Math.floor(doc.sets ?? 1))
}

// „Block 2/5 · Runde 3/8" bei mehreren Blöcken, sonst „Runde 3/8"
function roundPart(doc: TimerDoc, round: number, set: number | undefined): string {
  const r = `Runde ${round}/${doc.totalRounds}`
  return set !== undefined ? `Block ${set}/${setCount(doc)} · ${r}` : r
}

function roundLabel(doc: TimerDoc, round: number, set: number | undefined): string {
  // EMOM mit 1-Minuten-Takt liest sich als Minute; alles andere als Runde n/N
  if (doc.preset === 'emom' && doc.workDuration === MINUTE) return `EMOM · Minute ${round}`
  return `${modeName(doc)} · ${roundPart(doc, round, set)}`
}

export function phaseInfo(doc: TimerDoc, derived: Derived, elapsed: number, now: Date): PhaseInfo {
  const name = modeName(doc)

  if (doc.mode === 'clock') {
    const ms = now.getSeconds() * 1000 + now.getMilliseconds()
    return { label: name, tone: 'idle', progress: clamp01(ms / MINUTE) }
  }

  const progress = phaseProgress(doc, derived, elapsed)

  if (derived.phase === 'idle') {
    const sets = setCount(doc)
    const rounds = sets > 1 ? `${sets} × ${doc.totalRounds} Runden` : `${doc.totalRounds} Runden`
    const label = doc.mode === 'interval' ? `${name} · ${rounds}` : name
    return { label, tone: 'idle', progress: 0 }
  }
  if (derived.phase === 'done') return { label: `${name} · Fertig`, tone: 'done', progress: 1 }

  // Gestartet, aber angehalten: Pause des Nutzers hat Vorrang vor der Phasenfarbe
  if (!doc.isRunning) return { label: PAUSED_LABEL, tone: 'paused', progress }

  if (derived.phase === 'warmup') return { label: 'Warmup', tone: 'warmup', progress }
  if (derived.phase === 'work') return { label: roundLabel(doc, derived.round, derived.set), tone: 'work', progress }
  if (derived.phase === 'rest' && derived.setBreak && derived.set !== undefined) {
    return { label: `Blockpause · gleich Block ${derived.set + 1}/${setCount(doc)}`, tone: 'rest', progress }
  }
  if (derived.phase === 'rest') {
    return { label: `Pause · ${roundPart(doc, derived.round, derived.set)}`, tone: 'rest', progress }
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
    case 'rest': {
      const gap = derived.setBreak && doc.setRest && doc.setRest > 0 ? doc.setRest : doc.restDuration
      return clamp01(1 - derived.remaining / gap)
    }
    case 'running': {
      const t = elapsed - (doc.warmupEnabled ? doc.warmupDuration : 0)
      if (doc.mode === 'countdown') return clamp01(t / doc.countdownTarget)
      // Stoppuhr/Count-Up haben kein Ende → Fortschritt der laufenden Minute
      const shown = doc.mode === 'countup' ? doc.countupStart + t : t
      return clamp01((shown % MINUTE) / MINUTE)
    }
  }
}
