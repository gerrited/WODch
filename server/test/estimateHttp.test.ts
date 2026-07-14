import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { startServer, type RunningServer } from '../src/index.ts'

let server: RunningServer
let base: string

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key'
  server = await startServer(0, {
    estimateDuration: async () => ({ totalMinutes: 15, segments: [{ label: 'MetCon', minutes: 15 }] }),
  })
  base = `http://127.0.0.1:${server.port}`
})

afterAll(async () => {
  await server.close()
  delete process.env.ANTHROPIC_API_KEY
})

describe('POST /estimate', () => {
  it('gibt eine Schätzung zurück', async () => {
    const res = await fetch(`${base}/estimate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tabs: [{ title: 'MetCon', content: 'Fran' }] }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      estimate: { totalMinutes: 15, segments: [{ label: 'MetCon', minutes: 15 }] },
    })
  })

  it('lehnt fehlerhaftes JSON mit 400 ab', async () => {
    const res = await fetch(`${base}/estimate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    })
    expect(res.status).toBe(400)
  })

  it('lehnt leeres tabs-Array mit 400 ab', async () => {
    const res = await fetch(`${base}/estimate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tabs: [] }),
    })
    expect(res.status).toBe(400)
  })
})
