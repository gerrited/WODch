import { describe, it, expect } from 'vitest'
import { handleGenerate, parsePhases, type GenerateDeps } from '../src/generate.ts'
import { createRateLimiter } from '../src/rateLimit.ts'

function deps(overrides: Partial<GenerateDeps> = {}): GenerateDeps {
  return {
    rateLimiter: createRateLimiter(10, 60000),
    hasApiKey: () => true,
    generateWorkout: async () => 'FÜR ZEIT\n21-15-9\nThruster\nPull-up',
    ...overrides,
  }
}

describe('handleGenerate', () => {
  it('liefert bei Erfolg 200 mit Phasen', async () => {
    const res = await handleGenerate({ prompt: 'kurzes AMRAP', ip: '1.1.1.1' }, deps())
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      phases: [{ title: '', content: 'FÜR ZEIT\n21-15-9\nThruster\nPull-up' }],
    })
  })

  it('splittet mehrere Phasen aus dem Generat', async () => {
    const d = deps({ generateWorkout: async () => '=== Warm-up ===\nRun\n=== Metcon ===\n21-15-9' })
    const res = await handleGenerate({ prompt: 'x', ip: '2.2.2.2' }, d)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      phases: [
        { title: 'Warm-up', content: 'Run' },
        { title: 'Metcon', content: '21-15-9' },
      ],
    })
  })

  it('liefert 503 ohne API-Key', async () => {
    const res = await handleGenerate({ prompt: 'x', ip: '1.1.1.1' }, deps({ hasApiKey: () => false }))
    expect(res.status).toBe(503)
  })

  it('liefert 400 bei leerem Prompt', async () => {
    const res = await handleGenerate({ prompt: '   ', ip: '1.1.1.1' }, deps())
    expect(res.status).toBe(400)
  })

  it('liefert 400 bei Nicht-String-Prompt', async () => {
    const res = await handleGenerate({ prompt: 42, ip: '1.1.1.1' }, deps())
    expect(res.status).toBe(400)
  })

  it('liefert 400 bei zu langem Prompt', async () => {
    const res = await handleGenerate({ prompt: 'a'.repeat(501), ip: '1.1.1.1' }, deps())
    expect(res.status).toBe(400)
  })

  it('liefert 429 wenn das Rate-Limit überschritten ist', async () => {
    const d = deps({ rateLimiter: createRateLimiter(1, 60000) })
    const first = await handleGenerate({ prompt: 'x', ip: '9.9.9.9' }, d)
    const second = await handleGenerate({ prompt: 'x', ip: '9.9.9.9' }, d)
    expect(first.status).toBe(200)
    expect(second.status).toBe(429)
  })

  it('liefert 500 wenn der Anthropic-Call wirft', async () => {
    const d = deps({
      generateWorkout: async () => {
        throw new Error('upstream')
      },
    })
    const res = await handleGenerate({ prompt: 'x', ip: '1.1.1.1' }, d)
    expect(res.status).toBe(500)
  })
})

describe('parsePhases', () => {
  it('ohne Marker: eine Phase mit leerem Titel', () => {
    expect(parsePhases('FÜR ZEIT\n21-15-9')).toEqual([{ title: '', content: 'FÜR ZEIT\n21-15-9' }])
  })

  it('mehrere Marker: je eine Phase mit Titel und Inhalt', () => {
    const raw = '=== Warm-up ===\nRun 400m\n=== Metcon ===\n21-15-9\nThruster'
    expect(parsePhases(raw)).toEqual([
      { title: 'Warm-up', content: 'Run 400m' },
      { title: 'Metcon', content: '21-15-9\nThruster' },
    ])
  })

  it('verwirft Phasen ohne Inhalt', () => {
    const raw = '=== Warm-up ===\n\n=== Metcon ===\n21-15-9'
    expect(parsePhases(raw)).toEqual([{ title: 'Metcon', content: '21-15-9' }])
  })

  it('ignoriert reine Trennlinien ohne Titel', () => {
    expect(parsePhases('======\nFRAN')).toEqual([{ title: '', content: '======\nFRAN' }])
  })

  it('trimmt umgebenden Whitespace der Phase', () => {
    expect(parsePhases('=== A ===\n\n  FRAN  \n\n')).toEqual([{ title: 'A', content: 'FRAN' }])
  })
})
