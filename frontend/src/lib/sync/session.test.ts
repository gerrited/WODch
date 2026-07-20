import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SessionState, extractSessionId, extractSessionIdFromPath } from './session.svelte'
import { TimerStore } from '../stores/timer.svelte'
import { WorkoutStore } from '../stores/workouts.svelte'
import { VideoStore } from '../stores/video.svelte'
import type { SyncClient, SyncStatus } from './client'
import type { SessionDoc } from '../types'

class FakeClient implements SyncClient {
  sent: [string, unknown][] = []
  connected: string | null = null
  localDoc: (() => SessionDoc) | null = null
  private statusCb?: (s: SyncStatus) => void
  private docCb?: (d: SessionDoc) => void
  private patchCb?: (p: string, v: unknown) => void

  status() { return 'connected' as SyncStatus }
  onStatus(cb: (s: SyncStatus) => void) { this.statusCb = cb }
  onDoc(cb: (d: SessionDoc) => void) { this.docCb = cb }
  onPatch(cb: (p: string, v: unknown) => void) { this.patchCb = cb }
  onClockOffset(_cb: (offsetMs: number) => void) {}
  connect(id: string, doc: () => SessionDoc) { this.connected = id; this.localDoc = doc }
  send(path: string, value: unknown) { this.sent.push([path, value]) }
  close() {}

  simStatus(s: SyncStatus) { this.statusCb?.(s) }
  simDoc(d: SessionDoc) { this.docCb?.(d) }
  simPatch(p: string, v: unknown) { this.patchCb?.(p, v) }
}

describe('extractSessionId', () => {
  it('extrahiert die Session-ID aus dem Hash', () => {
    expect(extractSessionId('#session=Xk9mQp')).toBe('Xk9mQp')
    expect(extractSessionId('#foo=1&session=ab_c-1')).toBe('ab_c-1')
  })

  it('null ohne session im Hash', () => {
    expect(extractSessionId('')).toBeNull()
    expect(extractSessionId('#other=x')).toBeNull()
  })
})

describe('extractSessionIdFromPath', () => {
  it('extrahiert die Session-ID aus dem Pfad', () => {
    expect(extractSessionIdFromPath('/Xk9mQp')).toBe('Xk9mQp')
    expect(extractSessionIdFromPath('/ab_c-1/')).toBe('ab_c-1')
  })

  it('null bei Root und verschachtelten Pfaden', () => {
    expect(extractSessionIdFromPath('/')).toBeNull()
    expect(extractSessionIdFromPath('')).toBeNull()
    expect(extractSessionIdFromPath('/assets/app.js')).toBeNull()
  })
})

describe('SessionState', () => {
  let client: FakeClient
  let timer: TimerStore
  let workouts: WorkoutStore
  let video: VideoStore
  let session: SessionState

  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    client = new FakeClient()
    timer = new TimerStore()
    workouts = new WorkoutStore()
    video = new VideoStore()
    session = new SessionState(client, { timer, workouts, video })
  })

  afterEach(() => {
    vi.useRealTimers()
    history.replaceState(null, '', '/')
  })

  it('create verbindet mit nanoid(16), setzt Pfad-URL und liefert komplettes Doc als Seed', async () => {
    await session.create()
    expect(client.connected).toMatch(/^[A-Za-z0-9_-]{16}$/)
    expect(window.location.pathname).toBe(`/${client.connected}`)
    const doc = client.localDoc!()
    expect(doc.timer.mode).toBe('clock')
    expect(doc.workouts.tabs).toHaveLength(1)
    expect(doc.updatedAt).toBeGreaterThan(0)
  })

  it('joinFromLocation joint anhand des Pfads', () => {
    history.replaceState(null, '', '/Xk9mQp')
    session.joinFromLocation()
    expect(client.connected).toBe('Xk9mQp')
    expect(session.id).toBe('Xk9mQp')
  })

  it('joinFromLocation normalisiert Legacy-Hash-Links auf die Pfadform', () => {
    history.replaceState(null, '', '/#session=abc123')
    session.joinFromLocation()
    expect(client.connected).toBe('abc123')
    expect(window.location.pathname).toBe('/abc123')
    expect(window.location.hash).toBe('')
  })

  it('joinFromLocation ohne Session-ID tut nichts', () => {
    session.joinFromLocation()
    expect(client.connected).toBeNull()
    expect(session.id).toBeNull()
  })

  it('Timer-Aktionen senden timer-Patch; applyRemote nicht', () => {
    session.joinSession('abc123')
    timer.setMode('stopwatch')
    expect(client.sent).toContainEqual(['timer', expect.objectContaining({ mode: 'stopwatch' })])
    const count = client.sent.length
    client.simPatch('timer', { ...timer.doc, mode: 'countdown' })
    expect(timer.doc.mode).toBe('countdown')
    expect(client.sent).toHaveLength(count)
  })

  it('Workout-Struktur und activeTab senden sofort', () => {
    session.joinSession('abc123')
    workouts.addTab()
    expect(client.sent.some(([p]) => p === 'workouts')).toBe(true)
    workouts.switchTab(0)
    expect(client.sent).toContainEqual(['workouts/activeTab', 0])
  })

  it('Tab-Content wird pro Tab-Feld 500ms debounced', () => {
    session.joinSession('abc123')
    const id = workouts.tabs[0].id
    workouts.setContent(0, 'a')
    workouts.setContent(0, 'ab')
    workouts.setContent(0, 'abc')
    expect(client.sent.filter(([p]) => p.startsWith('tab/'))).toHaveLength(0)
    vi.advanceTimersByTime(500)
    const tabPatches = client.sent.filter(([p]) => p.startsWith('tab/'))
    expect(tabPatches).toEqual([[`tab/${id}/content`, 'abc']])
  })

  it('URL-Änderung sendet videoUrl + video-Reset', () => {
    session.joinSession('abc123')
    video.setUrl('https://youtu.be/xyz')
    expect(client.sent).toContainEqual(['videoUrl', 'https://youtu.be/xyz'])
    expect(client.sent).toContainEqual(['video', { isPlaying: false, startedAt: null, accumulatedSeconds: 0 }])
  })

  it('Loop-Umschalten sendet videoLoop und fließt in buildDoc ein', () => {
    session.joinSession('abc123')
    video.setLoop(true)
    expect(client.sent).toContainEqual(['videoLoop', true])
    expect(session.buildDoc().videoLoop).toBe(true)
  })

  it('eingehender videoLoop-Patch setzt den Store ohne Echo', () => {
    session.joinSession('abc123')
    const count = client.sent.length
    client.simPatch('videoLoop', true)
    expect(video.loop).toBe(true)
    expect(client.sent).toHaveLength(count)
  })

  it('eingehende Patches werden an die Stores dispatcht', () => {
    session.joinSession('abc123')
    const id = workouts.tabs[0].id
    client.simPatch(`tab/${id}/content`, 'remote')
    expect(workouts.tabs[0].content).toBe('remote')
    client.simPatch('workouts/activeTab', 0)
    client.simPatch('videoUrl', 'https://youtu.be/r')
    expect(video.rawUrl).toBe('https://youtu.be/r')
  })

  it('eingehendes doc überschreibt alles; keine Echo-Patches', () => {
    session.joinSession('abc123')
    const remote = client.localDoc ? client.localDoc() : null
    const doc: SessionDoc = {
      timer: { ...timer.doc, mode: 'interval' },
      video: { isPlaying: false, startedAt: null, accumulatedSeconds: 0 },
      videoUrl: 'https://youtu.be/d',
      videoLoop: true,
      workouts: { tabs: [{ id: 'r1', title: 'R', content: 'c' }], activeTab: 0 },
      updatedAt: 1,
    }
    void remote
    const count = client.sent.length
    client.simDoc(doc)
    expect(timer.doc.mode).toBe('interval')
    expect(workouts.tabs[0].id).toBe('r1')
    expect(video.rawUrl).toBe('https://youtu.be/d')
    expect(video.loop).toBe(true)
    expect(client.sent).toHaveLength(count)
  })

  it('publishVideo sendet video-Patch und fließt in buildDoc ein', () => {
    session.joinSession('abc123')
    session.publishVideo({ isPlaying: true, startedAt: 111, accumulatedSeconds: 7 })
    expect(client.sent).toContainEqual(['video', { isPlaying: true, startedAt: 111, accumulatedSeconds: 7 }])
    expect(session.buildDoc().video.accumulatedSeconds).toBe(7)
  })
})
