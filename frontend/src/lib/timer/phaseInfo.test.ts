import { describe, it, expect } from 'vitest'
import { phaseInfo, modeName, PAUSED_LABEL } from './phaseInfo'
import { derivePhase } from './engine'
import { defaultTimerDoc, type TimerDoc } from '../types'

const SEC = 1000
const MIN = 60 * SEC
const NOW = new Date(2026, 0, 1, 12, 0, 30)

function doc(overrides: Partial<TimerDoc> = {}): TimerDoc {
  return { ...defaultTimerDoc(), ...overrides }
}

// Laufender Timer: Phase so ableiten wie der Store es tut
function info(d: TimerDoc, elapsed: number) {
  const started = d.isRunning || d.accumulatedMs > 0
  return phaseInfo(d, derivePhase(d, elapsed, started), elapsed, NOW)
}

const tabata = (o: Partial<TimerDoc> = {}) =>
  doc({ mode: 'interval', preset: 'tabata', workDuration: 20 * SEC, restDuration: 10 * SEC, totalRounds: 8, ...o })

describe('modeName', () => {
  it('benennt Modi und Presets', () => {
    expect(modeName({ mode: 'countdown', preset: null })).toBe('Count-Down')
    expect(modeName({ mode: 'interval', preset: 'fgb1' })).toBe('Fight Gone Bad 1')
    expect(modeName({ mode: 'interval', preset: 'custom' })).toBe('Intervall')
  })
})

describe('phaseInfo', () => {
  it('Tabata in Arbeit: Runde n/N, Lime, Fortschritt der Phase', () => {
    const d = tabata({ isRunning: true, startedAt: 0 })
    const r = info(d, 35 * SEC) // Runde 2, 5 s Arbeit
    expect(r).toEqual({ label: 'Tabata · Runde 2/8', tone: 'work', progress: 0.25 })
  })

  it('Tabata in Pause: Orange', () => {
    const r = info(tabata({ isRunning: true, startedAt: 0 }), 25 * SEC)
    expect(r.label).toBe('Pause · Runde 1/8')
    expect(r.tone).toBe('rest')
    expect(r.progress).toBeCloseTo(0.5)
  })

  it('EMOM im Minutentakt zählt Minuten', () => {
    const d = doc({ mode: 'interval', preset: 'emom', workDuration: MIN, restDuration: 0, totalRounds: 12, isRunning: true, startedAt: 0 })
    expect(info(d, 3 * MIN + 10 * SEC).label).toBe('EMOM · Minute 4')
  })

  it('EMOM mit anderem Takt zählt Runden', () => {
    const d = doc({ mode: 'interval', preset: 'emom', workDuration: 90 * SEC, restDuration: 0, totalRounds: 10, isRunning: true, startedAt: 0 })
    expect(info(d, 0).label).toBe('EMOM · Runde 1/10')
  })

  it('Warmup hat eigenen Ton', () => {
    const d = tabata({ isRunning: true, startedAt: 0, warmupEnabled: true, warmupDuration: 10 * SEC })
    expect(info(d, 4 * SEC)).toMatchObject({ label: 'Warmup', tone: 'warmup' })
  })

  it('angehalten: Pausiert-Label in Orange, Fortschritt bleibt stehen', () => {
    const d = tabata({ isRunning: false, accumulatedMs: 35 * SEC })
    expect(info(d, 35 * SEC)).toEqual({ label: PAUSED_LABEL, tone: 'paused', progress: 0.25 })
  })

  it('idle zeigt Modus und Rundenzahl ohne Fortschritt', () => {
    expect(info(tabata(), 0)).toEqual({ label: 'Tabata · 8 Runden', tone: 'idle', progress: 0 })
    expect(info(doc({ mode: 'countdown' }), 0).label).toBe('Count-Down')
  })

  it('fertig: volle Leiste', () => {
    const d = doc({ mode: 'countdown', countdownTarget: MIN, isRunning: true, startedAt: 0 })
    expect(info(d, 2 * MIN)).toEqual({ label: 'Count-Down · Fertig', tone: 'done', progress: 1 })
  })

  it('Count-Down: Fortschritt über die Gesamtzeit', () => {
    const d = doc({ mode: 'countdown', countdownTarget: 20 * MIN, isRunning: true, startedAt: 0 })
    expect(info(d, 5 * MIN)).toMatchObject({ label: 'Count-Down', tone: 'work', progress: 0.25 })
  })

  it('Stoppuhr/Count-Up: Fortschritt der laufenden Minute', () => {
    expect(info(doc({ mode: 'stopwatch', isRunning: true, startedAt: 0 }), MIN + 15 * SEC).progress).toBe(0.25)
    const up = doc({ mode: 'countup', countupStart: 30 * SEC, isRunning: true, startedAt: 0 })
    expect(info(up, 15 * SEC).progress).toBe(0.75)
  })

  it('Uhrzeit: Fortschritt der aktuellen Minute, nie pausiert', () => {
    expect(info(doc({ mode: 'clock' }), 0)).toEqual({ label: 'Uhrzeit', tone: 'idle', progress: 0.5 })
  })
})
