import { nanoid } from 'nanoid'
import { createSyncClient, type SyncClient, type SyncStatus } from './client'
import { setClockOffset } from './clock'
import { timer as timerSingleton, type TimerStore } from '../stores/timer.svelte'
import { workouts as workoutsSingleton, type WorkoutStore } from '../stores/workouts.svelte'
import { video as videoSingleton, type VideoStore } from '../stores/video.svelte'
import type { SessionDoc, TimerDoc, VideoDoc, WorkoutsDoc } from '../types'

const DEBOUNCE_MS = 500

// Legacy-Format: alte geteilte Links nutzen #session=<id>
export function extractSessionId(hash: string): string | null {
  const match = hash.match(/[#&]session=([A-Za-z0-9_-]+)/)
  return match ? match[1] : null
}

export function extractSessionIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/([A-Za-z0-9_-]+)\/?$/)
  return match ? match[1] : null
}

export function defaultWsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/ws`
}

interface Stores {
  timer: TimerStore
  workouts: WorkoutStore
  video: VideoStore
}

export class SessionState {
  id = $state<string | null>(null)
  status = $state<SyncStatus>('off')

  private applyingRemote = false
  // Letzter bekannter Video-Sync-Stand — Quelle für buildDoc (Re-Seed)
  private videoDoc: VideoDoc = { isPlaying: false, startedAt: null, accumulatedSeconds: 0 }
  private applyRemoteVideoCb?: (v: VideoDoc) => void
  private debounces = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    private client: SyncClient,
    private stores: Stores,
  ) {
    const { timer, workouts, video } = stores

    client.onStatus((s) => {
      this.status = s
    })

    client.onClockOffset((offset) => setClockOffset(offset))

    client.onDoc((doc) => this.applyDoc(doc))
    client.onPatch((path, value) => this.applyPatch(path, value))

    timer.onDocChange = (doc) => {
      if (this.applyingRemote) return
      this.client.send('timer', { ...doc })
    }
    workouts.onStructure = (w) => {
      if (this.applyingRemote) return
      this.client.send('workouts', w)
    }
    workouts.onActiveTab = (i) => {
      if (this.applyingRemote) return
      this.client.send('workouts/activeTab', i)
    }
    workouts.onTabField = (id, field) => {
      if (this.applyingRemote) return
      const key = `tab/${id}/${field}`
      const existing = this.debounces.get(key)
      if (existing) clearTimeout(existing)
      this.debounces.set(
        key,
        setTimeout(() => {
          this.debounces.delete(key)
          const tab = this.stores.workouts.tabs.find((t) => t.id === id)
          if (tab) this.client.send(key, tab[field])
        }, DEBOUNCE_MS),
      )
    }
    video.onUrlChange = (url) => {
      if (this.applyingRemote) return
      this.videoDoc = { isPlaying: false, startedAt: null, accumulatedSeconds: 0 }
      this.client.send('videoUrl', url)
      this.client.send('video', this.videoDoc)
    }
    video.onLoopChange = (loop) => {
      if (this.applyingRemote) return
      this.client.send('videoLoop', loop)
    }
  }

  private applyDoc(doc: SessionDoc) {
    this.applyingRemote = true
    try {
      this.stores.timer.applyRemote(doc.timer)
      this.stores.workouts.applyRemote(doc.workouts)
      this.stores.video.applyRemoteUrl(doc.videoUrl)
      this.stores.video.applyRemoteLoop(doc.videoLoop)
      this.videoDoc = doc.video
      this.applyRemoteVideoCb?.(doc.video)
    } finally {
      this.applyingRemote = false
    }
  }

  private applyPatch(path: string, value: unknown) {
    this.applyingRemote = true
    try {
      const parts = path.split('/')
      if (path === 'timer') {
        this.stores.timer.applyRemote(value as TimerDoc)
      } else if (path === 'video') {
        this.videoDoc = value as VideoDoc
        this.applyRemoteVideoCb?.(this.videoDoc)
      } else if (path === 'videoUrl') {
        this.stores.video.applyRemoteUrl(value as string)
      } else if (path === 'videoLoop') {
        this.stores.video.applyRemoteLoop(value as boolean)
      } else if (path === 'workouts') {
        this.stores.workouts.applyRemote(value as WorkoutsDoc)
      } else if (path === 'workouts/activeTab') {
        this.stores.workouts.applyRemoteActiveTab(value as number)
      } else if (parts.length === 3 && parts[0] === 'tab') {
        this.stores.workouts.applyRemoteTabField(parts[1], parts[2] as 'content' | 'title', value as string)
      }
    } finally {
      this.applyingRemote = false
    }
  }

  buildDoc(): SessionDoc {
    return {
      timer: { ...this.stores.timer.doc },
      video: { ...this.videoDoc },
      videoUrl: this.stores.video.rawUrl,
      videoLoop: this.stores.video.loop,
      workouts: this.stores.workouts.snapshot(),
      updatedAt: Date.now(),
    }
  }

  async create(): Promise<void> {
    // 16 Zeichen: Session-IDs sind Bearer-Tokens; 6 wären per WS enumerierbar (Befund 3)
    const id = nanoid(16)
    this.joinSession(id)
    history.replaceState(null, '', `/${id}`)
    try {
      await navigator.clipboard.writeText(window.location.href)
    } catch {
      // Clipboard kann in unsicheren Kontexten scheitern
    }
  }

  async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(window.location.href)
    } catch {
      // s.o.
    }
  }

  joinSession(id: string): void {
    this.id = id
    this.client.connect(id, () => this.buildDoc())
  }

  joinFromLocation(): void {
    const pathId = extractSessionIdFromPath(window.location.pathname)
    const id = pathId ?? extractSessionId(window.location.hash)
    if (!id || id === this.id) return
    // Legacy-Hash-Links auf die Pfadform normalisieren, damit kopierte Links einheitlich sind
    if (!pathId) history.replaceState(null, '', `/${id}`)
    this.joinSession(id)
  }

  // Video-Integration (Task 10): Player meldet lokale Play/Pause/Seek-Zustände
  publishVideo(v: VideoDoc): void {
    this.videoDoc = v
    if (this.applyingRemote) return
    this.client.send('video', v)
  }

  registerVideoApply(cb: (v: VideoDoc) => void): void {
    this.applyRemoteVideoCb = cb
  }
}

export const session = new SessionState(createSyncClient(defaultWsUrl()), {
  timer: timerSingleton,
  workouts: workoutsSingleton,
  video: videoSingleton,
})
