import { createServer } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { createStore, type Store } from './store.js'
import type { SessionDoc } from './types.js'

const SWEEP_INTERVAL_MS = 10 * 60 * 1000

type ClientMsg =
  | { t: 'join'; session: string }
  | { t: 'seed'; session: string; doc: SessionDoc }
  | { t: 'patch'; path: string; value: unknown }
  | { t: 'ping'; t0: number }

export interface RunningServer {
  port: number
  store: Store
  close(): Promise<void>
}

export function startServer(port: number): Promise<RunningServer> {
  const store = createStore()

  const http = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('ok')
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
      let msg: ClientMsg
      try {
        msg = JSON.parse(data.toString())
      } catch {
        return
      }

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
  const port = Number(process.env.PORT ?? 8787)
  startServer(port).then(({ port: p }) => {
    console.log(`wodch-backend listening on :${p} (ws path /ws)`)
  })
}
