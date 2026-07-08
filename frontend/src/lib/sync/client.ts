import type { SessionDoc } from '../types'

export type SyncStatus = 'off' | 'connecting' | 'connected' | 'error'

export interface SyncClient {
  status(): SyncStatus
  onStatus(cb: (s: SyncStatus) => void): void
  onDoc(cb: (doc: SessionDoc) => void): void
  onPatch(cb: (path: string, value: unknown) => void): void
  onClockOffset(cb: (offsetMs: number) => void): void
  connect(sessionId: string, localDoc: () => SessionDoc): void
  send(path: string, value: unknown): void
  close(): void
}

const BACKOFF_MS = [1000, 2000, 5000, 10_000]

export function createSyncClient(
  wsUrl: string,
  wsFactory: (url: string) => WebSocket = (url) => new WebSocket(url),
): SyncClient {
  let ws: WebSocket | null = null
  let sessionId: string | null = null
  let localDoc: (() => SessionDoc) | null = null
  let status: SyncStatus = 'off'
  let retries = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let closed = false

  let statusCb: ((s: SyncStatus) => void) | null = null
  let docCb: ((doc: SessionDoc) => void) | null = null
  let patchCb: ((path: string, value: unknown) => void) | null = null
  let clockOffsetCb: ((offsetMs: number) => void) | null = null

  function setStatus(s: SyncStatus) {
    status = s
    statusCb?.(s)
  }

  function scheduleReconnect() {
    if (closed || reconnectTimer) return
    const delay = BACKOFF_MS[Math.min(retries, BACKOFF_MS.length - 1)]
    retries++
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      open()
    }, delay)
  }

  function open() {
    if (closed || !sessionId) return
    setStatus('connecting')
    ws = wsFactory(wsUrl)
    ws.onopen = () => {
      ws?.send(JSON.stringify({ t: 'join', session: sessionId }))
      // Uhr-Versatz zur Server-Uhr messen (NTP-artig, eine Messung pro Verbindung)
      ws?.send(JSON.stringify({ t: 'ping', t0: Date.now() }))
    }
    ws.onmessage = (e) => {
      let msg: any
      try {
        msg = JSON.parse(e.data as string)
      } catch {
        return
      }
      if (msg.t === 'doc') {
        retries = 0
        setStatus('connected')
        docCb?.(msg.doc)
      } else if (msg.t === 'missing') {
        // Session existiert (noch) nicht: lokalen Stand seeden (Re-Seed nach Server-Neustart)
        if (localDoc) ws?.send(JSON.stringify({ t: 'seed', session: sessionId, doc: localDoc() }))
        retries = 0
        setStatus('connected')
      } else if (msg.t === 'patch') {
        patchCb?.(msg.path, msg.value)
      } else if (msg.t === 'pong') {
        const t1 = Date.now()
        clockOffsetCb?.((msg.ts - msg.t0 + (msg.ts - t1)) / 2)
      }
    }
    ws.onclose = () => {
      ws = null
      if (closed) return
      setStatus('error')
      scheduleReconnect()
    }
    ws.onerror = () => {
      // onclose folgt; hier nichts zu tun
    }
  }

  return {
    status: () => status,
    onStatus(cb) {
      statusCb = cb
    },
    onDoc(cb) {
      docCb = cb
    },
    onPatch(cb) {
      patchCb = cb
    },
    onClockOffset(cb) {
      clockOffsetCb = cb
    },
    connect(id, doc) {
      sessionId = id
      localDoc = doc
      closed = false
      retries = 0
      open()
    },
    send(path, value) {
      if (!ws || ws.readyState !== 1 || status !== 'connected') return
      ws.send(JSON.stringify({ t: 'patch', path, value }))
    },
    close() {
      closed = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      ws?.close()
      ws = null
      setStatus('off')
    },
  }
}
