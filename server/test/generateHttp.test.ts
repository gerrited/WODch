import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { startServer, type RunningServer } from '../src/index.ts'

let server: RunningServer
let base: string

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key'
  server = await startServer(0, {
    generateWorkout: async (prompt) => `WORKOUT für: ${prompt}`,
  })
  base = `http://127.0.0.1:${server.port}`
})

afterAll(async () => {
  await server.close()
  delete process.env.ANTHROPIC_API_KEY
})

describe('POST /generate', () => {
  it('gibt ein generiertes Workout zurück', async () => {
    const res = await fetch(`${base}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'Beine' }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ phases: [{ title: '', content: 'WORKOUT für: Beine' }] })
  })

  it('lehnt fehlerhaftes JSON mit 400 ab', async () => {
    const res = await fetch(`${base}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    })
    expect(res.status).toBe(400)
  })

  it('lehnt zu langen Prompt mit 400 ab', async () => {
    const res = await fetch(`${base}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'a'.repeat(501) }),
    })
    expect(res.status).toBe(400)
  })
})

describe('POST /generate — Rate-Limit-Schlüssel (Befund 2)', () => {
  function postGenerate(xff: string) {
    return fetch(`${base}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': xff },
      body: JSON.stringify({ prompt: 'Beine' }),
    })
  }

  it('zufällige linke XFF-Elemente hebeln das Limit nicht aus', async () => {
    // Rechtestes Element (vom Ingress gesetzt) konstant → ein gemeinsames Bucket
    for (let i = 0; i < 10; i++) {
      expect((await postGenerate(`10.0.0.${i}, 203.0.113.7`)).status).toBe(200)
    }
    expect((await postGenerate('10.9.9.9, 203.0.113.7')).status).toBe(429)
  })

  it('verschiedene rechteste XFF-Elemente teilen sich kein Bucket', async () => {
    for (let i = 0; i < 11; i++) {
      expect((await postGenerate(`198.51.100.99, 203.0.113.${100 + i}`)).status).toBe(200)
    }
  })
})
