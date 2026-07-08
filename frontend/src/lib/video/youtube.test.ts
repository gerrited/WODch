import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { extractVideoId } from './youtube'
import type { VideoDoc } from '../types'

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

// --- Drift-Korrektur beim Remote-Sync ---
// Der YT-Player braucht nach seekTo/playVideo ~1s zum Puffern. Die Zielposition
// wird beim Nachrichteneingang berechnet — beim tatsächlichen Wiedergabestart
// stimmt sie nicht mehr. Auf das PLAYING-Event muss nachkorrigiert werden.

class FakePlayer {
  static last: FakePlayer | null = null
  events: { onReady: () => void; onStateChange: (e: { data: number }) => void }
  currentTime = 0
  seekTo = vi.fn((s: number) => {
    this.currentTime = s
  })
  playVideo = vi.fn()
  pauseVideo = vi.fn()
  getCurrentTime = vi.fn(() => this.currentTime)
  getPlayerState = vi.fn(() => 1)
  destroy = vi.fn()
  loadVideoById = vi.fn()

  constructor(_el: unknown, cfg: { events: FakePlayer['events'] }) {
    this.events = cfg.events
    FakePlayer.last = this
    queueMicrotask(() => cfg.events.onReady())
  }
}

async function setupPlayer() {
  vi.resetModules()
  ;(globalThis as any).YT = { Player: FakePlayer }
  const yt = await import('./youtube')
  const el = document.createElement('div')
  const ready = yt.initPlayer(el, 'abc123')
  // loadYTApi wartet auf den API-Ready-Callback
  ;(window as any).onYouTubeIframeAPIReady?.()
  await ready
  await Promise.resolve()
  return { yt, player: FakePlayer.last! }
}

describe('expectedPosition', () => {
  it('gibt bei Pause die accumulatedSeconds zurück', async () => {
    const { expectedPosition } = await import('./youtube')
    const doc: VideoDoc = { isPlaying: false, startedAt: null, accumulatedSeconds: 42 }
    expect(expectedPosition(doc, 1_000_000)).toBe(42)
  })

  it('rechnet bei laufender Wiedergabe die verstrichene Zeit dazu', async () => {
    const { expectedPosition } = await import('./youtube')
    const doc: VideoDoc = { isPlaying: true, startedAt: 1_000_000, accumulatedSeconds: 10 }
    expect(expectedPosition(doc, 1_005_000)).toBe(15)
  })
})

describe('Remote-Sync Drift-Korrektur', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    FakePlayer.last = null
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (globalThis as any).YT
    delete (window as any).onYouTubeIframeAPIReady
  })

  it('korrigiert die Position nach, wenn PLAYING erst verzögert eintritt', async () => {
    const { yt, player } = await setupPlayer()
    const onLocal = vi.fn()
    yt.setOnLocalStateChange(onLocal)

    // Remote: läuft seit 5s ab Position 10 → erwartet 15
    yt.applyRemoteVideo({ isPlaying: true, startedAt: 995_000, accumulatedSeconds: 10 })
    expect(player.seekTo).toHaveBeenCalledWith(15, true)

    // Player puffert 1.2s, startet dann bei der veralteten Position 15
    vi.setSystemTime(1_001_200)
    player.events.onStateChange({ data: 1 }) // PLAYING

    // Erwartet jetzt 16.2 → Nachkorrektur, kein Publish als lokales Event
    expect(player.seekTo).toHaveBeenLastCalledWith(16.2, true)
    expect(onLocal).not.toHaveBeenCalled()
  })

  it('lässt kleine Abweichungen unkorrigiert und publiziert spätere lokale Events wieder', async () => {
    const { yt, player } = await setupPlayer()
    const onLocal = vi.fn()
    yt.setOnLocalStateChange(onLocal)

    yt.applyRemoteVideo({ isPlaying: true, startedAt: 995_000, accumulatedSeconds: 10 })
    const seeks = player.seekTo.mock.calls.length

    // Player startet fast sofort — Drift unter der Toleranz
    vi.setSystemTime(1_000_100)
    player.currentTime = 15.1
    player.events.onStateChange({ data: 1 })
    expect(player.seekTo.mock.calls.length).toBe(seeks)

    // Deutlich später pausiert der Nutzer lokal → wird wieder publiziert
    vi.setSystemTime(1_010_000)
    player.events.onStateChange({ data: 2 })
    expect(onLocal).toHaveBeenCalledTimes(1)
    expect(onLocal.mock.calls[0][0].isPlaying).toBe(false)
  })
})
