import { describe, it, expect, vi, afterEach } from 'vitest'
import { estimateDuration } from './estimate'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('estimateDuration', () => {
  it('gibt die Schätzung bei Erfolg zurück', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ estimate: { totalMinutes: 18, segments: [{ label: 'MetCon', minutes: 18 }] } }),
            { status: 200 },
          ),
      ),
    )
    const res = await estimateDuration([{ title: 'MetCon', content: 'Fran' }])
    expect(res).toEqual({ totalMinutes: 18, segments: [{ label: 'MetCon', minutes: 18 }] })
  })

  it('sendet die Tabs im Request-Body', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ estimate: { totalMinutes: 5, segments: [] } }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await estimateDuration([{ title: 'Warmup', content: '3 Runden' }])
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toEqual({ tabs: [{ title: 'Warmup', content: '3 Runden' }] })
  })

  it('wirft mit der Server-Fehlermeldung bei Fehler-Status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Zu viele Anfragen.' }), { status: 429 })),
    )
    await expect(estimateDuration([{ title: 'x', content: 'a' }])).rejects.toThrow('Zu viele Anfragen.')
  })

  it('wirft Default-Fehler bei fehlender estimate', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })))
    await expect(estimateDuration([{ title: 'x', content: 'a' }])).rejects.toThrow('Schätzung fehlgeschlagen.')
  })
})
