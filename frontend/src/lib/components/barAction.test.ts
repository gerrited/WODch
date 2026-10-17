import { describe, it, expect } from 'vitest'
import { barAction } from './barAction'
import { defaultTimerDoc, type TimerDoc } from '../types'
import { derivePhase } from '../timer/engine'

function doc(overrides: Partial<TimerDoc> = {}): TimerDoc {
  return { ...defaultTimerDoc(), ...overrides }
}

function derivedFor(d: TimerDoc, elapsed: number) {
  return derivePhase(d, elapsed, d.isRunning || d.accumulatedMs > 0)
}

describe('barAction', () => {
  it('clock: immer modal', () => {
    expect(barAction(doc(), { phase: 'idle' })).toBe('modal')
  })

  it('stopwatch: modal wenn frisch, toggle wenn läuft oder pausiert', () => {
    const idle = doc({ mode: 'stopwatch' })
    expect(barAction(idle, derivedFor(idle, 0))).toBe('modal')
    const running = doc({ mode: 'stopwatch', isRunning: true, startedAt: 1 })
    expect(barAction(running, derivedFor(running, 500))).toBe('toggle')
    const paused = doc({ mode: 'stopwatch', accumulatedMs: 500 })
    expect(barAction(paused, derivedFor(paused, 500))).toBe('toggle')
  })

  it('interval: modal bei idle und done, toggle während work/rest', () => {
    const idle = doc({ mode: 'interval' })
    expect(barAction(idle, derivedFor(idle, 0))).toBe('modal')
    const running = doc({ mode: 'interval', isRunning: true, startedAt: 0 })
    expect(barAction(running, derivedFor(running, 5000))).toBe('toggle')
    const done = doc({ mode: 'interval', isRunning: true, startedAt: 0 })
    expect(barAction(done, derivedFor(done, 999_999_999))).toBe('modal')
  })

  it('countdown: modal wenn abgelaufen', () => {
    const d = doc({ mode: 'countdown', isRunning: true, startedAt: 0, countdownTarget: 60_000 })
    expect(barAction(d, derivedFor(d, 30_000))).toBe('toggle')
    expect(barAction(d, derivedFor(d, 60_000))).toBe('modal')
  })

  it('countdown mit warmup: erst nach warmup+target modal', () => {
    const d = doc({ mode: 'countdown', isRunning: true, startedAt: 0, countdownTarget: 60_000, warmupEnabled: true, warmupDuration: 10_000 })
    expect(barAction(d, derivedFor(d, 65_000))).toBe('toggle') // noch im Countdown
    expect(barAction(d, derivedFor(d, 70_000))).toBe('modal')  // abgelaufen
  })

  it('amrap und fortime: modal wenn abgelaufen, sonst wie Stoppuhr', () => {
    const amrap = doc({ mode: 'amrap', amrapDuration: 60_000, isRunning: true, startedAt: 0 })
    expect(barAction(amrap, derivedFor(amrap, 30_000))).toBe('toggle')
    expect(barAction(amrap, derivedFor(amrap, 60_000))).toBe('modal')
    const capped = doc({ mode: 'fortime', timeCap: 60_000, isRunning: true, startedAt: 0 })
    expect(barAction(capped, derivedFor(capped, 30_000))).toBe('toggle')
    expect(barAction(capped, derivedFor(capped, 60_000))).toBe('modal')
    const fresh = doc({ mode: 'fortime' })
    expect(barAction(fresh, derivedFor(fresh, 0))).toBe('modal')
  })
})
