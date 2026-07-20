import { createServer } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { createStore, type Store } from './store.js'
import type { SessionDoc } from './types.js'
import { createRateLimiter } from './rateLimit.js'
import { handleGenerate, hasApiKey, generateWorkout as defaultGenerateWorkout } from './generate.js'
import {
  handleEstimate,
  estimateDuration as defaultEstimateDuration,
  type EstimateTab,
  type DurationEstimate,
} from './estimate.js'

const SWEEP_INTERVAL_MS = 10 * 60 * 1000

type ClientMsg =
  | { t: 'join'; session: string }
  | { t: 'seed'; session: string; doc: SessionDoc }
  | { t: 'patch'; path: string; value: unknown }
  | { t: 'ping'; t0: number }

// Schema-Validierung eingehender WS-Nachrichten: ein Frame, der nicht exakt dem
// Protokoll entspricht, wird verworfen — bevor irgendetwas anderes ihn anfasst
// (SECURITY_REVIEW Befund 1). Feld-Typen der Patch-Werte prüft store.applyPatch.
function parseClientMsg(raw: unknown): ClientMsg | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const msg = raw as Record<string, unknown>
  switch (msg.t) {
    case 'ping':
      return typeof msg.t0 === 'number' && Number.isFinite(msg.t0) ? { t: 'ping', t0: msg.t0 } : null
    case 'join':
      return typeof msg.session === 'string' ? { t: 'join', session: msg.session } : null
    case 'seed':
      return typeof msg.session === 'string' &&
        typeof msg.doc === 'object' &&
        msg.doc !== null &&
        !Array.isArray(msg.doc)
        ? { t: 'seed', session: msg.session, doc: msg.doc as SessionDoc }
        : null
    case 'patch':
      return typeof msg.path === 'string' ? { t: 'patch', path: msg.path, value: msg.value } : null
    default:
      return null
  }
}

export interface RunningServer {
  port: number
  store: Store
  close(): Promise<void>
}

export function startServer(
  port: number,
  opts: {
    generateWorkout?: (prompt: string) => Promise<string>
    estimateDuration?: (tabs: EstimateTab[]) => Promise<DurationEstimate>
  } = {},
): Promise<RunningServer> {
  const store = createStore()
  const rateLimiter = createRateLimiter(10, 60_000)
  const generateWorkout = opts.generateWorkout ?? defaultGenerateWorkout
  const estimateDuration = opts.estimateDuration ?? defaultEstimateDuration

  const http = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('ok')
      return
    }
    if (req.url === '/generate' && req.method === 'POST') {
      const ip =
        (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        'unknown'
      let raw = ''
      let tooLarge = false
      req.on('data', (chunk) => {
        raw += chunk
        // Harte Obergrenze gegen übergroße Bodies (Prompt-Cap ist 500 Zeichen).
        if (raw.length > 4096) {
          tooLarge = true
          req.destroy()
        }
      })
      req.on('end', () => {
        void (async () => {
          if (tooLarge) {
            res.writeHead(400, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'Anfrage zu groß.' }))
            return
          }
          let prompt: unknown
          try {
            prompt = JSON.parse(raw).prompt
          } catch {
            res.writeHead(400, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'Ungültiges JSON.' }))
            return
          }
          const result = await handleGenerate(
            { prompt, ip },
            { rateLimiter, hasApiKey, generateWorkout },
          )
          res.writeHead(result.status, { 'content-type': 'application/json' })
          res.end(JSON.stringify(result.body))
        })()
      })
      return
    }
    if (req.url === '/estimate' && req.method === 'POST') {
      const ip =
        (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        'unknown'
      let raw = ''
      let tooLarge = false
      req.on('data', (chunk) => {
        raw += chunk
        // Höheres Limit als bei /generate, da mehrere Tabs kombiniert werden.
        if (raw.length > 16384) {
          tooLarge = true
          req.destroy()
        }
      })
      req.on('end', () => {
        void (async () => {
          if (tooLarge) {
            res.writeHead(400, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'Anfrage zu groß.' }))
            return
          }
          let tabs: unknown
          try {
            tabs = JSON.parse(raw).tabs
          } catch {
            res.writeHead(400, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'Ungültiges JSON.' }))
            return
          }
          const result = await handleEstimate(
            { tabs, ip },
            { rateLimiter, hasApiKey, estimateDuration },
          )
          res.writeHead(result.status, { 'content-type': 'application/json' })
          res.end(JSON.stringify(result.body))
        })()
      })
      return
    }
    res.writeHead(404)
    res.end()
  })

  const wss = new WebSocketServer({ server: http, path: '/ws' })

  wss.on('connection', (ws: WebSocket) => {
    let joined: string | null = null

    function leave() {
      if (joined) store.get(joined)?.clients.delete(ws)
      joined = null
    }

    ws.on('message', (data) => {
      // Sicherheitsnetz pro Verbindung: keine Exception aus der Verarbeitung darf
      // den Prozess reißen (eine Replica → ein Crash legt alles lahm).
      try {
        let raw: unknown
        try {
          raw = JSON.parse(data.toString())
        } catch {
          return
        }
        const msg = parseClientMsg(raw)
        if (!msg) return

        if (msg.t === 'ping') {
          // Uhr-Synchronisation: Clients messen ihren Versatz zur Server-Uhr
          ws.send(JSON.stringify({ t: 'pong', t0: msg.t0, ts: Date.now() }))
        } else if (msg.t === 'join') {
          leave()
          const session = store.get(msg.session)
          if (!session) {
            ws.send(JSON.stringify({ t: 'missing' }))
            return
          }
          joined = msg.session
          session.clients.add(ws)
          ws.send(JSON.stringify({ t: 'doc', doc: session.doc }))
        } else if (msg.t === 'seed') {
          leave()
          const existing = store.get(msg.session)
          const session = store.create(msg.session, msg.doc)
          joined = msg.session
          session.clients.add(ws)
          // Session existierte schon: Client bekommt den bestehenden Stand statt zu überschreiben
          if (existing) ws.send(JSON.stringify({ t: 'doc', doc: session.doc }))
        } else if (msg.t === 'patch') {
          if (!joined) return
          if (!store.applyPatch(joined, msg.path, msg.value)) return
          const session = store.get(joined)!
          const frame = JSON.stringify({ t: 'patch', path: msg.path, value: msg.value })
          for (const client of session.clients) {
            if (client !== ws && (client as WebSocket).readyState === WebSocket.OPEN) {
              ;(client as WebSocket).send(frame)
            }
          }
        }
      } catch {
        // Nachricht verwerfen; Verbindung und Prozess laufen weiter.
      }
    })

    ws.on('close', leave)
  })

  const sweeper = setInterval(() => store.sweep(), SWEEP_INTERVAL_MS)

  return new Promise((resolve) => {
    http.listen(port, () => {
      const address = http.address()
      const actualPort = typeof address === 'object' && address ? address.port : port
      resolve({
        port: actualPort,
        store,
        close() {
          clearInterval(sweeper)
          for (const client of wss.clients) client.terminate()
          return new Promise((res) => {
            wss.close(() => http.close(() => res()))
          })
        },
      })
    })
  })
}

const isMain = process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')
if (isMain) {
  // Letztes Sicherheitsnetz zusätzlich zur Validierung: loggen statt crashen.
  process.on('uncaughtException', (err) => console.error('uncaughtException:', err))
  process.on('unhandledRejection', (err) => console.error('unhandledRejection:', err))
  const port = Number(process.env.PORT ?? 8787)
  startServer(port).then(({ port: p }) => {
    console.log(`wodch-backend listening on :${p} (ws path /ws)`)
  })
}
