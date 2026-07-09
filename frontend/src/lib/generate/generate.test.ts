import { describe, it, expect, vi, afterEach } from 'vitest'
import { requestWorkout, PHRASES, nextPhraseIndex } from './generate'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('requestWorkout', () => {
  it('gibt das Workout bei Erfolg zurück', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ workout: 'FRAN' }), { status: 200 })),
    )
    expect(await requestWorkout('leicht')).toBe('FRAN')
  })

  it('wirft mit der Server-Fehlermeldung bei Fehler-Status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Zu viele Anfragen.' }), { status: 429 })),
    )
    await expect(requestWorkout('x')).rejects.toThrow('Zu viele Anfragen.')
  })
})

describe('nextPhraseIndex', () => {
  it('rotiert zyklisch durch PHRASES', () => {
    expect(nextPhraseIndex(0)).toBe(1)
    expect(nextPhraseIndex(PHRASES.length - 1)).toBe(0)
  })
})
