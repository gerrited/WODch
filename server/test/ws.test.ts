import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { WebSocket } from 'ws'
import { startServer } from '../src/index.ts'
import type { SessionDoc } from '../src/types.ts'

let server: Awaited<ReturnType<typeof startServer>>
let url: string

function makeDoc(): SessionDoc {
  return {
    timer: {
      mode: 'clock', preset: null, isRunning: false, startedAt: null, accumulatedMs: 0,
      countdownTarget: 180000, countupStart: 0, workDuration: 20000, restDuration: 10000,
      warmupDuration: 10000, warmupEnabled: false, emomInterval: 60000, emomRounds: 10,
      totalRounds: 8, clock12h: false,
    },
    video: { isPlaying: false, startedAt: null, accumulatedSeconds: 0 },
    videoUrl: '',
    workouts: { tabs: [{ id: 't1', title: 'Workout 1', content: '' }], activeTab: 0 },
    updatedAt: Date.now(),
  }
}

function connect(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.once('open', () => resolve(ws))
    ws.once('error', reject)
  })
}

function nextMsg(ws: WebSocket): Promise<any> {
  return new Promise((resolve) => {
    ws.once('message', (data) => resolve(JSON.parse(data.toString())))
  })
}

function send(ws: WebSocket, msg: unknown) {
  ws.send(JSON.stringify(msg))
}

beforeAll(async () => {
  server = await startServer(0)
  url = `ws://127.0.0.1:${server.port}/ws`
})

afterAll(async () => {
  await server.close()
})

describe('sync protocol', () => {
  it('join auf unbekannte Session → missing', async () => {
    const ws = await connect()
    send(ws, { t: 'join', session: 'nosuch' })
    expect(await nextMsg(ws)).toEqual({ t: 'missing' })
    ws.close()
  })

  it('seed erstellt Session; zweiter Client erhält doc bei join', async () => {
    const a = await connect()
    const doc = makeDoc()
    send(a, { t: 'seed', session: 'sess01', doc })
    const b = await connect()
    send(b, { t: 'join', session: 'sess01' })
    const msg = await nextMsg(b)
    expect(msg.t).toBe('doc')
    expect(msg.doc.workouts.tabs[0].title).toBe('Workout 1')
    a.close(); b.close()
  })

  it('patch von A erreicht B, nicht A selbst', async () => {
    const a = await connect()
    send(a, { t: 'seed', session: 'sess02', doc: makeDoc() })
    const b = await connect()
    send(b, { t: 'join', session: 'sess02' })
    await nextMsg(b) // doc

    const received: any[] = []
    a.on('message', (d) => received.push(JSON.parse(d.toString())))
    const bMsg = nextMsg(b)
    send(a, { t: 'patch', path: 'videoUrl', value: 'https://youtu.be/abc' })
    expect(await bMsg).toEqual({ t: 'patch', path: 'videoUrl', value: 'https://youtu.be/abc' })
    await new Promise((r) => setTimeout(r, 50))
    expect(received).toEqual([])
    a.close(); b.close()
  })

  it('patch vor join wird ignoriert, ungültiges JSON schließt die Verbindung nicht', async () => {
    const ws = await connect()
    ws.send('not json{{{')
    send(ws, { t: 'patch', path: 'videoUrl', value: 'x' })
    // Verbindung lebt noch: join funktioniert danach
    send(ws, { t: 'join', session: 'nosuch2' })
    expect(await nextMsg(ws)).toEqual({ t: 'missing' })
    ws.close()
  })

  it('seed auf existierende Session überschreibt nicht, sondern liefert bestehendes doc', async () => {
    const a = await connect()
    send(a, { t: 'seed', session: 'sess03', doc: makeDoc() })
    const b = await connect()
    const other = makeDoc()
    other.videoUrl = 'https://youtu.be/zzz'
    send(b, { t: 'seed', session: 'sess03', doc: other })
    const msg = await nextMsg(b)
    expect(msg.t).toBe('doc')
    expect(msg.doc.videoUrl).toBe('')
    a.close(); b.close()
  })

  it('disconnect entfernt Client aus der Session', async () => {
    const a = await connect()
    send(a, { t: 'seed', session: 'sess04', doc: makeDoc() })
    await new Promise((r) => setTimeout(r, 20))
    expect(server.store.get('sess04')!.clients.size).toBe(1)
    a.close()
    await new Promise((r) => setTimeout(r, 50))
    expect(server.store.get('sess04')!.clients.size).toBe(0)
  })

  it('ping → pong mit t0-Echo und Server-Zeit', async () => {
    const ws = await connect()
    const before = Date.now()
    send(ws, { t: 'ping', t0: 12345 })
    const msg = await nextMsg(ws)
    const after = Date.now()
    expect(msg.t).toBe('pong')
    expect(msg.t0).toBe(12345)
    expect(msg.ts).toBeGreaterThanOrEqual(before)
    expect(msg.ts).toBeLessThanOrEqual(after)
    ws.close()
  })

  it('healthz antwortet 200', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/healthz`)
    expect(res.status).toBe(200)
  })
})

describe('Eingangs-Validierung (Befund 1)', () => {
  it('übersteht die Crash-Sequenz aus dem Security-Review; Doc bleibt intakt', async () => {
    const a = await connect()
    send(a, { t: 'seed', session: 'evil01', doc: makeDoc() })
    // Typ-Verwirrung: workouts auf null setzen, dann verschachtelt patchen
    send(a, { t: 'patch', path: 'workouts', value: null })
    send(a, { t: 'patch', path: 'workouts/activeTab', value: 0 })
    send(a, { t: 'patch', path: 'tab/t1/content', value: 'x' })
    // Nicht-String-path
    send(a, { t: 'patch', path: 123, value: 'x' })
    // Verbindung und Server leben noch
    send(a, { t: 'ping', t0: 1 })
    expect((await nextMsg(a)).t).toBe('pong')
    const res = await fetch(`http://127.0.0.1:${server.port}/healthz`)
    expect(res.status).toBe(200)
    // Ungültige Patches wurden nicht angewendet
    const b = await connect()
    send(b, { t: 'join', session: 'evil01' })
    const msg = await nextMsg(b)
    expect(msg.t).toBe('doc')
    expect(msg.doc.workouts.tabs).toHaveLength(1)
    a.close(); b.close()
  })

  it('verwirft Nachrichten, die nicht dem Protokoll entsprechen', async () => {
    const ws = await connect()
    ws.send('42') // valides JSON, aber kein Objekt
    ws.send('null')
    ws.send('[1,2]')
    send(ws, { t: 'bogus' }) // unbekannter Nachrichtentyp
    send(ws, { t: 'join', session: 123 }) // falscher Feldtyp
    send(ws, { t: 'seed', session: 'x' }) // doc fehlt
    send(ws, { t: 'seed', session: 'x', doc: 'kein objekt' })
    send(ws, { t: 'patch', value: 1 }) // path fehlt
    send(ws, { t: 'ping' }) // t0 fehlt
    send(ws, { t: 'ping', t0: 'jetzt' })
    // Erst die valide Nachricht darf eine Antwort auslösen
    send(ws, { t: 'ping', t0: 7 })
    const msg = await nextMsg(ws)
    expect(msg).toMatchObject({ t: 'pong', t0: 7 })
    ws.close()
  })

  it('ungültiger Patch wird nicht an andere Clients gebroadcastet', async () => {
    const a = await connect()
    send(a, { t: 'seed', session: 'evil02', doc: makeDoc() })
    const b = await connect()
    send(b, { t: 'join', session: 'evil02' })
    await nextMsg(b) // doc

    const received: any[] = []
    b.on('message', (d) => received.push(JSON.parse(d.toString())))
    send(a, { t: 'patch', path: 'timer', value: { kaputt: true } })
    send(a, { t: 'patch', path: 'videoUrl', value: 42 })
    await new Promise((r) => setTimeout(r, 50))
    expect(received).toEqual([])
    a.close(); b.close()
  })
})
