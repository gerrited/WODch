import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createSyncClient, type SyncClient } from './client'
import { defaultTimerDoc, type SessionDoc } from '../types'

function makeDoc(): SessionDoc {
  return {
    timer: defaultTimerDoc(),
    video: { isPlaying: false, startedAt: null, accumulatedSeconds: 0 },
    videoUrl: '',
    videoLoop: false,
    workouts: { tabs: [{ id: 't1', title: 'Workout 1', content: '' }], activeTab: 0 },
    updatedAt: 42,
  }
}

class MockWS {
  static instances: MockWS[] = []
  readyState = 0 // CONNECTING
  sent: any[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(public url: string) {
    MockWS.instances.push(this)
  }

  send(data: string) {
    this.sent.push(JSON.parse(data))
  }

  close() {
    this.readyState = 3
    this.onclose?.()
  }

  // Test-Helfer
  simOpen() {
    this.readyState = 1
    this.onopen?.()
  }
  simMessage(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) })
  }
  simDrop() {
    this.readyState = 3
    this.onclose?.()
  }
}

describe('SyncClient', () => {
  let client: SyncClient

  beforeEach(() => {
    vi.useFakeTimers()
    MockWS.instances = []
    client = createSyncClient('ws://test/ws', (url) => new MockWS(url) as unknown as WebSocket)
  })

  afterEach(() => {
    client.close()
    vi.useRealTimers()
  })

  it('send vor connect ist no-op', () => {
    client.send('videoUrl', 'x')
    expect(MockWS.instances).toHaveLength(0)
  })

  it('connect → join; doc-Antwort ruft onDoc und setzt status connected', () => {
    const docs: SessionDoc[] = []
    const statuses: string[] = []
    client.onDoc((d) => docs.push(d))
    client.onStatus((s) => statuses.push(s))
    client.connect('abc123', makeDoc)
    const ws = MockWS.instances[0]
    expect(statuses).toEqual(['connecting'])
    ws.simOpen()
    expect(ws.sent).toEqual([{ t: 'join', session: 'abc123' }])
    ws.simMessage({ t: 'doc', doc: makeDoc() })
    expect(docs).toHaveLength(1)
    expect(client.status()).toBe('connected')
  })

  it('missing → seed mit lokalem Doc, status connected', () => {
    client.connect('abc123', makeDoc)
    const ws = MockWS.instances[0]
    ws.simOpen()
    ws.simMessage({ t: 'missing' })
    expect(ws.sent[1]).toMatchObject({ t: 'seed', session: 'abc123' })
    expect(ws.sent[1].doc.updatedAt).toBe(42)
    expect(client.status()).toBe('connected')
  })

  it('eingehende patches rufen onPatch; send schickt patch-Frames', () => {
    const patches: [string, unknown][] = []
    client.onPatch((p, v) => patches.push([p, v]))
    client.connect('abc123', makeDoc)
    const ws = MockWS.instances[0]
    ws.simOpen()
    ws.simMessage({ t: 'doc', doc: makeDoc() })
    ws.simMessage({ t: 'patch', path: 'videoUrl', value: 'https://youtu.be/x' })
    expect(patches).toEqual([['videoUrl', 'https://youtu.be/x']])
    client.send('workouts/activeTab', 1)
    expect(ws.sent[1]).toEqual({ t: 'patch', path: 'workouts/activeTab', value: 1 })
  })

  it('reconnect nach Verbindungsabbruch mit Backoff, erneutes join', () => {
    const statuses: string[] = []
    client.onStatus((s) => statuses.push(s))
    client.connect('abc123', makeDoc)
    const ws = MockWS.instances[0]
    ws.simOpen()
    ws.simMessage({ t: 'doc', doc: makeDoc() })
    ws.simDrop()
    expect(client.status()).toBe('error')
    expect(MockWS.instances).toHaveLength(1)
    vi.advanceTimersByTime(1000)
    expect(MockWS.instances).toHaveLength(2)
    const ws2 = MockWS.instances[1]
    ws2.simOpen()
    expect(ws2.sent).toEqual([{ t: 'join', session: 'abc123' }])
    ws2.simMessage({ t: 'doc', doc: makeDoc() })
    expect(client.status()).toBe('connected')
  })

  it('Backoff wächst 1s → 2s → 5s und cappt bei 10s', () => {
    client.connect('abc123', makeDoc)
    MockWS.instances[0].simDrop()
    vi.advanceTimersByTime(1000)
    expect(MockWS.instances).toHaveLength(2)
    MockWS.instances[1].simDrop()
    vi.advanceTimersByTime(1999)
    expect(MockWS.instances).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(MockWS.instances).toHaveLength(3)
    MockWS.instances[2].simDrop()
    vi.advanceTimersByTime(5000)
    expect(MockWS.instances).toHaveLength(4)
    MockWS.instances[3].simDrop()
    vi.advanceTimersByTime(10_000)
    expect(MockWS.instances).toHaveLength(5)
  })

  it('close beendet ohne Reconnect', () => {
    client.connect('abc123', makeDoc)
    MockWS.instances[0].simOpen()
    client.close()
    vi.advanceTimersByTime(60_000)
    expect(MockWS.instances).toHaveLength(1)
    expect(client.status()).toBe('off')
  })
})
