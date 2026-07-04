import { describe, it, expect } from 'vitest'
import { barAction } from './barAction'
import { defaultTimerDoc, type TimerDoc } from '../types'
import { deriveInterval } from '../timer/engine'

function doc(overrides: Partial<TimerDoc> = {}): TimerDoc {
  return { ...defaultTimerDoc(), ...overrides }
}

function derivedFor(d: TimerDoc, elapsed: number) {
  return deriveInterval(d, elapsed, d.isRunning || d.accumulatedMs > 0)
}

describe('barAction', () => {
  it('clock: immer modal', () => {
    expect(barAction(doc(), { phase: 'idle' }, 0)).toBe('modal')
  })

  it('stopwatch: modal wenn frisch, toggle wenn läuft oder pausiert', () => {
    expect(barAction(doc({ mode: 'stopwatch' }), { phase: 'idle' }, 0)).toBe('modal')
    expect(barAction(doc({ mode: 'stopwatch', isRunning: true, startedAt: 1 }), { phase: 'idle' }, 500)).toBe('toggle')
    expect(barAction(doc({ mode: 'stopwatch', accumulatedMs: 500 }), { phase: 'idle' }, 500)).toBe('toggle')
  })

  it('interval: modal bei idle und done, toggle während work/rest', () => {
    const idle = doc({ mode: 'interval' })
    expect(barAction(idle, derivedFor(idle, 0), 0)).toBe('modal')
    const running = doc({ mode: 'interval', isRunning: true, startedAt: 0 })
    expect(barAction(running, derivedFor(running, 5000), 5000)).toBe('toggle')
    const done = doc({ mode: 'interval', isRunning: true, startedAt: 0 })
    expect(barAction(done, derivedFor(done, 999_999_999), 999_999_999)).toBe('modal')
  })

  it('countdown: modal wenn abgelaufen', () => {
    const d = doc({ mode: 'countdown', isRunning: true, startedAt: 0, countdownTarget: 60_000 })
    expect(barAction(d, { phase: 'idle' }, 30_000)).toBe('toggle')
    expect(barAction(d, { phase: 'idle' }, 60_000)).toBe('modal')
  })
})
