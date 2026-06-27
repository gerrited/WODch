import { describe, expect, it } from 'vitest'
import { extractVideoId } from '../src/composables/useVideoEmbed'

describe('extractVideoId', () => {
  it('parst youtube.com/watch?v=ID', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('parst youtu.be/ID', () => {
    expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('parst URL mit zusätzlichen Query-Params', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=abc123&t=42s')).toBe('abc123')
  })

  it('gibt null für ungültige URL zurück', () => {
    expect(extractVideoId('https://vimeo.com/12345')).toBeNull()
  })

  it('gibt null für leeren String zurück', () => {
    expect(extractVideoId('')).toBeNull()
  })
})
