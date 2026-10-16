import { describe, it, expect } from 'vitest'
import { snapshot, detectCue, announcement, type CueSnapshot } from './cues'
import { deriveInterval, derivePhase } from '../timer/engine'
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

describe('announcement', () => {
  const s = (phase: CueSnapshot['phase'], round: number, secondsLeft: number, isRunning = true): CueSnapshot => ({
    isRunning,
    phase,
    round,
    secondsLeft,
  })

  it('kündigt Phasenwechsel an: Los, Runde N, Letzte Runde, Pause, Fertig', () => {
    expect(announcement(s('warmup', 0, 1), s('work', 1, 20), 8)).toBe('Los')
    expect(announcement(s('rest', 2, 1), s('work', 3, 20), 8)).toBe('Runde 3')
    expect(announcement(s('rest', 7, 1), s('work', 8, 20), 8)).toBe('Letzte Runde')
    expect(announcement(s('work', 3, 1), s('rest', 3, 10), 8)).toBe('Pause')
    expect(announcement(s('work', 8, 1), s('done', 0, 0), 8)).toBe('Fertig')
    // EMOM: work → work
    expect(announcement(s('work', 1, 1), s('work', 2, 60), 10)).toBe('Runde 2')
  })

  it('kündigt Countdown-Ende und die letzten zehn Sekunden an', () => {
    expect(announcement(s('countdown', 0, 1), s('countdown', 0, 0), 0)).toBe('Fertig')
    expect(announcement(s('countdown', 0, 11), s('countdown', 0, 10), 0)).toBe('Noch zehn Sekunden')
    expect(announcement(s('work', 2, 11), s('work', 2, 10), 8)).toBe('Noch zehn Sekunden')
    // in der Pause keine Zehn-Sekunden-Ansage
    expect(announcement(s('rest', 2, 11), s('rest', 2, 10), 8)).toBeNull()
  })

  it('bleibt stumm bei Sprüngen, Pause und fehlenden Snapshots', () => {
    expect(announcement(null, s('work', 1, 20), 8)).toBeNull()
    expect(announcement(s('work', 1, 20), null, 8)).toBeNull()
    // Sync-Sprung mitten in eine andere Phase
    expect(announcement(s('work', 1, 12), s('rest', 1, 5), 8)).toBeNull()
    // Sprung über die 10er-Marke
    expect(announcement(s('work', 1, 13), s('work', 1, 10), 8)).toBeNull()
    expect(announcement(s('work', 1, 11, false), s('work', 1, 10, false), 8)).toBeNull()
  })
})

describe('Countdown mit Warmup', () => {
  // Warmup 10s, danach Countdown 30s — Cues müssen sich auf die Countdown-Phase beziehen
  const d = doc({ mode: 'countdown', isRunning: true, warmupEnabled: true, countdownTarget: 30 * SEC })
  const s = (e: number) => snapshot(d, derivePhase(d, e, true), e)

  it('keine verfrühten Countdown-Töne/Ansagen um die Warmup-Dauer', () => {
    expect(detectCue(s(26_900), s(27_100))).toBeNull() // ohne Warmup-Abzug: 4 → 3
    expect(detectCue(s(29_900), s(30_100))).toBeNull() // ohne Warmup-Abzug: 1 → 0
    expect(announcement(s(19_900), s(20_100), 8)).toBeNull() // ohne Warmup-Abzug: 'Noch zehn Sekunden'
    expect(announcement(s(29_900), s(30_100), 8)).toBe('Noch zehn Sekunden') // nicht 'Fertig'
  })

  it('Countdown-Cues relativ zum Warmup-Ende', () => {
    expect(detectCue(s(36_900), s(37_100))).toBe('short') // 4 → 3
    expect(detectCue(s(39_900), s(40_100))).toBe('long') // 1 → 0
    expect(announcement(s(39_900), s(40_100), 8)).toBe('Fertig')
  })

  it('Warmup zählt 3, 2, 1 herunter und startet mit langem Ton und "Los"', () => {
    expect(detectCue(s(6_900), s(7_100))).toBe('short') // warmup 4 → 3
    expect(detectCue(s(9_900), s(10_100))).toBe('long') // warmup → countdown
    expect(announcement(s(9_900), s(10_100), 8)).toBe('Los')
  })
})
