import { describe, it, expect } from 'vitest'
import { elapsedNow, deriveInterval, derivePhase, displayTime, displayRound } from './engine'
import { defaultTimerDoc, type TimerDoc } from '../types'

const SEC = 1000
const MIN = 60 * SEC

function doc(overrides: Partial<TimerDoc> = {}): TimerDoc {
  return { ...defaultTimerDoc(), ...overrides }
}

describe('elapsedNow', () => {
  it('läuft: accumulated + (now - startedAt)', () => {
    expect(elapsedNow({ isRunning: true, startedAt: 1000, accumulatedMs: 500 }, 3500)).toBe(3000)
  })

  it('pausiert: nur accumulated', () => {
    expect(elapsedNow({ isRunning: false, startedAt: null, accumulatedMs: 4200 }, 99999)).toBe(4200)
  })
})

describe('deriveInterval (Tabata: 20s/10s × 8)', () => {
  const cfg = { warmupEnabled: false, warmupDuration: 10 * SEC, workDuration: 20 * SEC, restDuration: 10 * SEC, totalRounds: 8 }

  it('idle wenn nicht gestartet', () => {
    expect(deriveInterval(cfg, 0, false)).toEqual({ phase: 'idle' })
  })

  it('startet in work Runde 1', () => {
    expect(deriveInterval(cfg, 0, true)).toEqual({ phase: 'work', round: 1, remaining: 20 * SEC })
    expect(deriveInterval(cfg, 5 * SEC, true)).toEqual({ phase: 'work', round: 1, remaining: 15 * SEC })
  })

  it('wechselt nach 20s zu rest', () => {
    expect(deriveInterval(cfg, 20 * SEC, true)).toEqual({ phase: 'rest', round: 1, remaining: 10 * SEC })
    expect(deriveInterval(cfg, 29 * SEC, true)).toEqual({ phase: 'rest', round: 1, remaining: 1 * SEC })
  })

  it('nächste Runde nach rest', () => {
    expect(deriveInterval(cfg, 30 * SEC, true)).toEqual({ phase: 'work', round: 2, remaining: 20 * SEC })
  })

  it('done nach 8 Runden (8 × 30s = 240s)', () => {
    expect(deriveInterval(cfg, 239 * SEC, true)).toEqual({ phase: 'rest', round: 8, remaining: 1 * SEC })
    expect(deriveInterval(cfg, 240 * SEC, true)).toEqual({ phase: 'done' })
  })

  it('mit Warmup: warmup zuerst, dann work Runde 1', () => {
    const w = { ...cfg, warmupEnabled: true }
    expect(deriveInterval(w, 3 * SEC, true)).toEqual({ phase: 'warmup', round: 0, remaining: 7 * SEC })
    expect(deriveInterval(w, 10 * SEC, true)).toEqual({ phase: 'work', round: 1, remaining: 20 * SEC })
  })
})

describe('deriveInterval (EMOM: kein Rest)', () => {
  const cfg = { warmupEnabled: false, warmupDuration: 0, workDuration: 1 * MIN, restDuration: 0, totalRounds: 10 }

  it('work → work ohne rest', () => {
    expect(deriveInterval(cfg, 59 * SEC, true)).toEqual({ phase: 'work', round: 1, remaining: 1 * SEC })
    expect(deriveInterval(cfg, 60 * SEC, true)).toEqual({ phase: 'work', round: 2, remaining: 1 * MIN })
  })

  it('done nach 10 Runden', () => {
    expect(deriveInterval(cfg, 10 * MIN, true)).toEqual({ phase: 'done' })
  })
})

describe('deriveInterval Randfälle', () => {
  it('cycle 0 oder totalRounds 0 → done', () => {
    expect(deriveInterval({ warmupEnabled: false, warmupDuration: 0, workDuration: 0, restDuration: 0, totalRounds: 5 }, 0, true)).toEqual({ phase: 'done' })
    expect(deriveInterval({ warmupEnabled: false, warmupDuration: 0, workDuration: 20 * SEC, restDuration: 0, totalRounds: 0 }, 0, true)).toEqual({ phase: 'done' })
  })
})

describe('derivePhase (modus-bewusst)', () => {
  it('idle wenn nicht gestartet', () => {
    expect(derivePhase(doc({ mode: 'stopwatch' }), 0, false)).toEqual({ phase: 'idle' })
  })

  it('stopwatch: running sobald gestartet (nie work/rest)', () => {
    expect(derivePhase(doc({ mode: 'stopwatch' }), 5 * SEC, true)).toEqual({ phase: 'running' })
  })

  it('countup: running sobald gestartet', () => {
    expect(derivePhase(doc({ mode: 'countup' }), 5 * SEC, true)).toEqual({ phase: 'running' })
  })

  it('countdown: running bis target, dann done', () => {
    const d = doc({ mode: 'countdown', countdownTarget: 60 * SEC })
    expect(derivePhase(d, 30 * SEC, true)).toEqual({ phase: 'running' })
    expect(derivePhase(d, 60 * SEC, true)).toEqual({ phase: 'done' })
  })

  it('einfache Modi: warmup zuerst, dann running', () => {
    const d = doc({ mode: 'stopwatch', warmupEnabled: true, warmupDuration: 10 * SEC })
    expect(derivePhase(d, 3 * SEC, true)).toEqual({ phase: 'warmup', round: 0, remaining: 7 * SEC })
    expect(derivePhase(d, 12 * SEC, true)).toEqual({ phase: 'running' })
  })

  it('countdown mit warmup: target läuft erst nach warmup', () => {
    const d = doc({ mode: 'countdown', countdownTarget: 60 * SEC, warmupEnabled: true, warmupDuration: 10 * SEC })
    expect(derivePhase(d, 65 * SEC, true)).toEqual({ phase: 'running' }) // 65-10 = 55 < 60
    expect(derivePhase(d, 70 * SEC, true)).toEqual({ phase: 'done' })    // 70-10 = 60
  })

  it('interval: delegiert an deriveInterval', () => {
    const d = doc({ mode: 'interval', workDuration: 20 * SEC, restDuration: 10 * SEC, totalRounds: 8 })
    expect(derivePhase(d, 5 * SEC, true)).toEqual({ phase: 'work', round: 1, remaining: 15 * SEC })
  })
})

describe('displayTime', () => {
  const noon = new Date(2026, 6, 4, 12, 0, 0)

  it('clock: Systemzeit im gewählten Format', () => {
    expect(displayTime(doc({ mode: 'clock' }), 0, noon)).toBe('12:00:00')
    expect(displayTime(doc({ mode: 'clock', clock12h: true }), 0, noon)).toBe('12:00:00 PM')
  })

  it('stopwatch: centisekunden, zählt hoch', () => {
    expect(displayTime(doc({ mode: 'stopwatch' }), 0, noon)).toBe('00:00.00')
    expect(displayTime(doc({ mode: 'stopwatch' }), 1234, noon)).toBe('00:01.23')
  })

  it('countdown: zählt von target runter, stoppt bei 00:00', () => {
    const d = doc({ mode: 'countdown', countdownTarget: 3 * MIN })
    expect(displayTime(d, 0, noon)).toBe('03:00')
    expect(displayTime(d, 1 * MIN, noon)).toBe('02:00')
    expect(displayTime(d, 4 * MIN, noon)).toBe('00:00')
  })

  it('countup: zählt ab countupStart hoch', () => {
    const d = doc({ mode: 'countup', countupStart: 90 * SEC })
    expect(displayTime(d, 0, noon)).toBe('01:30')
    expect(displayTime(d, 30 * SEC, noon)).toBe('02:00')
  })

  it('interval: Restzeit der aktuellen Phase; idle/done zeigen workDuration', () => {
    const d = doc({ mode: 'interval', isRunning: true, startedAt: 0, workDuration: 20 * SEC, restDuration: 10 * SEC, totalRounds: 8 })
    expect(displayTime(d, 5 * SEC, noon)).toBe('00:15')
    expect(displayTime(d, 25 * SEC, noon)).toBe('00:05') // rest
    const idle = doc({ mode: 'interval', isRunning: false, startedAt: null })
    expect(displayTime(idle, 0, noon)).toBe('00:20')
  })

  it('interval mit warmup: Warmup-Restzeit', () => {
    const d = doc({ mode: 'interval', isRunning: true, startedAt: 0, warmupEnabled: true, warmupDuration: 10 * SEC })
    expect(displayTime(d, 4 * SEC, noon)).toBe('00:06')
  })
})

describe('displayRound', () => {
  it('null außerhalb des Intervall-Modus', () => {
    expect(displayRound(doc({ mode: 'stopwatch' }), 5000)).toBeNull()
  })

  it('null bei idle, warmup und done', () => {
    expect(displayRound(doc({ mode: 'interval', isRunning: false }), 0)).toBeNull()
    const w = doc({ mode: 'interval', isRunning: true, startedAt: 0, warmupEnabled: true })
    expect(displayRound(w, 3000)).toBeNull()
    const d = doc({ mode: 'interval', isRunning: true, startedAt: 0, totalRounds: 1, workDuration: 1000, restDuration: 0 })
    expect(displayRound(d, 5000)).toBeNull()
  })

  it('"runde / total" während work und rest', () => {
    const d = doc({ mode: 'interval', isRunning: true, startedAt: 0, workDuration: 20000, restDuration: 10000, totalRounds: 8 })
    expect(displayRound(d, 5000)).toBe('1 / 8')
    expect(displayRound(d, 35000)).toBe('2 / 8')
  })
})
