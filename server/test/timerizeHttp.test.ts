import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { startServer, type RunningServer } from '../src/index.ts'

let server: RunningServer
let base: string

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key'
  server = await startServer(0, {
    suggestTimer: async (content) =>
      content.includes('Yoga') ? null : { mode: 'countdown', seconds: 1200, label: 'AMRAP 20 Min' },
  })
  base = `http://127.0.0.1:${server.port}`
})

afterAll(async () => {
  await server.close()
  delete process.env.ANTHROPIC_API_KEY
})

function post(body: string) {
  return fetch(`${base}/timerize`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
}

describe('POST /timerize', () => {
  it('gibt den Timer-Vorschlag zurück', async () => {
    const res = await post(JSON.stringify({ content: 'AMRAP 20: 5 Pullups, 10 Pushups' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ timer: { mode: 'countdown', seconds: 1200, label: 'AMRAP 20 Min' } })
  })

  it('liefert 422, wenn kein Timer erkennbar ist', async () => {
    const res = await post(JSON.stringify({ content: 'Yoga Flow' }))
    expect(res.status).toBe(422)
  })

  it('liefert 400 bei ungültigem JSON', async () => {
    const res = await post('{nope')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Ungültiges JSON.' })
  })

  it('liefert 400 bei zu großem Body', async () => {
    const res = await post(JSON.stringify({ content: 'x'.repeat(9000) })).catch(() => null)
    // Der Server bricht den Upload ab — je nach Timing 400 oder Verbindungsabbruch
    if (res) expect(res.status).toBe(400)
  })
})
