import { ref } from 'vue'

export function extractVideoId(url: string): string | null {
  if (!url) return null
  const ytWatch = url.match(/youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]+)/)
  if (ytWatch) return ytWatch[1]
  const ytShort = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)
  if (ytShort) return ytShort[1]
  return null
}

// Singleton-Zustand — eine Player-Instanz für die gesamte App
let player: YT.Player | null = null
let currentVideoId: string | null = null
let apiReady = false
let apiLoading = false
const pendingResolvers: (() => void)[] = []
let pendingVideoSync: { position: number; playing: boolean } | null = null

export const playerReady = ref(false)
export const videoLoop = ref(false)  // von VideoPlayer.vue gesetzt, intern für Loop genutzt
let _onStateChange: ((state: number) => void) | null = null
// Timestamp des letzten Remote-Sync — verhindert Echo-Loop über onStateChange
let lastRemoteSyncAt = 0

function loadYTApi(): Promise<void> {
  if (apiReady) return Promise.resolve()
  return new Promise((resolve) => {
    if (apiLoading) { pendingResolvers.push(resolve); return }
    apiLoading = true
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      apiReady = true
      apiLoading = false
      if (prev) prev()
      resolve()
      pendingResolvers.forEach(fn => fn())
      pendingResolvers.length = 0
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  })
}

export function useVideoEmbed() {
  async function initPlayer(el: HTMLElement, videoId: string): Promise<void> {
    await loadYTApi()
    if (player) { player.destroy(); player = null }
    playerReady.value = false
    currentVideoId = videoId
    player = new YT.Player(el, {
      videoId,
      width: '100%',
      height: '100%',
      playerVars: { controls: 1, rel: 0 },
      events: {
        onReady: () => {
          playerReady.value = true
          if (pendingVideoSync) {
            player?.seekTo(pendingVideoSync.position, true)
            if (pendingVideoSync.playing) player?.playVideo()
            else player?.pauseVideo()
            pendingVideoSync = null
          }
        },
        onStateChange: (e) => {
          // Loop intern behandeln — kein externer Callback nötig
          if (e.data === 0 && videoLoop.value && currentVideoId) {
            player?.loadVideoById(currentVideoId)
            return
          }
          // Ignoriere Events für 1s nach einem Remote-Sync
          if (Date.now() - lastRemoteSyncAt < 1000) return
          if (_onStateChange) _onStateChange(e.data)
        },
      },
    })
  }

  function loadVideo(videoId: string) {
    currentVideoId = videoId
    player?.loadVideoById(videoId)
  }

  function play() { player?.playVideo() }
  function pause() { player?.pauseVideo() }
  function seekTo(seconds: number) { player?.seekTo(seconds, true) }
  function getCurrentTime(): number { return player?.getCurrentTime() ?? 0 }

  // Nur von useSession genutzt — ein einziger Subscriber für Firebase-Sync
  function setOnStateChange(fn: (state: number) => void) {
    _onStateChange = fn
  }

  function markRemoteSync() {
    lastRemoteSyncAt = Date.now()
  }

  function setPendingVideoSync(position: number, playing: boolean) {
    pendingVideoSync = { position, playing }
  }

  return { initPlayer, loadVideo, play, pause, seekTo, getCurrentTime, setOnStateChange, markRemoteSync, playerReady, setPendingVideoSync }
}
