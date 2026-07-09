import { describe, it, expect } from 'vitest'
import { handleGenerate, type GenerateDeps } from '../src/generate.ts'
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
  it('liefert bei Erfolg 200 mit dem Workout', async () => {
    const res = await handleGenerate({ prompt: 'kurzes AMRAP', ip: '1.1.1.1' }, deps())
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ workout: 'FÜR ZEIT\n21-15-9\nThruster\nPull-up' })
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
