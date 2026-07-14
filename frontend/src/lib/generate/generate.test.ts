import { describe, it, expect, vi, afterEach } from 'vitest'
import { requestWorkout, formatWorkout, PHRASES, nextPhraseIndex } from './generate'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('requestWorkout', () => {
  it('gibt formatierte Phasen bei Erfolg zurück', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ phases: [{ title: '', content: 'FRAN' }] }), { status: 200 }),
      ),
    )
    expect(await requestWorkout('leicht')).toEqual([{ title: '', content: '\n\nFRAN\n\n' }])
  })

  it('gibt mehrere formatierte Phasen zurück', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              phases: [
                { title: 'Warm-up', content: 'Run' },
                { title: 'Metcon', content: '21-15-9' },
              ],
            }),
            { status: 200 },
          ),
      ),
    )
    expect(await requestWorkout('x')).toEqual([
      { title: 'Warm-up', content: '\n\nRun\n\n' },
      { title: 'Metcon', content: '\n\n21-15-9\n\n' },
    ])
  })

  it('wirft mit der Server-Fehlermeldung bei Fehler-Status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Zu viele Anfragen.' }), { status: 429 })),
    )
    await expect(requestWorkout('x')).rejects.toThrow('Zu viele Anfragen.')
  })

  it('wirft bei leerem Phasen-Array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ phases: [] }), { status: 200 })),
    )
    await expect(requestWorkout('x')).rejects.toThrow('Generierung fehlgeschlagen.')
  })
})

describe('formatWorkout', () => {
  it('rahmt den Text mit je zwei Leerzeilen', () => {
    expect(formatWorkout('FRAN')).toBe('\n\nFRAN\n\n')
  })

  it('entfernt umschließende ```-Code-Fences', () => {
    expect(formatWorkout('```\nFRAN\n21-15-9\n```')).toBe('\n\nFRAN\n21-15-9\n\n')
  })

  it('entfernt Code-Fences mit Sprach-Angabe', () => {
    expect(formatWorkout('```text\nFRAN\n```')).toBe('\n\nFRAN\n\n')
  })
})

describe('nextPhraseIndex', () => {
  it('rotiert zyklisch durch PHRASES', () => {
    expect(nextPhraseIndex(0)).toBe(1)
    expect(nextPhraseIndex(PHRASES.length - 1)).toBe(0)
  })
})
