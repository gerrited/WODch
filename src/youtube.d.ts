declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void
    YT: typeof YT
  }
  namespace YT {
    const PlayerState: {
      UNSTARTED: -1
      ENDED: 0
      PLAYING: 1
      PAUSED: 2
      BUFFERING: 3
      CUED: 5
    }
    class Player {
      constructor(el: HTMLElement | string, config: PlayerConfig)
      playVideo(): void
      pauseVideo(): void
      seekTo(seconds: number, allowSeekAhead: boolean): void
      getCurrentTime(): number
      getPlayerState(): number
      loadVideoById(videoId: string): void
      destroy(): void
    }
    interface PlayerConfig {
      videoId?: string
      playerVars?: Record<string, string | number>
      events?: {
        onReady?: (e: { target: Player }) => void
        onStateChange?: (e: { data: number }) => void
      }
    }
  }
}
export {}
