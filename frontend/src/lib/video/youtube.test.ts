import { describe, it, expect } from 'vitest'
import { extractVideoId } from './youtube'

describe('extractVideoId', () => {
  it('parst youtube.com/watch?v=ID', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('parst youtu.be/ID', () => {
    expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('parst URL mit zusätzlichen Query-Params', () => {
    expect(extractVideoId('https://www.youtube.com/watch?list=PL123&v=abc_-123')).toBe('abc_-123')
  })

  it('gibt null für ungültige URL zurück', () => {
    expect(extractVideoId('https://vimeo.com/12345')).toBeNull()
  })

  it('gibt null für leeren String zurück', () => {
    expect(extractVideoId('')).toBeNull()
  })
})
