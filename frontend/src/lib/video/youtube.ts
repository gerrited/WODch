/// <reference path="./youtube.d.ts" />
import type { VideoDoc } from '../types'
import { syncedNow } from '../sync/clock'

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
const pendingWaiters: { resolve: () => void; reject: (err: Error) => void }[] = []
// Konkurrierende initPlayer-Aufrufe (URL-Eingabe tippt pro Zeichen): nur der
// letzte darf den Player erzeugen, sonst landet er auf einem entfernten Element
let initGeneration = 0
let pendingVideoSync: VideoDoc | null = null
let playerReady = false
let loop = false
// Echo-Schutz: Player-Events kurz nach einem Remote-Sync ignorieren
let lastRemoteSyncAt = 0
const ECHO_WINDOW_MS = 1000
// Nach einem Remote-Play startet die Wiedergabe erst nach dem Puffern (~1s) —
// beim PLAYING-Event wird die inzwischen veraltete Position nachkorrigiert.
let pendingRemoteDoc: VideoDoc | null = null
const DRIFT_TOLERANCE_S = 0.3

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
    startedAt: playing ? syncedNow() : null, // Server-Zeit, s. clock.ts
    accumulatedSeconds: player?.getCurrentTime() ?? 0,
  }
}

export function expectedPosition(v: VideoDoc, now: number): number {
  return v.accumulatedSeconds + (v.isPlaying && v.startedAt !== null ? (now - v.startedAt) / 1000 : 0)
}

export function applyRemoteVideo(v: VideoDoc): void {
  lastRemoteSyncAt = Date.now()
  const position = expectedPosition(v, syncedNow())
  if (player && playerReady) {
    pendingRemoteDoc = v.isPlaying ? { ...v } : null
    player.seekTo(position, true)
    if (v.isPlaying) player.playVideo()
    else player.pauseVideo()
  } else {
    pendingVideoSync = { ...v }
  }
}

export function seekRelative(deltaSeconds: number): void {
  if (!player || !playerReady) return
  pendingRemoteDoc = null
  const target = Math.max(0, player.getCurrentTime() + deltaSeconds)
  player.seekTo(target, true)
  // YT liefert kein Seek-Event — expliziter Sync-Write mit aktuellem Playstate
  const playing = player.getPlayerState() === 1
  onLocalState?.(captureVideoDoc(playing))
}

function loadYTApi(): Promise<void> {
  if (apiReady) return Promise.resolve()
  return new Promise((resolve, reject) => {
    if (apiLoading) {
      pendingWaiters.push({ resolve, reject })
      return
    }
    apiLoading = true
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      apiReady = true
      apiLoading = false
      if (prev) prev()
      resolve()
      pendingWaiters.forEach((w) => w.resolve())
      pendingWaiters.length = 0
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    // Ohne onerror bliebe das Promise bei Netzwerkfehlern für immer offen
    // und apiLoading dauerhaft true — kein Retry mehr möglich
    tag.onerror = () => {
      apiLoading = false
      tag.remove()
      const err = new Error('YouTube IFrame API konnte nicht geladen werden')
      reject(err)
      pendingWaiters.forEach((w) => w.reject(err))
      pendingWaiters.length = 0
    }
    document.head.appendChild(tag)
  })
}

// Liefert false, wenn der Aufruf von einem neueren überholt wurde
export async function initPlayer(el: HTMLElement, videoId: string): Promise<boolean> {
  const generation = ++initGeneration
  await loadYTApi()
  if (generation !== initGeneration) return false
  if (player) {
    try {
      player.destroy()
    } catch {
      // destroy() kann werfen, wenn das Element bereits aus dem DOM entfernt wurde
    }
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
        const PLAYING = 1
        const PAUSED = 2
        const ENDED = 0
        // Verzögerter Wiedergabestart nach Remote-Play: Position nachziehen
        if (e.data === PLAYING && pendingRemoteDoc) {
          const expected = expectedPosition(pendingRemoteDoc, syncedNow())
          if (Math.abs(expected - (player?.getCurrentTime() ?? 0)) > DRIFT_TOLERANCE_S) {
            player?.seekTo(expected, true)
          } else {
            pendingRemoteDoc = null
          }
          return
        }
        if (Date.now() - lastRemoteSyncAt < ECHO_WINDOW_MS) return
        if (e.data === PLAYING) onLocalState?.(captureVideoDoc(true))
        else if (e.data === PAUSED || e.data === ENDED) {
          pendingRemoteDoc = null
          onLocalState?.(captureVideoDoc(false))
        }
      },
    },
  })
  return true
}

export function destroyPlayer(): void {
  player?.destroy()
  player = null
  playerReady = false
  currentVideoId = null
  pendingVideoSync = null
  pendingRemoteDoc = null
}
