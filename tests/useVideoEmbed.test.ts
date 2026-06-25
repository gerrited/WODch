import { describe, expect, it } from 'vitest'
import { useVideoEmbed } from '../src/composables/useVideoEmbed'

describe('useVideoEmbed', () => {
  it('converts youtube.com/watch URL', () => {
    const { toEmbedUrl } = useVideoEmbed()
    expect(toEmbedUrl('https://www.youtube.com/watch?v=abc123'))
      .toBe('https://www.youtube.com/embed/abc123')
  })

  it('converts youtu.be URL', () => {
    const { toEmbedUrl } = useVideoEmbed()
    expect(toEmbedUrl('https://youtu.be/abc123'))
      .toBe('https://www.youtube.com/embed/abc123')
  })

  it('converts instagram reel URL', () => {
    const { toEmbedUrl } = useVideoEmbed()
    expect(toEmbedUrl('https://www.instagram.com/reel/abc123/'))
      .toBe('https://www.instagram.com/p/abc123/embed/')
  })

  it('converts instagram post URL', () => {
    const { toEmbedUrl } = useVideoEmbed()
    expect(toEmbedUrl('https://www.instagram.com/p/abc123/'))
      .toBe('https://www.instagram.com/p/abc123/embed/')
  })

  it('returns null for unknown URL', () => {
    const { toEmbedUrl } = useVideoEmbed()
    expect(toEmbedUrl('https://example.com/video')).toBeNull()
  })

  it('returns null for empty string', () => {
    const { toEmbedUrl } = useVideoEmbed()
    expect(toEmbedUrl('')).toBeNull()
  })
})
