import { describe, it, expect } from 'vitest'
import { snapshot, detectCue, type CueSnapshot } from './cues'
import { deriveInterval } from '../timer/engine'
import { defaultTimerDoc, type TimerDoc } from '../types'

const SEC = 1000

function doc(overrides: Partial<TimerDoc> = {}): TimerDoc {
  return { ...defaultTimerDoc(), ...overrides }
}

// Schnappschuss für einen laufenden Countdown bei gegebener elapsed-Zeit
function cdSnap(elapsed: number, running = true): CueSnapshot | null {
  const d = doc({ mode: 'countdown', isRunning: running, countdownTarget: 10 * SEC })
  return snapshot(d, { phase: 'idle' }, elapsed)
}

// Schnappschuss für laufendes Tabata-Interval (20s/10s × 8, ohne Warmup)
function ivSnap(elapsed: number, running = true): CueSnapshot | null {
  const d = doc({ mode: 'interval', isRunning: running, warmupEnabled: false })
  return snapshot(d, deriveInterval(d, elapsed, true), elapsed)
}

describe('snapshot', () => {
  it('countdown: secondsLeft = aufgerundete Restsekunden, geklemmt auf 0', () => {
    expect(cdSnap(6500)).toEqual({ isRunning: true, phase: 'countdown', round: 0, secondsLeft: 4 })
    expect(cdSnap(11 * SEC)!.secondsLeft).toBe(0)
  })

  it('interval: Phase/Runde/Restsekunden aus Derived', () => {
    expect(ivSnap(17 * SEC)).toEqual({ isRunning: true, phase: 'work', round: 1, secondsLeft: 3 })
  })

  it('interval idle sowie clock/stopwatch/countup liefern null', () => {
    const idle = doc({ mode: 'interval' })
    expect(snapshot(idle, { phase: 'idle' }, 0)).toBeNull()
    for (const mode of ['clock', 'stopwatch', 'countup'] as const) {
      expect(snapshot(doc({ mode, isRunning: true }), { phase: 'idle' }, 5 * SEC)).toBeNull()
    }
  })
})

describe('detectCue: Countdown 10s', () => {
  it('kurzer Ton beim Wechsel auf 3, 2, 1', () => {
    expect(detectCue(cdSnap(6900), cdSnap(7100))).toBe('short') // 4 → 3
    expect(detectCue(cdSnap(7900), cdSnap(8100))).toBe('short') // 3 → 2
    expect(detectCue(cdSnap(8900), cdSnap(9100))).toBe('short') // 2 → 1
  })

  it('langer Ton bei 0', () => {
    expect(detectCue(cdSnap(9900), cdSnap(10_100))).toBe('long') // 1 → 0
  })

  it('kein Ton oberhalb von 4s, innerhalb derselben Sekunde oder nach 0', () => {
    expect(detectCue(cdSnap(4900), cdSnap(5100))).toBeNull() // 6 → 5
    expect(detectCue(cdSnap(7100), cdSnap(7200))).toBeNull() // 3 → 3
    expect(detectCue(cdSnap(10_100), cdSnap(10_300))).toBeNull() // 0 → 0
  })

  it('kein Ton wenn pausiert', () => {
    expect(detectCue(cdSnap(7900, false), cdSnap(8100, false))).toBeNull()
    expect(detectCue(cdSnap(7900), cdSnap(8100, false))).toBeNull()
  })

  it('kein Nachpiepen bei Sync-Sprung (>1s)', () => {
    expect(detectCue(cdSnap(2 * SEC), cdSnap(9500))).toBeNull() // 8 → 1
  })
})

describe('detectCue: Interval (Tabata 20s/10s × 8)', () => {
  it('kurze Töne am Ende der work-Phase (3, 2, 1)', () => {
    expect(detectCue(ivSnap(16_900), ivSnap(17_100))).toBe('short') // work 4 → 3
    expect(detectCue(ivSnap(18_900), ivSnap(19_100))).toBe('short') // work 2 → 1
  })

  it('langer Ton beim Phasenwechsel work → rest', () => {
    expect(detectCue(ivSnap(19_900), ivSnap(20_100))).toBe('long')
  })

  it('langer Ton beim Wechsel rest → work (nächste Runde)', () => {
    expect(detectCue(ivSnap(29_900), ivSnap(30_100))).toBe('long')
  })

  it('langer Ton beim Ende der letzten Runde (→ done)', () => {
    expect(detectCue(ivSnap(239_900), ivSnap(240_100))).toBe('long')
  })

  it('langer Ton beim Wechsel warmup → work', () => {
    const d = doc({ mode: 'interval', isRunning: true, warmupEnabled: true }) // Warmup 10s
    const s = (e: number) => snapshot(d, deriveInterval(d, e, true), e)
    expect(detectCue(s(9_900), s(10_100))).toBe('long')
  })

  it('EMOM (rest=0): langer Ton beim Rundenwechsel work → work', () => {
    const d = doc({ mode: 'interval', isRunning: true, workDuration: 60 * SEC, restDuration: 0, totalRounds: 10 })
    const s = (e: number) => snapshot(d, deriveInterval(d, e, true), e)
    expect(detectCue(s(59_900), s(60_100))).toBe('long')
  })

  it('kein Ton bei Phasenwechsel durch Sync-Sprung (nicht aus Sekunde 1)', () => {
    expect(detectCue(ivSnap(5 * SEC), ivSnap(25 * SEC))).toBeNull() // work s15 → rest
  })

  it('kein Ton beim Start (prev = null)', () => {
    expect(detectCue(null, ivSnap(100))).toBeNull()
  })
})
