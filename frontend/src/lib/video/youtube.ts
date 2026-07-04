/// <reference path="./youtube.d.ts" />
import type { VideoDoc } from '../types'

export function extractVideoId(url: string): string | null {
  if (!url) return null
  const ytWatch = url.match(/youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]+)/)
  if (ytWatch) return ytWatch[1]
  const ytShort = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)
  if (ytShort) return ytShort[1]
  return null
}

// Singleton — eine Player-Instanz für die gesamte App
let player: YT.Player | null = null
let currentVideoId: string | null = null
let apiReady = false
let apiLoading = false
const pendingResolvers: (() => void)[] = []
let pendingVideoSync: VideoDoc | null = null
let playerReady = false
let loop = false
// Echo-Schutz: Player-Events kurz nach einem Remote-Sync ignorieren
let lastRemoteSyncAt = 0
const ECHO_WINDOW_MS = 1000

let onLocalState: ((v: VideoDoc) => void) | null = null

export function setLoop(value: boolean) {
  loop = value
}

export function setOnLocalStateChange(cb: (v: VideoDoc) => void) {
  onLocalState = cb
}

export function captureVideoDoc(playing: boolean): VideoDoc {
  return {
    isPlaying: playing,
    startedAt: playing ? Date.now() : null,
    accumulatedSeconds: player?.getCurrentTime() ?? 0,
  }
}

export function applyRemoteVideo(v: VideoDoc): void {
  lastRemoteSyncAt = Date.now()
  const position =
    v.accumulatedSeconds + (v.isPlaying && v.startedAt !== null ? (Date.now() - v.startedAt) / 1000 : 0)
  if (player && playerReady) {
    player.seekTo(position, true)
    if (v.isPlaying) player.playVideo()
    else player.pauseVideo()
  } else {
    pendingVideoSync = { ...v }
  }
}

export function seekRelative(deltaSeconds: number): void {
  if (!player || !playerReady) return
  const target = Math.max(0, player.getCurrentTime() + deltaSeconds)
  player.seekTo(target, true)
  // YT liefert kein Seek-Event — expliziter Sync-Write mit aktuellem Playstate
  const playing = player.getPlayerState() === 1
  onLocalState?.(captureVideoDoc(playing))
}

function loadYTApi(): Promise<void> {
  if (apiReady) return Promise.resolve()
  return new Promise((resolve) => {
    if (apiLoading) {
      pendingResolvers.push(resolve)
      return
    }
    apiLoading = true
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      apiReady = true
      apiLoading = false
      if (prev) prev()
      resolve()
      pendingResolvers.forEach((fn) => fn())
      pendingResolvers.length = 0
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  })
}

export async function initPlayer(el: HTMLElement, videoId: string): Promise<void> {
  await loadYTApi()
  if (player) {
    player.destroy()
    player = null
  }
  playerReady = false
  currentVideoId = videoId
  player = new YT.Player(el, {
    videoId,
    width: '100%',
    height: '100%',
    playerVars: { controls: 1, rel: 0 },
    events: {
      onReady: () => {
        playerReady = true
        if (pendingVideoSync) {
          applyRemoteVideo(pendingVideoSync)
          pendingVideoSync = null
        }
      },
      onStateChange: (e) => {
        // Loop intern behandeln
        if (e.data === 0 && loop && currentVideoId) {
          player?.loadVideoById(currentVideoId)
          return
        }
        if (Date.now() - lastRemoteSyncAt < ECHO_WINDOW_MS) return
        const PLAYING = 1
        const PAUSED = 2
        const ENDED = 0
        if (e.data === PLAYING) onLocalState?.(captureVideoDoc(true))
        else if (e.data === PAUSED || e.data === ENDED) onLocalState?.(captureVideoDoc(false))
      },
    },
  })
}

export function destroyPlayer(): void {
  player?.destroy()
  player = null
  playerReady = false
  currentVideoId = null
  pendingVideoSync = null
}
