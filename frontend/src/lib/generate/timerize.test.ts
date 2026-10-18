import { describe, it, expect, vi, afterEach } from 'vitest'
import { planTimer, requestTimer } from './timerize'

describe('planTimer', () => {
  const reset = { isRunning: false, startedAt: null, accumulatedMs: 0 }

  it('AMRAP setzt die Dauer', () => {
    expect(planTimer({ mode: 'amrap', seconds: 1200, label: 'AMRAP 20' })).toEqual({
      config: { ...reset, mode: 'amrap', preset: null, amrapDuration: 1_200_000 },
    })
  })

  it('For Time setzt das Cap (0 = ohne)', () => {
    expect(planTimer({ mode: 'fortime', capSeconds: 900, label: 'Fran' }).config).toMatchObject({ mode: 'fortime', timeCap: 900_000 })
    expect(planTimer({ mode: 'fortime', capSeconds: 0, label: 'Fran' }).config).toMatchObject({ mode: 'fortime', timeCap: 0 })
  })

  it('20/10 × 8 wird zum Tabata-Preset', () => {
    const plan = planTimer({ mode: 'interval', workSeconds: 20, restSeconds: 10, rounds: 8, label: '' })
    expect(plan.config).toMatchObject({ mode: 'interval', preset: 'tabata', workDuration: 20_000, restDuration: 10_000, totalRounds: 8 })
    expect(plan.custom).toBeUndefined()
  })

  it('ohne Rest wird es EMOM inkl. EMOM-Feldern fürs Modal', () => {
    const plan = planTimer({ mode: 'interval', workSeconds: 120, restSeconds: 0, rounds: 6, label: 'E2MOM' })
    expect(plan.config).toMatchObject({
      ...reset,
      preset: 'emom',
      workDuration: 120_000,
      restDuration: 0,
      totalRounds: 6,
      emomInterval: 120_000,
      emomRounds: 6,
    })
  })

  it('sonst Custom-Preset plus zu speicherndes Custom-Programm', () => {
    const plan = planTimer({ mode: 'interval', workSeconds: 40, restSeconds: 20, rounds: 5, label: '' })
    expect(plan.config).toMatchObject({ preset: 'custom', workDuration: 40_000, restDuration: 20_000, totalRounds: 5 })
    expect(plan.custom).toEqual({ rounds: 5, workDuration: 40_000, restDuration: 20_000 })
  })
})

describe('requestTimer', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('liefert den Vorschlag bei Erfolg', async () => {
    const timer = { mode: 'fortime', capSeconds: 0, label: 'For Time' }
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ timer }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await requestTimer('21-15-9')).toEqual(timer)
    expect(fetchMock).toHaveBeenCalledWith('/timerize', expect.objectContaining({ method: 'POST', body: '{"content":"21-15-9","version":2}' }))
  })

  it('wirft die Server-Fehlermeldung bzw. einen Default', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Kein passender Timer erkennbar.' }), { status: 422 })))
    await expect(requestTimer('Yoga')).rejects.toThrow('Kein passender Timer erkennbar.')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 502 })))
    await expect(requestTimer('Yoga')).rejects.toThrow('Timer-Vorschlag fehlgeschlagen.')
  })
})
