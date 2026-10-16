import { describe, it, expect } from 'vitest'
import {
  handleTimerize,
  parseTimerSuggestion,
  TIMERIZE_LIMITS,
  type TimerizeDeps,
  type TimerSuggestion,
} from '../src/timerize.ts'
import { createRateLimiter } from '../src/rateLimit.ts'

const EMOM: TimerSuggestion = { mode: 'interval', workSeconds: 60, restSeconds: 0, rounds: 12, label: 'EMOM 12 Min' }

function deps(overrides: Partial<TimerizeDeps> = {}): TimerizeDeps {
  return {
    rateLimiter: createRateLimiter(10, 60000),
    globalBudget: createRateLimiter(10, 60000),
    hasApiKey: () => true,
    suggestTimer: async () => EMOM,
    ...overrides,
  }
}

describe('handleTimerize', () => {
  it('liefert bei Erfolg 200 mit dem Timer-Vorschlag', async () => {
    const res = await handleTimerize({ content: 'EMOM 12: 5 Burpees', ip: '1.1.1.1' }, deps())
    expect(res).toEqual({ status: 200, body: { timer: EMOM } })
  })

  it('reicht den getrimmten Inhalt an suggestTimer weiter', async () => {
    let received = ''
    await handleTimerize(
      { content: '  AMRAP 20  ', ip: '1.1.1.1' },
      deps({ suggestTimer: async (c) => ((received = c), EMOM) }),
    )
    expect(received).toBe('AMRAP 20')
  })

  it('liefert 503 ohne API-Key', async () => {
    const res = await handleTimerize({ content: 'x', ip: '1.1.1.1' }, deps({ hasApiKey: () => false }))
    expect(res.status).toBe(503)
  })

  it('liefert 400 bei leerem, falsch getyptem oder zu langem Inhalt', async () => {
    for (const content of ['   ', 42, undefined, 'x'.repeat(2001)]) {
      const res = await handleTimerize({ content, ip: '1.1.1.1' }, deps())
      expect(res.status).toBe(400)
    }
  })

  it('liefert 422, wenn kein Timer erkennbar ist', async () => {
    const res = await handleTimerize({ content: 'Stretching', ip: '1.1.1.1' }, deps({ suggestTimer: async () => null }))
    expect(res.status).toBe(422)
  })

  it('liefert 500, wenn der Vorschlag fehlschlägt', async () => {
    const d = deps({
      suggestTimer: async () => {
        throw new Error('kaputt')
      },
    })
    expect((await handleTimerize({ content: 'Fran', ip: '1.1.1.1' }, d)).status).toBe(500)
  })

  it('liefert 429 bei überschrittenem pro-IP-Limit und schont dann das globale Budget', async () => {
    const global = createRateLimiter(1, 60000)
    const d = deps({ rateLimiter: createRateLimiter(1, 60000), globalBudget: global })
    expect((await handleTimerize({ content: 'Fran', ip: '9.9.9.9' }, d)).status).toBe(200)
    expect((await handleTimerize({ content: 'Fran', ip: '9.9.9.9' }, d)).status).toBe(429)
    // Globales Budget (1) ist durch den ersten Aufruf verbraucht → auch andere IPs 429
    expect((await handleTimerize({ content: 'Fran', ip: '8.8.8.8' }, d)).status).toBe(429)
  })
})

describe('parseTimerSuggestion', () => {
  it('parst Intervall, Countdown und Count-Up', () => {
    expect(parseTimerSuggestion({ mode: 'interval', workSeconds: 20, restSeconds: 10, rounds: 8, label: 'Tabata' })).toEqual({
      mode: 'interval', workSeconds: 20, restSeconds: 10, rounds: 8, label: 'Tabata',
    })
    expect(parseTimerSuggestion({ mode: 'countdown', seconds: 1200, label: 'AMRAP 20 Min' })).toEqual({
      mode: 'countdown', seconds: 1200, label: 'AMRAP 20 Min',
    })
    expect(parseTimerSuggestion({ mode: 'countup', label: 'For Time' })).toEqual({ mode: 'countup', label: 'For Time' })
  })

  it('liefert null für mode none', () => {
    expect(parseTimerSuggestion({ mode: 'none' })).toBeNull()
  })

  it('rundet Sekunden, kürzt Labels und ersetzt fehlende Labels durch ""', () => {
    const s = parseTimerSuggestion({ mode: 'countdown', seconds: 59.6, label: 'x'.repeat(100) })
    expect(s).toEqual({ mode: 'countdown', seconds: 60, label: 'x'.repeat(TIMERIZE_LIMITS.maxLabelChars) })
    expect(parseTimerSuggestion({ mode: 'countup' })).toEqual({ mode: 'countup', label: '' })
  })

  it('wirft bei Werten außerhalb der Modal-Grenzen oder unbekanntem mode', () => {
    const bad: unknown[] = [
      null,
      [],
      { mode: 'stopwatch' },
      { mode: 'countdown', seconds: 0 },
      { mode: 'countdown', seconds: TIMERIZE_LIMITS.maxSeconds + 1 },
      { mode: 'countdown', seconds: '60' },
      { mode: 'interval', workSeconds: 0, restSeconds: 0, rounds: 5 },
      { mode: 'interval', workSeconds: 60, restSeconds: -1, rounds: 5 },
      { mode: 'interval', workSeconds: 60, restSeconds: 0, rounds: 0 },
      { mode: 'interval', workSeconds: 60, restSeconds: 0, rounds: 100 },
      { mode: 'interval', workSeconds: 60, restSeconds: 0, rounds: 2.5 },
    ]
    for (const raw of bad) expect(() => parseTimerSuggestion(raw)).toThrow()
  })
})
