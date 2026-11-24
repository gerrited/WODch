import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { createStore, validateSessionDoc, type Store } from './store.js'
import type { SessionDoc } from './types.js'
import { createRateLimiter } from './rateLimit.js'
import { handleGenerate, hasApiKey, generateWorkout as defaultGenerateWorkout } from './generate.js'
import {
  handleEstimate,
  estimateDuration as defaultEstimateDuration,
  type EstimateTab,
  type DurationEstimate,
} from './estimate.js'
import { handleTimerize, suggestTimer as defaultSuggestTimer, type TimerSuggestion } from './timerize.js'

const SWEEP_INTERVAL_MS = 10 * 60 * 1000

// Pro-IP-Limit und globales Gesamtbudget (Circuit Breaker) für die
// kostenpflichtigen KI-Routen (SECURITY_REVIEW Befund 2).
const AI_RATE_LIMIT_PER_IP = 10
const AI_BUDGET_GLOBAL = 30
const AI_RATE_WINDOW_MS = 60_000

// Pro-IP-Limits auf dem WebSocket (SECURITY_REVIEW Befund 3): join/seed strikt
// (Session-Aufzählung), patch großzügig (parallel Tippende hinter derselben IP).
const WS_ENTRY_LIMIT = 30
const WS_PATCH_LIMIT = 300
const WS_RATE_WINDOW_MS = 60_000
// Frame-Obergrenze statt 100-MiB-Default: das größte legitime Dokument liegt bei
// wenigen KB (SECURITY_REVIEW Befund 4).
const WS_MAX_PAYLOAD = 64 * 1024

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

// Rate-Limit-Schlüssel: das rechteste XFF-Element stammt vom letzten Proxy vor dem
// Server (Ingress) und spiegelt die echte Verbindungs-IP — alle Elemente links davon
// sind client-kontrolliert und frei fälschbar (SECURITY_REVIEW Befund 2). Der Ingress
// überschreibt XFF zusätzlich komplett (k8s/deployment.yaml), sodass hier genau ein
// vertrauenswürdiger Wert ankommt.
function clientIp(req: IncomingMessage): string {
  const xff = req.headers['x-forwarded-for'] as string | undefined
  const last = xff?.split(',').at(-1)?.trim()
  return last || req.socket.remoteAddress || 'unknown'
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

// Liest einen JSON-Body mit harter Größengrenze und reicht das geparste Objekt weiter.
// Übergroße Bodies und kaputtes JSON werden mit 400 beantwortet, ohne den Handler zu rufen.
function readJsonBody(
  req: IncomingMessage,
  res: ServerResponse,
  maxBytes: number,
  handle: (body: Record<string, unknown>) => Promise<void>,
) {
  let raw = ''
  let tooLarge = false
  req.on('data', (chunk) => {
    raw += chunk
    if (raw.length > maxBytes) {
      tooLarge = true
      req.destroy()
    }
  })
  req.on('end', () => {
    void (async () => {
      if (tooLarge) return sendJson(res, 400, { error: 'Anfrage zu groß.' })
      let body: unknown
      try {
        body = JSON.parse(raw)
      } catch {
        return sendJson(res, 400, { error: 'Ungültiges JSON.' })
      }
      // null/Arrays/Primitive wie leere Objekte behandeln — die Handler validieren ihre Felder selbst
      const record = typeof body === 'object' && body !== null && !Array.isArray(body) ? body : {}
      await handle(record as Record<string, unknown>)
    })()
  })
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
    suggestTimer?: (content: string) => Promise<TimerSuggestion | null>
  } = {},
): Promise<RunningServer> {
  const store = createStore()
  const rateLimiter = createRateLimiter(AI_RATE_LIMIT_PER_IP, AI_RATE_WINDOW_MS)
  // Ein Budget über beide KI-Routen: Deckelt die Anthropic-Kosten auch dann,
  // wenn viele verschiedene IPs gleichzeitig anfragen.
  const globalAiBudget = createRateLimiter(AI_BUDGET_GLOBAL, AI_RATE_WINDOW_MS)
  const wsEntryLimiter = createRateLimiter(WS_ENTRY_LIMIT, WS_RATE_WINDOW_MS)
  const wsPatchLimiter = createRateLimiter(WS_PATCH_LIMIT, WS_RATE_WINDOW_MS)
  const generateWorkout = opts.generateWorkout ?? defaultGenerateWorkout
  const estimateDuration = opts.estimateDuration ?? defaultEstimateDuration
  const suggestTimer = opts.suggestTimer ?? defaultSuggestTimer

  const http = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('ok')
      return
    }
    if (req.url === '/generate' && req.method === 'POST') {
      const ip = clientIp(req)
      // Harte Obergrenze gegen übergroße Bodies (Prompt-Cap ist 500 Zeichen).
      readJsonBody(req, res, 4096, async (body) => {
        const result = await handleGenerate(
          { prompt: body.prompt, ip },
          { rateLimiter, globalBudget: globalAiBudget, hasApiKey, generateWorkout },
        )
        sendJson(res, result.status, result.body)
      })
      return
    }
    if (req.url === '/estimate' && req.method === 'POST') {
      const ip = clientIp(req)
      // Höheres Limit als bei /generate, da mehrere Tabs kombiniert werden.
      readJsonBody(req, res, 16384, async (body) => {
        const result = await handleEstimate(
          { tabs: body.tabs, ip },
          { rateLimiter, globalBudget: globalAiBudget, hasApiKey, estimateDuration },
        )
        sendJson(res, result.status, result.body)
      })
      return
    }
    if (req.url === '/timerize' && req.method === 'POST') {
      const ip = clientIp(req)
      // Ein Tab-Inhalt (≤ 2000 Zeichen) plus JSON-Hülle und Escapes
      readJsonBody(req, res, 8192, async (body) => {
        const result = await handleTimerize(
          { content: body.content, ip },
          { rateLimiter, globalBudget: globalAiBudget, hasApiKey, suggestTimer },
        )
        sendJson(res, result.status, result.body)
      })
      return
    }
    res.writeHead(404)
    res.end()
  })

  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: WS_MAX_PAYLOAD })

  // Anzahl verbundener Geräte an alle Clients einer Session — reine Laufzeit-Info,
  // landet nie im Session-Doc (wird also auch nicht re-geseedet).
  function broadcastPresence(sessionId: string) {
    const session = store.get(sessionId)
    if (!session) return
    const frame = JSON.stringify({ t: 'presence', count: session.clients.size })
    for (const client of session.clients) {
      if ((client as WebSocket).readyState === WebSocket.OPEN) (client as WebSocket).send(frame)
    }
  }

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    let joined: string | null = null
    // Rate-Limit-Schlüssel der Verbindung (rechtestes XFF-Element bzw. Socket-IP)
    const ip = clientIp(req)

    function leave() {
      const prev = joined
      joined = null
      if (!prev) return
      store.get(prev)?.clients.delete(ws)
      broadcastPresence(prev)
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

        // Limit überschritten: Verbindung schließen (1008 = Policy Violation).
        // Legitime Clients heilen über den vorhandenen Reconnect mit Backoff.
        const close = () => ws.close(1008)

        if (msg.t === 'ping') {
          // Uhr-Synchronisation: Clients messen ihren Versatz zur Server-Uhr
          ws.send(JSON.stringify({ t: 'pong', t0: msg.t0, ts: Date.now() }))
        } else if (msg.t === 'join') {
          if (!wsEntryLimiter.allow(ip)) return close()
          leave()
          const session = store.get(msg.session)
          if (!session) {
            ws.send(JSON.stringify({ t: 'missing' }))
            return
          }
          joined = msg.session
          session.clients.add(ws)
          ws.send(JSON.stringify({ t: 'doc', doc: session.doc }))
          broadcastPresence(msg.session)
        } else if (msg.t === 'seed') {
          if (!wsEntryLimiter.allow(ip)) return close()
          // Volle Struktur-Validierung vor dem Speichern (Befund 4/5)
          if (!validateSessionDoc(msg.doc)) {
            // Ohne Rückmeldung bliebe der Client im Glauben, verbunden zu sein, und
            // alle folgenden Patches würden still verworfen (Audit F7).
            ws.send(JSON.stringify({ t: 'error', reason: 'invalid_seed' }))
            return
          }
          const existing = store.get(msg.session)
          const session = store.create(msg.session, msg.doc)
          // Store voll und keine verdrängbare Session: explizit melden statt
          // den Client mit einer Geister-Session zurückzulassen (Audit F1/F7).
          if (!session) {
            ws.send(JSON.stringify({ t: 'error', reason: 'store_full' }))
            return
          }
          leave()
          joined = msg.session
          session.clients.add(ws)
          // Session existierte schon: Client bekommt den bestehenden Stand statt zu überschreiben
          if (existing) ws.send(JSON.stringify({ t: 'doc', doc: session.doc }))
          broadcastPresence(msg.session)
        } else if (msg.t === 'patch') {
          if (!joined) return
          if (!wsPatchLimiter.allow(ip)) return close()
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

    // Empfangsfehler (z. B. maxPayload-Überschreitung) sind verbindungslokal und enden
    // ohnehin im close — ohne Listener würde das 'error'-Event als Exception geworfen.
    ws.on('error', () => {})

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
