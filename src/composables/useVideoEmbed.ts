export function useVideoEmbed() {
  function toEmbedUrl(url: string, loop: boolean): string | null {
    if (!url) return null

    let videoId: string | null = null

    const ytWatch = url.match(/youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]+)/)
    if (ytWatch) videoId = ytWatch[1]

    const ytShort = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)
    if (ytShort) videoId = ytShort[1]

    if (!videoId) return null

    const params = new URLSearchParams({ enablejsapi: '1' })
    if (loop) {
      params.set('loop', '1')
      params.set('playlist', videoId)
    }
    return `https://www.youtube.com/embed/${videoId}?${params}`
  }

  return { toEmbedUrl }
}
