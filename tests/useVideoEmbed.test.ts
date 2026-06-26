import { describe, expect, it } from 'vitest'
import { useVideoEmbed } from '../src/composables/useVideoEmbed'

describe('useVideoEmbed', () => {
  it('converts youtube.com/watch URL', () => {
    const { toEmbedUrl } = useVideoEmbed()
    expect(toEmbedUrl('https://www.youtube.com/watch?v=abc123', false))
      .toBe('https://www.youtube.com/embed/abc123?enablejsapi=1')
  })

  it('converts youtu.be URL', () => {
    const { toEmbedUrl } = useVideoEmbed()
    expect(toEmbedUrl('https://youtu.be/abc123', false))
      .toBe('https://www.youtube.com/embed/abc123?enablejsapi=1')
  })

  it('adds loop params when loop is enabled', () => {
    const { toEmbedUrl } = useVideoEmbed()
    expect(toEmbedUrl('https://youtu.be/abc123', true))
      .toBe('https://www.youtube.com/embed/abc123?enablejsapi=1&loop=1&playlist=abc123')
  })

  it('returns null for instagram reel URL', () => {
    const { toEmbedUrl } = useVideoEmbed()
    expect(toEmbedUrl('https://www.instagram.com/reel/abc123/', false)).toBeNull()
  })

  it('returns null for instagram post URL', () => {
    const { toEmbedUrl } = useVideoEmbed()
    expect(toEmbedUrl('https://www.instagram.com/p/abc123/', false)).toBeNull()
  })

  it('returns null for unknown URL', () => {
    const { toEmbedUrl } = useVideoEmbed()
    expect(toEmbedUrl('https://example.com/video', false)).toBeNull()
  })

  it('returns null for empty string', () => {
    const { toEmbedUrl } = useVideoEmbed()
    expect(toEmbedUrl('', false)).toBeNull()
  })
})
