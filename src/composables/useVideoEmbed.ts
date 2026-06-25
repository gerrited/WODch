export function useVideoEmbed() {
  function toEmbedUrl(url: string): string | null {
    if (!url) return null

    // youtube.com/watch?v=ID
    const ytWatch = url.match(/youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]+)/)
    if (ytWatch) return `https://www.youtube.com/embed/${ytWatch[1]}`

    // youtu.be/ID
    const ytShort = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)
    if (ytShort) return `https://www.youtube.com/embed/${ytShort[1]}`

    // instagram.com/reel/ID/ or instagram.com/p/ID/
    const igPost = url.match(/instagram\.com\/(reel|p)\/([a-zA-Z0-9_-]+)/)
    if (igPost) return `https://www.instagram.com/p/${igPost[2]}/embed/`

    return null
  }

  return { toEmbedUrl }
}
