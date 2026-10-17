import type { CustomInterval, TimerDoc } from '../types'

// Spiegelt TimerSuggestion aus server/src/timerize.ts (Wire-Format, per Hand gepflegt).
export type TimerSuggestion =
  | { mode: 'interval'; workSeconds: number; restSeconds: number; rounds: number; label: string }
  | { mode: 'amrap'; seconds: number; label: string }
  | { mode: 'fortime'; capSeconds: number; label: string }

// Ohne diese Version liefert der Server das alte Format (countdown/countup)
const TIMERIZE_VERSION = 2

export interface TimerPlan {
  config: Partial<TimerDoc>
  // Gesetzt, wenn das Intervall als Custom-Programm gespeichert werden muss —
  // sonst zeigt das Modal beim Öffnen die alten Custom-Werte statt der übernommenen.
  custom?: CustomInterval
}

// Übersetzt den KI-Vorschlag in eine Timer-Konfiguration. Der Timer wird dabei
// zurückgesetzt, aber nicht gestartet — der Start bleibt eine bewusste Aktion.
export function planTimer(s: TimerSuggestion): TimerPlan {
  const reset = { isRunning: false, startedAt: null, accumulatedMs: 0 }
  if (s.mode === 'amrap') {
    return { config: { ...reset, mode: 'amrap', preset: null, amrapDuration: s.seconds * 1000 } }
  }
  if (s.mode === 'fortime') {
    return { config: { ...reset, mode: 'fortime', preset: null, timeCap: s.capSeconds * 1000 } }
  }
  const workDuration = s.workSeconds * 1000
  const restDuration = s.restSeconds * 1000
  const base = { ...reset, mode: 'interval' as const, workDuration, restDuration, totalRounds: s.rounds }
  if (s.workSeconds === 20 && s.restSeconds === 10 && s.rounds === 8) {
    return { config: { ...base, preset: 'tabata' } }
  }
  if (s.restSeconds === 0) {
    return { config: { ...base, preset: 'emom', emomInterval: workDuration, emomRounds: s.rounds } }
  }
  return {
    config: { ...base, preset: 'custom' },
    custom: { rounds: s.rounds, workDuration, restDuration },
  }
}

export async function requestTimer(content: string): Promise<TimerSuggestion> {
  const res = await fetch('/timerize', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content, version: TIMERIZE_VERSION }),
  })
  let data: { timer?: TimerSuggestion; error?: string } = {}
  try {
    data = await res.json()
  } catch {
    // Body leer/kein JSON — fällt unten auf Default-Fehler zurück
  }
  if (!res.ok || !data.timer) {
    throw new Error(data.error ?? 'Timer-Vorschlag fehlgeschlagen.')
  }
  return data.timer
}
