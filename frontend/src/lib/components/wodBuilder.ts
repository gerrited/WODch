import type { TimerDoc } from '../types'
import { formatMs } from '../timer/format'

// WOD-Baukasten der Landing Page: Der Besucher stellt sein Workout schon vor dem
// Start ein, die Session startet dann direkt mit diesem Timer statt mit der Uhrzeit.
// Reine Logik ohne Svelte, damit sie isoliert testbar bleibt.

export type WodKind = 'tabata' | 'emom' | 'amrap' | 'fortime' | 'interval'
export type WodField = 'sets' | 'rounds' | 'emomSeconds' | 'minutes' | 'workSeconds' | 'restSeconds'

export interface FieldSpec {
  key: WodField
  label: string
  min: number
  max: number
  step: number
  // 'time' = Sekunden, als m:ss angezeigt; 'count' = ganze Zahl
  unit: 'time' | 'count' | 'minutes'
}

export interface WodSpec {
  kind: WodKind
  label: string
  tagline: string
  fields: FieldSpec[]
}

export type WodValues = Record<WodField, number>

// Tabata bleibt bewusst 8 × 20/10 wie das Preset der App; einstellbar sind nur die Blöcke
export const TABATA = { rounds: 8, work: 20, rest: 10, setRest: 60 }

export const WOD_SPECS: WodSpec[] = [
  {
    kind: 'tabata',
    label: 'Tabata',
    tagline: '8 × 20 s Arbeit / 10 s Pause',
    fields: [{ key: 'sets', label: 'Blöcke', min: 1, max: 10, step: 1, unit: 'count' }],
  },
  {
    kind: 'emom',
    label: 'EMOM',
    tagline: 'Jede Runde startet zur vollen Minute',
    fields: [
      { key: 'emomSeconds', label: 'Takt', min: 15, max: 300, step: 15, unit: 'time' },
      { key: 'rounds', label: 'Runden', min: 1, max: 99, step: 1, unit: 'count' },
    ],
  },
  {
    kind: 'amrap',
    label: 'AMRAP',
    tagline: 'So viele Runden wie möglich',
    fields: [{ key: 'minutes', label: 'Dauer', min: 1, max: 99, step: 1, unit: 'minutes' }],
  },
  {
    kind: 'fortime',
    label: 'For Time',
    tagline: 'Die Uhr läuft, bis du fertig bist',
    fields: [],
  },
  {
    kind: 'interval',
    label: 'Intervall',
    tagline: 'Arbeit und Pause frei wählbar',
    fields: [
      { key: 'rounds', label: 'Runden', min: 1, max: 99, step: 1, unit: 'count' },
      { key: 'workSeconds', label: 'Arbeit', min: 5, max: 600, step: 5, unit: 'time' },
      { key: 'restSeconds', label: 'Pause', min: 0, max: 600, step: 5, unit: 'time' },
    ],
  },
]

// Startwerte je Art — Runden teilen sich EMOM und Intervall nicht, daher getrennte Sätze
export function defaultValues(): Record<WodKind, WodValues> {
  const base: WodValues = { sets: 1, rounds: 10, emomSeconds: 60, minutes: 20, workSeconds: 40, restSeconds: 20 }
  return {
    tabata: { ...base },
    emom: { ...base },
    amrap: { ...base },
    fortime: { ...base },
    interval: { ...base, rounds: 5 },
  }
}

export function specFor(kind: WodKind): WodSpec {
  return WOD_SPECS.find((s) => s.kind === kind) ?? WOD_SPECS[0]
}

export function clampField(field: FieldSpec, value: number): number {
  return Math.min(field.max, Math.max(field.min, value))
}

export function formatField(field: FieldSpec, value: number): string {
  if (field.unit === 'count') return String(value)
  if (field.unit === 'minutes') return `${value} min`
  const m = Math.floor(value / 60)
  const s = value % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// Vollständige Timer-Einstellung, wie TimerModal/applyPreset sie setzen würden.
// Immer gestoppt und zurückgesetzt — gestartet wird erst in der Box.
export function wodTimerConfig(kind: WodKind, v: WodValues): Partial<TimerDoc> {
  const reset = { isRunning: false, startedAt: null, accumulatedMs: 0 }
  const s = 1000
  switch (kind) {
    case 'tabata':
      return {
        ...reset,
        mode: 'interval',
        preset: 'tabata',
        workDuration: TABATA.work * s,
        restDuration: TABATA.rest * s,
        totalRounds: TABATA.rounds,
        sets: v.sets,
        setRest: TABATA.setRest * s,
      }
    case 'emom':
      return {
        ...reset,
        mode: 'interval',
        preset: 'emom',
        emomInterval: v.emomSeconds * s,
        emomRounds: v.rounds,
        workDuration: v.emomSeconds * s,
        restDuration: 0,
        totalRounds: v.rounds,
        sets: 1,
      }
    case 'amrap':
      return { ...reset, mode: 'countdown', preset: null, sets: 1, countdownTarget: v.minutes * 60 * s }
    case 'fortime':
      return { ...reset, mode: 'countup', preset: null, sets: 1, countupStart: 0 }
    case 'interval':
      return {
        ...reset,
        mode: 'interval',
        preset: 'custom',
        workDuration: v.workSeconds * s,
        restDuration: v.restSeconds * s,
        totalRounds: v.rounds,
        sets: 1,
      }
  }
}

export interface Segment {
  kind: 'work' | 'rest'
  ms: number
}

// Ablauf als Segmente für die Zeitleiste — dieselbe Rechnung wie deriveInterval:
// Zwischen Blöcken ersetzt die Blockpause die letzte kurze Pause, der letzte Block
// endet mit seiner kurzen Pause. null = offenes Ende (For Time).
export function wodSegments(kind: WodKind, v: WodValues): Segment[] | null {
  const s = 1000
  if (kind === 'fortime') return null
  if (kind === 'amrap') return [{ kind: 'work', ms: v.minutes * 60 * s }]
  if (kind === 'emom') return Array.from({ length: v.rounds }, () => ({ kind: 'work' as const, ms: v.emomSeconds * s }))

  const rounds = kind === 'tabata' ? TABATA.rounds : v.rounds
  const work = (kind === 'tabata' ? TABATA.work : v.workSeconds) * s
  const rest = (kind === 'tabata' ? TABATA.rest : v.restSeconds) * s
  const sets = kind === 'tabata' ? v.sets : 1
  const out: Segment[] = []
  for (let set = 0; set < sets; set++) {
    const lastSet = set === sets - 1
    for (let r = 0; r < rounds; r++) {
      out.push({ kind: 'work', ms: work })
      const lastRound = r === rounds - 1
      const pause = lastRound && !lastSet ? TABATA.setRest * s : rest
      if (pause > 0) out.push({ kind: 'rest', ms: pause })
    }
  }
  return out
}

export function wodTotalMs(kind: WodKind, v: WodValues): number | null {
  const segs = wodSegments(kind, v)
  return segs ? segs.reduce((sum, seg) => sum + seg.ms, 0) : null
}

// Erste Anzeige auf dem Screen nach dem Start (ohne Warmup)
export function wodFirstClock(kind: WodKind, v: WodValues): string {
  if (kind === 'fortime') return '00:00'
  if (kind === 'amrap') return formatMs(v.minutes * 60_000)
  if (kind === 'emom') return formatMs(v.emomSeconds * 1000)
  if (kind === 'tabata') return formatMs(TABATA.work * 1000)
  return formatMs(v.workSeconds * 1000)
}

// Kurzbeschreibung für CTA und Sticky-Leiste, z. B. „EMOM · 10 × 1:00“
export function wodSummary(kind: WodKind, v: WodValues): string {
  switch (kind) {
    case 'tabata':
      return v.sets > 1 ? `Tabata · ${v.sets} Blöcke` : 'Tabata · 8 Runden'
    case 'emom':
      return `EMOM · ${v.rounds} × ${formatField(specFor('emom').fields[0], v.emomSeconds)}`
    case 'amrap':
      return `AMRAP · ${v.minutes} min`
    case 'fortime':
      return 'For Time · offen'
    case 'interval':
      return `Intervall · ${v.rounds} × ${v.workSeconds}/${v.restSeconds} s`
  }
}
