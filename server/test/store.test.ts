import { describe, it, expect } from 'vitest'
import { createStore } from '../src/store.ts'
import type { SessionDoc, TimerDoc } from '../src/types.ts'

function makeTimer(overrides: Partial<TimerDoc> = {}): TimerDoc {
  return {
    mode: 'clock',
    preset: null,
    isRunning: false,
    startedAt: null,
    accumulatedMs: 0,
    countdownTarget: 180000,
    countupStart: 0,
    workDuration: 20000,
    restDuration: 10000,
    warmupDuration: 10000,
    warmupEnabled: false,
    emomInterval: 60000,
    emomRounds: 10,
    totalRounds: 8,
    clock12h: false,
    ...overrides,
  }
}

function makeDoc(): SessionDoc {
  return {
    timer: makeTimer(),
    video: { isPlaying: false, startedAt: null, accumulatedSeconds: 0 },
    videoUrl: '',
    videoLoop: false,
    workouts: {
      tabs: [
        { id: 'aaa111', title: 'Workout 1', content: 'Squats' },
        { id: 'bbb222', title: 'Workout 2', content: 'Pullups' },
      ],
      activeTab: 0,
    },
    updatedAt: 1000,
  }
}

describe('create', () => {
  it('legt eine Session an', () => {
    const store = createStore()
    const s = store.create('abc123', makeDoc())
    expect(store.get('abc123')).toBe(s)
    expect(s.doc.videoUrl).toBe('')
  })

  it('ist create-only: existierende Session wird zurückgegeben, nicht überschrieben', () => {
    const store = createStore()
    const first = store.create('abc123', makeDoc())
    const other = makeDoc()
    other.videoUrl = 'https://youtu.be/xyz'
    const second = store.create('abc123', other)
    expect(second).toBe(first)
    expect(second.doc.videoUrl).toBe('')
  })
})

describe('applyPatch', () => {
  it('patcht timer komplett und bumpt updatedAt', () => {
    const store = createStore()
    store.create('s1', makeDoc())
    const newTimer = makeTimer({ mode: 'stopwatch', isRunning: true, startedAt: 5000 })
    expect(store.applyPatch('s1', 'timer', newTimer, 99999)).toBe(true)
    const s = store.get('s1')!
    expect(s.doc.timer.mode).toBe('stopwatch')
    expect(s.doc.updatedAt).toBe(99999)
  })

  it('patcht video, videoUrl und videoLoop', () => {
    const store = createStore()
    store.create('s1', makeDoc())
    expect(store.applyPatch('s1', 'video', { isPlaying: true, startedAt: 7, accumulatedSeconds: 3 }, 2)).toBe(true)
    expect(store.applyPatch('s1', 'videoUrl', 'https://youtu.be/abc', 3)).toBe(true)
    expect(store.applyPatch('s1', 'videoLoop', true, 4)).toBe(true)
    const s = store.get('s1')!
    expect(s.doc.video.isPlaying).toBe(true)
    expect(s.doc.videoUrl).toBe('https://youtu.be/abc')
    expect(s.doc.videoLoop).toBe(true)
    expect(s.doc.updatedAt).toBe(4)
  })

  it('patcht workouts komplett und workouts/activeTab einzeln', () => {
    const store = createStore()
    store.create('s1', makeDoc())
    expect(store.applyPatch('s1', 'workouts', { tabs: [{ id: 'x', title: 'T', content: '' }], activeTab: 0 }, 2)).toBe(true)
    expect(store.get('s1')!.doc.workouts.tabs).toHaveLength(1)
    expect(store.applyPatch('s1', 'workouts/activeTab', 0, 3)).toBe(true)
  })

  it('patcht tab/<id>/content und tab/<id>/title per Tab-id', () => {
    const store = createStore()
    store.create('s1', makeDoc())
    expect(store.applyPatch('s1', 'tab/bbb222/content', '5 Rounds', 2)).toBe(true)
    expect(store.applyPatch('s1', 'tab/aaa111/title', 'WOD A', 3)).toBe(true)
    const tabs = store.get('s1')!.doc.workouts.tabs
    expect(tabs[1].content).toBe('5 Rounds')
    expect(tabs[0].title).toBe('WOD A')
    expect(tabs[0].content).toBe('Squats')
  })

  it('unbekannte Tab-id → false, Doc unverändert', () => {
    const store = createStore()
    store.create('s1', makeDoc())
    const before = JSON.stringify(store.get('s1')!.doc)
    expect(store.applyPatch('s1', 'tab/nope99/content', 'x', 2)).toBe(false)
    expect(JSON.stringify(store.get('s1')!.doc)).toBe(before)
  })

  it('unbekannter Pfad oder unbekannte Session → false', () => {
    const store = createStore()
    store.create('s1', makeDoc())
    expect(store.applyPatch('s1', 'evil/__proto__/x', 1, 2)).toBe(false)
    expect(store.applyPatch('s1', 'updatedAt', 1, 2)).toBe(false)
    expect(store.applyPatch('missing', 'timer', makeTimer(), 2)).toBe(false)
  })
})

describe('sweep', () => {
  const DAY = 86_400_000

  it('löscht Sessions mit updatedAt älter als 24h ohne Clients', () => {
    const store = createStore()
    store.create('old1', makeDoc()) // updatedAt: 1000
    const fresh = store.create('fresh', makeDoc())
    store.applyPatch('fresh', 'videoUrl', '', DAY + 500)
    void fresh
    const removed = store.sweep(DAY + 2000)
    expect(removed).toEqual(['old1'])
    expect(store.get('old1')).toBeUndefined()
    expect(store.get('fresh')).toBeDefined()
  })

  it('verschont stale Sessions mit verbundenen Clients', () => {
    const store = createStore()
    const s = store.create('busy', makeDoc())
    s.clients.add({})
    expect(store.sweep(DAY + 2000)).toEqual([])
    expect(store.get('busy')).toBeDefined()
  })
})
