import { describe, it, expect } from 'vitest'
import {
  handleEstimate,
  parseEstimate,
  buildPrompt,
  stripCodeFences,
  type EstimateDeps,
  type EstimateTab,
} from '../src/estimate.ts'
import { createRateLimiter } from '../src/rateLimit.ts'

const OK_ESTIMATE = { totalMinutes: 18, segments: [{ label: 'Warmup', minutes: 4 }] }

function deps(overrides: Partial<EstimateDeps> = {}): EstimateDeps {
  return {
    rateLimiter: createRateLimiter(10, 60000),
    hasApiKey: () => true,
    estimateDuration: async () => OK_ESTIMATE,
    ...overrides,
  }
}

const tabs: EstimateTab[] = [{ title: 'MetCon', content: '21-15-9 Thruster' }]

describe('handleEstimate', () => {
  it('liefert bei Erfolg 200 mit der Schätzung', async () => {
    const res = await handleEstimate({ tabs, ip: '1.1.1.1' }, deps())
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ estimate: OK_ESTIMATE })
  })

  it('liefert 503 ohne API-Key', async () => {
    const res = await handleEstimate({ tabs, ip: '1.1.1.1' }, deps({ hasApiKey: () => false }))
    expect(res.status).toBe(503)
  })

  it('liefert 400 bei fehlendem tabs-Array', async () => {
    const res = await handleEstimate({ tabs: 'nope', ip: '1.1.1.1' }, deps())
    expect(res.status).toBe(400)
  })

  it('liefert 400 wenn alle Tabs leer sind', async () => {
    const res = await handleEstimate({ tabs: [{ title: 'x', content: '   ' }], ip: '1.1.1.1' }, deps())
    expect(res.status).toBe(400)
  })

  it('liefert 400 bei falsch typisierten Tab-Feldern', async () => {
    const res = await handleEstimate({ tabs: [{ title: 1, content: 'a' }], ip: '1.1.1.1' }, deps())
    expect(res.status).toBe(400)
  })

  it('liefert 400 wenn der kombinierte Inhalt zu lang ist', async () => {
    const big = [{ title: 'a', content: 'x'.repeat(2001) }]
    const res = await handleEstimate({ tabs: big, ip: '1.1.1.1' }, deps())
    expect(res.status).toBe(400)
  })

  it('filtert leere Tabs heraus, bevor estimateDuration aufgerufen wird', async () => {
    let received: EstimateTab[] = []
    const d = deps({
      estimateDuration: async (t) => {
        received = t
        return OK_ESTIMATE
      },
    })
    await handleEstimate(
      { tabs: [{ title: 'leer', content: '  ' }, { title: 'voll', content: 'Fran' }], ip: '1.1.1.1' },
      d,
    )
    expect(received).toEqual([{ title: 'voll', content: 'Fran' }])
  })

  it('liefert 429 wenn das Rate-Limit überschritten ist', async () => {
    const d = deps({ rateLimiter: createRateLimiter(1, 60000) })
    const first = await handleEstimate({ tabs, ip: '9.9.9.9' }, d)
    const second = await handleEstimate({ tabs, ip: '9.9.9.9' }, d)
    expect(first.status).toBe(200)
    expect(second.status).toBe(429)
  })

  it('liefert 500 wenn estimateDuration wirft', async () => {
    const d = deps({
      estimateDuration: async () => {
        throw new Error('upstream')
      },
    })
    const res = await handleEstimate({ tabs, ip: '1.1.1.1' }, d)
    expect(res.status).toBe(500)
  })
})

describe('parseEstimate', () => {
  it('akzeptiert gültiges Schema', () => {
    expect(parseEstimate({ totalMinutes: 12, segments: [{ label: 'Workout', minutes: 12 }] })).toEqual({
      totalMinutes: 12,
      segments: [{ label: 'Workout', minutes: 12 }],
    })
  })

  it('akzeptiert leere segments', () => {
    expect(parseEstimate({ totalMinutes: 5, segments: [] })).toEqual({ totalMinutes: 5, segments: [] })
  })

  it('wirft bei fehlendem totalMinutes', () => {
    expect(() => parseEstimate({ segments: [] })).toThrow()
  })

  it('wirft bei totalMinutes <= 0', () => {
    expect(() => parseEstimate({ totalMinutes: 0, segments: [] })).toThrow()
  })

  it('wirft bei segments ohne label', () => {
    expect(() => parseEstimate({ totalMinutes: 5, segments: [{ minutes: 5 }] })).toThrow()
  })

  it('wirft bei negativen minutes', () => {
    expect(() => parseEstimate({ totalMinutes: 5, segments: [{ label: 'x', minutes: -1 }] })).toThrow()
  })
})

describe('stripCodeFences', () => {
  it('entfernt umschließende ```-Fences', () => {
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })

  it('lässt reines JSON unverändert', () => {
    expect(stripCodeFences('{"a":1}')).toBe('{"a":1}')
  })
})

describe('buildPrompt', () => {
  it('serialisiert Tabs mit Titeln', () => {
    const p = buildPrompt([
      { title: 'Warmup', content: '3 Runden' },
      { title: 'MetCon', content: 'Fran' },
    ])
    expect(p).toContain('Warmup')
    expect(p).toContain('3 Runden')
    expect(p).toContain('MetCon')
    expect(p).toContain('Fran')
  })
})
