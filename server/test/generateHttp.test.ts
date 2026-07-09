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
    expect(await res.json()).toEqual({ workout: 'WORKOUT für: Beine' })
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
