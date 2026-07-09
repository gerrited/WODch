# AI-Workout-Generierung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Magic-Button im Workout-Editor öffnet einen Chat-Dialog, dessen Freitext-Wunsch von der Anthropic Claude API in ein Workout verwandelt und in den aktiven Tab geschrieben wird.

**Architecture:** Der bestehende Sync-Server (umbenannt `wodch-sync` → `wodch-backend`) bekommt eine `POST /generate`-Route, die API-Key, System-Message und Modell serverseitig kapselt und Anthropic aufruft. Das Frontend (Svelte 5) zeigt Dialog + animierten Platzhalter-Overlay und schreibt das Ergebnis über den bestehenden `workouts.setContent`-Pfad (synchronisiert automatisch).

**Tech Stack:** Node 22 + TypeScript + `ws` + `@anthropic-ai/sdk` (neu) im Backend; Svelte 5 + Vite + Vitest im Frontend.

## Global Constraints

- Modell: `claude-haiku-4-5` (vom User explizit gewählt). Kein `thinking`-Parameter, kein `effort`-Parameter (beide erzeugen auf Haiku 4.5 einen 400). Nicht-Streaming (Ausgabe ≤ ~800 Tokens ≪ 16000).
- API-Key ausschließlich serverseitig aus `ANTHROPIC_API_KEY`. Niemals ins Frontend.
- Caps: Prompt > 500 Zeichen → `400`; Rate-Limit 10 Anfragen/Minute pro IP → `429`; `max_tokens` = 800.
- Fehlender Key → `503` (Feature degradiert sauber, App läuft weiter).
- Der Anthropic-Call selbst wird nie live getestet — Tests injizieren Fakes.
- Rename betrifft nur Dienst-/Image-Name; der Ordner `server/` bleibt.
- Deutsch für UI-Texte und Kommentare, mit korrekten Umlauten.

---

### Task 1: Rename `wodch-sync` → `wodch-backend`

Rein mechanisch, keine Logikänderung. Der Ordner `server/` bleibt; nur Dienst-/Image-Name ändern sich.

**Files:**
- Modify: `server/package.json` (`"name": "wodch-sync"` → `"wodch-backend"`)
- Modify: `.github/workflows/docker.yml:53` (`image: wodch-sync` → `wodch-backend`)
- Modify: `k8s/deployment.yaml` (Deployment/Service-Namen, Labels, Ingress-Backend-Referenzen)
- Modify: `README.md` (Architektur-Tabelle, Image-Tabelle, Deployment-Abschnitt)
- Modify: `server/src/index.ts:113` (Log-Zeile `wodch-sync listening` → `wodch-backend listening`)

- [ ] **Step 1: `server/package.json` umbenennen**

Ändere die Zeile:
```json
  "name": "wodch-sync",
```
zu:
```json
  "name": "wodch-backend",
```

- [ ] **Step 2: GitHub-Actions-Image umbenennen**

In `.github/workflows/docker.yml`, in der `build-and-push`-Matrix:
```yaml
          - package: server
            image: wodch-sync
```
zu:
```yaml
          - package: server
            image: wodch-backend
```

- [ ] **Step 3: k8s-Manifest umbenennen**

In `k8s/deployment.yaml` alle Vorkommen von `wodch-sync` durch `wodch-backend` ersetzen. Das betrifft: Deployment `metadata.name`, `spec.selector.matchLabels.app`, `template.metadata.labels.app`, das Container-`image: ghcr.io/gerrited/wodch-sync:latest`, den Service `metadata.name` und `spec.selector.app`, sowie beide Ingress-`backend.service.name`-Einträge (unter `wodch.com` und `www.wodch.com`).

Run: `grep -n wodch-sync k8s/deployment.yaml`
Expected: keine Treffer (leere Ausgabe).

- [ ] **Step 4: README anpassen**

In `README.md` alle `wodch-sync`-Vorkommen durch `wodch-backend` ersetzen (Architektur-Block, Image-Tabellenzeile `ghcr.io/gerrited/wodch-sync`, `docker build … ./server`-Tag falls vorhanden, Kubernetes-Abschnitt).

Run: `grep -rn wodch-sync README.md`
Expected: keine Treffer.

- [ ] **Step 5: Log-Zeile im Server anpassen**

In `server/src/index.ts`:
```typescript
    console.log(`wodch-sync listening on :${p} (ws path /ws)`)
```
zu:
```typescript
    console.log(`wodch-backend listening on :${p} (ws path /ws)`)
```

- [ ] **Step 6: Gesamt-Verifikation**

Run: `grep -rn "wodch-sync" server .github k8s README.md`
Expected: keine Treffer.

Run: `cd server && npm test`
Expected: alle bestehenden Tests grün.

- [ ] **Step 7: Commit**

```bash
git add server/package.json .github/workflows/docker.yml k8s/deployment.yaml README.md server/src/index.ts
git commit -m "refactor(backend): rename wodch-sync to wodch-backend"
```

---

### Task 2: Backend — In-Memory-Rate-Limiter

Isolierte, testbare Einheit: gleitendes Zeitfenster pro Schlüssel (IP). Deterministisch testbar durch injizierte `now`-Funktion.

**Files:**
- Create: `server/src/rateLimit.ts`
- Test: `server/test/rateLimit.test.ts`

**Interfaces:**
- Produces: `createRateLimiter(limit: number, windowMs: number, now?: () => number): { allow(key: string): boolean }` — `allow` gibt `true` zurück und registriert den Zugriff, solange innerhalb `windowMs` weniger als `limit` Zugriffe für `key` erfolgten; sonst `false` (ohne Registrierung).

- [ ] **Step 1: Failing test schreiben**

Erstelle `server/test/rateLimit.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { createRateLimiter } from '../src/rateLimit.ts'

describe('createRateLimiter', () => {
  it('erlaubt bis zum Limit und blockt danach', () => {
    let t = 0
    const rl = createRateLimiter(3, 1000, () => t)
    expect(rl.allow('a')).toBe(true)
    expect(rl.allow('a')).toBe(true)
    expect(rl.allow('a')).toBe(true)
    expect(rl.allow('a')).toBe(false)
  })

  it('zählt pro Schlüssel getrennt', () => {
    let t = 0
    const rl = createRateLimiter(1, 1000, () => t)
    expect(rl.allow('a')).toBe(true)
    expect(rl.allow('b')).toBe(true)
    expect(rl.allow('a')).toBe(false)
  })

  it('gibt Kapazität frei, sobald das Fenster verstrichen ist', () => {
    let t = 0
    const rl = createRateLimiter(1, 1000, () => t)
    expect(rl.allow('a')).toBe(true)
    expect(rl.allow('a')).toBe(false)
    t = 1001
    expect(rl.allow('a')).toBe(true)
  })
})
```

- [ ] **Step 2: Test laufen lassen (rot)**

Run: `cd server && npx vitest run test/rateLimit.test.ts`
Expected: FAIL — `Cannot find module '../src/rateLimit.ts'`.

- [ ] **Step 3: Implementieren**

Erstelle `server/src/rateLimit.ts`:
```typescript
export interface RateLimiter {
  allow(key: string): boolean
}

// Gleitendes Zeitfenster pro Schlüssel. Timestamps werden faul beim Zugriff bereinigt.
export function createRateLimiter(
  limit: number,
  windowMs: number,
  now: () => number = Date.now,
): RateLimiter {
  const hits = new Map<string, number[]>()
  return {
    allow(key: string): boolean {
      const t = now()
      const cutoff = t - windowMs
      const recent = (hits.get(key) ?? []).filter((ts) => ts > cutoff)
      if (recent.length >= limit) {
        hits.set(key, recent)
        return false
      }
      recent.push(t)
      hits.set(key, recent)
      return true
    },
  }
}
```

- [ ] **Step 4: Test laufen lassen (grün)**

Run: `cd server && npx vitest run test/rateLimit.test.ts`
Expected: PASS (3 Tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/rateLimit.ts server/test/rateLimit.test.ts
git commit -m "feat(backend): add in-memory per-key rate limiter"
```

---

### Task 3: Backend — Generate-Kernlogik (Validierung, Limits, Fehler-Mapping)

Die reine Request-Verarbeitung (ohne HTTP-Plumbing) als testbare Funktion mit injizierten Abhängigkeiten. Der echte Anthropic-Aufruf ist ein separater, nicht unit-getesteter SDK-Wrapper.

**Files:**
- Create: `server/src/generate.ts`
- Test: `server/test/generate.test.ts`
- Modify: `server/package.json` (Dependency `@anthropic-ai/sdk`)

**Interfaces:**
- Consumes: `RateLimiter` aus `./rateLimit.ts`.
- Produces:
  - `GENERATE_CONFIG = { model: 'claude-haiku-4-5', maxTokens: 800, maxPromptChars: 500, systemPrompt: string }`
  - `interface GenerateDeps { rateLimiter: RateLimiter; hasApiKey: () => boolean; generateWorkout: (prompt: string) => Promise<string> }`
  - `handleGenerate(input: { prompt: unknown; ip: string }, deps: GenerateDeps): Promise<{ status: number; body: object }>` — Reihenfolge: Key-Check (503) → Rate-Limit (429) → Prompt-Validierung (400) → Anthropic-Call (200 `{ workout }`, Fehler → 500 `{ error }`).
  - `generateWorkout(prompt: string): Promise<string>` — dünner SDK-Wrapper (nicht unit-getestet), liest `ANTHROPIC_API_KEY`, ruft `client.messages.create` mit `GENERATE_CONFIG`.
  - `hasApiKey(): boolean` — `!!process.env.ANTHROPIC_API_KEY`.

- [ ] **Step 1: Anthropic-SDK als Dependency ergänzen**

Run: `cd server && npm install @anthropic-ai/sdk`
Expected: `@anthropic-ai/sdk` erscheint unter `dependencies` in `server/package.json`.

- [ ] **Step 2: Failing test schreiben**

Erstelle `server/test/generate.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { handleGenerate, type GenerateDeps } from '../src/generate.ts'
import { createRateLimiter } from '../src/rateLimit.ts'

function deps(overrides: Partial<GenerateDeps> = {}): GenerateDeps {
  return {
    rateLimiter: createRateLimiter(10, 60000),
    hasApiKey: () => true,
    generateWorkout: async () => 'FÜR ZEIT\n21-15-9\nThruster\nPull-up',
    ...overrides,
  }
}

describe('handleGenerate', () => {
  it('liefert bei Erfolg 200 mit dem Workout', async () => {
    const res = await handleGenerate({ prompt: 'kurzes AMRAP', ip: '1.1.1.1' }, deps())
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ workout: 'FÜR ZEIT\n21-15-9\nThruster\nPull-up' })
  })

  it('liefert 503 ohne API-Key', async () => {
    const res = await handleGenerate({ prompt: 'x', ip: '1.1.1.1' }, deps({ hasApiKey: () => false }))
    expect(res.status).toBe(503)
  })

  it('liefert 400 bei leerem Prompt', async () => {
    const res = await handleGenerate({ prompt: '   ', ip: '1.1.1.1' }, deps())
    expect(res.status).toBe(400)
  })

  it('liefert 400 bei Nicht-String-Prompt', async () => {
    const res = await handleGenerate({ prompt: 42, ip: '1.1.1.1' }, deps())
    expect(res.status).toBe(400)
  })

  it('liefert 400 bei zu langem Prompt', async () => {
    const res = await handleGenerate({ prompt: 'a'.repeat(501), ip: '1.1.1.1' }, deps())
    expect(res.status).toBe(400)
  })

  it('liefert 429 wenn das Rate-Limit überschritten ist', async () => {
    const d = deps({ rateLimiter: createRateLimiter(1, 60000) })
    const first = await handleGenerate({ prompt: 'x', ip: '9.9.9.9' }, d)
    const second = await handleGenerate({ prompt: 'x', ip: '9.9.9.9' }, d)
    expect(first.status).toBe(200)
    expect(second.status).toBe(429)
  })

  it('liefert 500 wenn der Anthropic-Call wirft', async () => {
    const d = deps({ generateWorkout: async () => { throw new Error('upstream') } })
    const res = await handleGenerate({ prompt: 'x', ip: '1.1.1.1' }, d)
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 3: Test laufen lassen (rot)**

Run: `cd server && npx vitest run test/generate.test.ts`
Expected: FAIL — `Cannot find module '../src/generate.ts'`.

- [ ] **Step 4: Implementieren**

Erstelle `server/src/generate.ts`:
```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { RateLimiter } from './rateLimit.js'

export const GENERATE_CONFIG = {
  model: 'claude-haiku-4-5',
  maxTokens: 800,
  maxPromptChars: 500,
  systemPrompt:
    'Du bist ein erfahrener CrossFit- und Gym-Coach. Erstelle aus dem Wunsch des Nutzers ein ' +
    'einzelnes Workout. Gib ausschließlich das Workout als reinen, zentrierbaren Monospace-Text ' +
    'zurück — keine Einleitung, keine Markdown-Formatierung, keine Erklärungen. Halte dich kurz.',
} as const

export interface GenerateDeps {
  rateLimiter: RateLimiter
  hasApiKey: () => boolean
  generateWorkout: (prompt: string) => Promise<string>
}

export interface GenerateResult {
  status: number
  body: object
}

export async function handleGenerate(
  input: { prompt: unknown; ip: string },
  deps: GenerateDeps,
): Promise<GenerateResult> {
  if (!deps.hasApiKey()) {
    return { status: 503, body: { error: 'AI-Generierung ist nicht konfiguriert.' } }
  }
  if (!deps.rateLimiter.allow(input.ip)) {
    return { status: 429, body: { error: 'Zu viele Anfragen. Bitte kurz warten.' } }
  }
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : ''
  if (!prompt || prompt.length > GENERATE_CONFIG.maxPromptChars) {
    return { status: 400, body: { error: 'Ungültiger Wunsch-Text.' } }
  }
  try {
    const workout = await deps.generateWorkout(prompt)
    return { status: 200, body: { workout } }
  } catch {
    return { status: 500, body: { error: 'Generierung fehlgeschlagen.' } }
  }
}

export function hasApiKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

// Dünner SDK-Wrapper — bewusst nicht unit-getestet (kein Live-Call in Tests).
export async function generateWorkout(prompt: string): Promise<string> {
  const client = new Anthropic()
  const response = await client.messages.create({
    model: GENERATE_CONFIG.model,
    max_tokens: GENERATE_CONFIG.maxTokens,
    system: GENERATE_CONFIG.systemPrompt,
    messages: [{ role: 'user', content: prompt }],
  })
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
}
```

- [ ] **Step 5: Test laufen lassen (grün)**

Run: `cd server && npx vitest run test/generate.test.ts`
Expected: PASS (7 Tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/generate.ts server/test/generate.test.ts server/package.json server/package-lock.json
git commit -m "feat(backend): add generate core logic and Anthropic wrapper"
```

---

### Task 4: Backend — `/generate` in den HTTP-Server verdrahten

Die `POST /generate`-Route in den bestehenden `http`-Handler einhängen: Body parsen, IP ermitteln, `handleGenerate` aufrufen, JSON antworten. `generateWorkout` ist über `startServer`-Optionen injizierbar, damit ein Integrationstest per echtem HTTP ohne Anthropic-Call läuft.

**Files:**
- Modify: `server/src/index.ts`
- Test: `server/test/generateHttp.test.ts`

**Interfaces:**
- Consumes: `handleGenerate`, `hasApiKey`, `generateWorkout`, `GENERATE_CONFIG` aus `./generate.js`; `createRateLimiter` aus `./rateLimit.js`.
- Produces: `startServer(port: number, opts?: { generateWorkout?: (prompt: string) => Promise<string> }): Promise<RunningServer>` — bestehende Signatur um optionales `opts` erweitert.

- [ ] **Step 1: Failing test schreiben**

Erstelle `server/test/generateHttp.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { startServer, type RunningServer } from '../src/index.ts'

let server: RunningServer
let base: string

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key'
  server = await startServer(0, {
    generateWorkout: async (prompt) => `WORKOUT für: ${prompt}`,
  })
  base = `http://127.0.0.1:${server.port}`
})

afterAll(async () => {
  await server.close()
  delete process.env.ANTHROPIC_API_KEY
})

describe('POST /generate', () => {
  it('gibt ein generiertes Workout zurück', async () => {
    const res = await fetch(`${base}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'Beine' }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ workout: 'WORKOUT für: Beine' })
  })

  it('lehnt fehlerhaftes JSON mit 400 ab', async () => {
    const res = await fetch(`${base}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    })
    expect(res.status).toBe(400)
  })

  it('lehnt zu langen Prompt mit 400 ab', async () => {
    const res = await fetch(`${base}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'a'.repeat(501) }),
    })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Test laufen lassen (rot)**

Run: `cd server && npx vitest run test/generateHttp.test.ts`
Expected: FAIL — `/generate` liefert 404 (Route existiert noch nicht).

- [ ] **Step 3: Implementieren**

In `server/src/index.ts` oben ergänzen:
```typescript
import { createRateLimiter } from './rateLimit.js'
import { handleGenerate, hasApiKey, generateWorkout as defaultGenerateWorkout } from './generate.js'
```

Signatur und Body von `startServer` anpassen. Zeile:
```typescript
export function startServer(port: number): Promise<RunningServer> {
  const store = createStore()
```
zu:
```typescript
export function startServer(
  port: number,
  opts: { generateWorkout?: (prompt: string) => Promise<string> } = {},
): Promise<RunningServer> {
  const store = createStore()
  const rateLimiter = createRateLimiter(10, 60_000)
  const generateWorkout = opts.generateWorkout ?? defaultGenerateWorkout
```

Im `createServer`-Callback nach dem `/healthz`-Block und vor `res.writeHead(404)` einfügen:
```typescript
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
          const result = await handleGenerate({ prompt, ip }, { rateLimiter, hasApiKey, generateWorkout })
          res.writeHead(result.status, { 'content-type': 'application/json' })
          res.end(JSON.stringify(result.body))
        })()
      })
      return
    }
```

- [ ] **Step 4: Test laufen lassen (grün)**

Run: `cd server && npx vitest run test/generateHttp.test.ts`
Expected: PASS (3 Tests).

- [ ] **Step 5: Volle Server-Suite grün**

Run: `cd server && npm test`
Expected: alle Tests grün.

- [ ] **Step 6: Commit**

```bash
git add server/src/index.ts server/test/generateHttp.test.ts
git commit -m "feat(backend): wire POST /generate route"
```

---

### Task 5: Frontend — Generate-Client + Platzhalter-Phrasen + Vite-Proxy

Fetch-Wrapper zum Backend und die Logik für die rotierenden Platzhalter-Phrasen als testbares Modul. Dazu der Dev-Proxy für `/generate`.

**Files:**
- Create: `frontend/src/lib/generate/generate.ts`
- Test: `frontend/src/lib/generate/generate.test.ts`
- Modify: `frontend/vite.config.ts`

**Interfaces:**
- Produces:
  - `requestWorkout(prompt: string): Promise<string>` — `POST /generate`; bei `res.ok` gibt `data.workout` zurück, sonst wirft `Error(data.error ?? 'Generierung fehlgeschlagen.')`.
  - `PHRASES: string[]` — Anzeigephrasen im Claude-Code-Stil.
  - `nextPhraseIndex(current: number): number` — zyklischer Nachfolger-Index in `PHRASES`.

- [ ] **Step 1: Failing test schreiben**

Erstelle `frontend/src/lib/generate/generate.test.ts`:
```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { requestWorkout, PHRASES, nextPhraseIndex } from './generate'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('requestWorkout', () => {
  it('gibt das Workout bei Erfolg zurück', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ workout: 'FRAN' }), { status: 200 })),
    )
    expect(await requestWorkout('leicht')).toBe('FRAN')
  })

  it('wirft mit der Server-Fehlermeldung bei Fehler-Status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Zu viele Anfragen.' }), { status: 429 })),
    )
    await expect(requestWorkout('x')).rejects.toThrow('Zu viele Anfragen.')
  })
})

describe('nextPhraseIndex', () => {
  it('rotiert zyklisch durch PHRASES', () => {
    expect(nextPhraseIndex(0)).toBe(1)
    expect(nextPhraseIndex(PHRASES.length - 1)).toBe(0)
  })
})
```

- [ ] **Step 2: Test laufen lassen (rot)**

Run: `cd frontend && npx vitest run src/lib/generate/generate.test.ts`
Expected: FAIL — Modul nicht gefunden.

- [ ] **Step 3: Implementieren**

Erstelle `frontend/src/lib/generate/generate.ts`:
```typescript
export const PHRASES = [
  'Heavy lifting',
  'Chalking up',
  'Counting reps',
  'Racking plates',
  'Catching breath',
  'Programming WOD',
]

export function nextPhraseIndex(current: number): number {
  return (current + 1) % PHRASES.length
}

export async function requestWorkout(prompt: string): Promise<string> {
  const res = await fetch('/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  let data: { workout?: string; error?: string } = {}
  try {
    data = await res.json()
  } catch {
    // Body leer/kein JSON — fällt unten auf Default-Fehler zurück
  }
  if (!res.ok || typeof data.workout !== 'string') {
    throw new Error(data.error ?? 'Generierung fehlgeschlagen.')
  }
  return data.workout
}
```

- [ ] **Step 4: Test laufen lassen (grün)**

Run: `cd frontend && npx vitest run src/lib/generate/generate.test.ts`
Expected: PASS (3 Tests).

- [ ] **Step 5: Vite-Dev-Proxy ergänzen**

In `frontend/vite.config.ts`, im `server.proxy`-Block neben `/ws`:
```typescript
  server: {
    proxy: {
      '/ws': {
        target: 'ws://localhost:8787',
        ws: true,
      },
      '/generate': {
        target: 'http://localhost:8787',
      },
    },
  },
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/generate/generate.ts frontend/src/lib/generate/generate.test.ts frontend/vite.config.ts
git commit -m "feat(frontend): add generate client, placeholder phrases, dev proxy"
```

---

### Task 6: Frontend — GenerateDialog-Komponente

Kleiner modaler Dialog im Stil von `ConfirmDialog.svelte`: Textarea für den Wunsch, Buttons „Generieren"/„Abbrechen", Tastatur (`Escape` schließt, `Cmd/Ctrl+Enter` bestätigt), Zeichenlimit gespiegelt.

**Files:**
- Create: `frontend/src/lib/components/GenerateDialog.svelte`
- Test: `frontend/src/lib/components/GenerateDialog.test.ts`

**Interfaces:**
- Produces: `GenerateDialog`-Props `{ onSubmit: (prompt: string) => void; onCancel: () => void }`. Ruft `onSubmit` mit dem getrimmten Text nur bei nicht-leerem Wert; `onCancel` bei Abbrechen/Escape/Overlay-Klick.

- [ ] **Step 1: Failing test schreiben**

Erstelle `frontend/src/lib/components/GenerateDialog.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, unmount, flushSync } from 'svelte'
import GenerateDialog from './GenerateDialog.svelte'

let component: Record<string, unknown>

afterEach(() => {
  if (component) unmount(component)
  document.body.innerHTML = ''
})

describe('GenerateDialog', () => {
  it('ruft onSubmit mit dem getrimmten Text', () => {
    const onSubmit = vi.fn()
    component = mount(GenerateDialog, { target: document.body, props: { onSubmit, onCancel: () => {} } })
    flushSync()
    const ta = document.querySelector('.gen-input') as HTMLTextAreaElement
    ta.value = '  20 Min AMRAP  '
    ta.dispatchEvent(new InputEvent('input', { bubbles: true }))
    flushSync()
    ;(document.querySelector('.btn-generate') as HTMLButtonElement).click()
    flushSync()
    expect(onSubmit).toHaveBeenCalledWith('20 Min AMRAP')
  })

  it('ruft onSubmit nicht bei leerem Text', () => {
    const onSubmit = vi.fn()
    component = mount(GenerateDialog, { target: document.body, props: { onSubmit, onCancel: () => {} } })
    flushSync()
    ;(document.querySelector('.btn-generate') as HTMLButtonElement).click()
    flushSync()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('ruft onCancel bei Klick auf Abbrechen', () => {
    const onCancel = vi.fn()
    component = mount(GenerateDialog, { target: document.body, props: { onSubmit: () => {}, onCancel } })
    flushSync()
    ;(document.querySelector('.btn-cancel') as HTMLButtonElement).click()
    flushSync()
    expect(onCancel).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Test laufen lassen (rot)**

Run: `cd frontend && npx vitest run src/lib/components/GenerateDialog.test.ts`
Expected: FAIL — Komponente nicht gefunden.

- [ ] **Step 3: Implementieren**

Erstelle `frontend/src/lib/components/GenerateDialog.svelte`:
```svelte
<script lang="ts">
  import { tick } from 'svelte'

  let { onSubmit, onCancel }: { onSubmit: (prompt: string) => void; onCancel: () => void } = $props()

  const MAX = 500
  let value = $state('')
  let inputEl: HTMLTextAreaElement | undefined = $state()

  $effect(() => {
    // Beim Öffnen fokussieren
    tick().then(() => inputEl?.focus())
  })

  function submit() {
    const trimmed = value.trim()
    if (!trimmed) return
    onSubmit(trimmed)
  }

  function onOverlayClick(e: MouseEvent) {
    e.stopPropagation()
    if (e.target === e.currentTarget) onCancel()
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submit()
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div
  class="modal-overlay"
  onclick={onOverlayClick}
  onpointerdown={(e) => e.stopPropagation()}
  ontouchstart={(e) => e.stopPropagation()}
  role="presentation"
>
  <div class="modal" role="dialog" aria-modal="true">
    <button class="close-btn" onclick={onCancel} aria-label="Abbrechen">✕</button>
    <div class="title">Workout mit AI erstellen</div>
    <textarea
      bind:this={inputEl}
      class="gen-input"
      bind:value
      maxlength={MAX}
      placeholder="z. B. 20 Min AMRAP mit Kettlebells, Fokus Beine"
      rows="4"
    ></textarea>
    <div class="counter">{value.length}/{MAX}</div>
    <div class="actions">
      <button class="btn btn-cancel" onclick={onCancel}>Abbrechen</button>
      <button class="btn btn-generate" onclick={submit} disabled={!value.trim()}>Generieren</button>
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    overscroll-behavior: contain;
    touch-action: none;
  }
  .modal {
    background: #111;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 24px;
    width: 360px;
    position: relative;
    text-align: center;
  }
  .close-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    background: none;
    border: none;
    color: #666;
    font-size: 16px;
    cursor: pointer;
    padding: 4px 8px;
  }
  .close-btn:hover {
    color: #fff;
  }
  .title {
    color: #fff;
    font-size: 15px;
    margin-bottom: 16px;
  }
  .gen-input {
    width: 100%;
    box-sizing: border-box;
    background: #000;
    border: 1px solid #333;
    border-radius: 4px;
    color: #fff;
    font-family: monospace;
    font-size: 13px;
    padding: 10px;
    resize: vertical;
    outline: none;
  }
  .gen-input:focus {
    border-color: #555;
  }
  .counter {
    color: #555;
    font-size: 11px;
    text-align: right;
    margin-top: 4px;
  }
  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 16px;
  }
  .btn {
    border: 1px solid #333;
    border-radius: 4px;
    background: none;
    color: #ccc;
    font-family: monospace;
    font-size: 13px;
    letter-spacing: 1px;
    padding: 8px 16px;
    cursor: pointer;
  }
  .btn-cancel:hover {
    color: #fff;
    border-color: #555;
  }
  .btn-generate {
    color: #7cc;
    border-color: #7cc;
  }
  .btn-generate:hover:not(:disabled) {
    background: #7cc;
    color: #000;
  }
  .btn-generate:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
```

- [ ] **Step 4: Test laufen lassen (grün)**

Run: `cd frontend && npx vitest run src/lib/components/GenerateDialog.test.ts`
Expected: PASS (3 Tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/components/GenerateDialog.svelte frontend/src/lib/components/GenerateDialog.test.ts
git commit -m "feat(frontend): add GenerateDialog component"
```

---

### Task 7: Frontend — Magic-Button, Overlay & Verdrahtung in WorkoutEditor

Magic-Button in die Tab-Leiste, Dialog öffnen, animierter Platzhalter-Overlay während der Generierung, Ergebnis in den aktiven Tab schreiben, Fehleranzeige. Overlay-State bleibt lokal (nicht synchronisiert).

**Files:**
- Modify: `frontend/src/lib/components/WorkoutEditor.svelte`
- Modify: `frontend/src/lib/components/WorkoutEditor.test.ts`

**Interfaces:**
- Consumes: `requestWorkout`, `PHRASES`, `nextPhraseIndex` aus `../generate/generate`; `GenerateDialog` aus `./GenerateDialog.svelte`; `workouts.setContent` aus dem Store.

- [ ] **Step 1: Failing tests ergänzen**

Ergänze in `frontend/src/lib/components/WorkoutEditor.test.ts` einen neuen Block (Import oben ergänzen: `import { vi } from 'vitest'` falls nicht vorhanden — der bestehende Import um `vi` erweitern):
```typescript
describe('WorkoutEditor AI-Generierung', () => {
  beforeEach(() => {
    workouts.applyRemote({ tabs: [{ id: 'w1', title: 'Workout 1', content: 'alt' }], activeTab: 0 })
    component = mount(WorkoutEditor, { target: document.body })
    flushSync()
  })

  afterEach(() => {
    unmount(component)
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('öffnet den Dialog über den Magic-Button', () => {
    expect(document.querySelector('.gen-input')).toBeNull()
    ;(document.querySelector('[data-tour="ai-generate"]') as HTMLButtonElement).click()
    flushSync()
    expect(document.querySelector('.gen-input')).not.toBeNull()
  })

  it('schreibt das generierte Workout in den aktiven Tab', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ workout: 'FRAN\n21-15-9' }), { status: 200 })),
    )
    ;(document.querySelector('[data-tour="ai-generate"]') as HTMLButtonElement).click()
    flushSync()
    const ta = document.querySelector('.gen-input') as HTMLTextAreaElement
    ta.value = 'Fran'
    ta.dispatchEvent(new InputEvent('input', { bubbles: true }))
    flushSync()
    ;(document.querySelector('.btn-generate') as HTMLButtonElement).click()
    // Auf das Auflösen des fetch-Promise warten
    await vi.waitFor(() => expect(workouts.tabs[0].content).toBe('FRAN\n21-15-9'))
  })

  it('lässt den Tab-Inhalt bei Fehler unberührt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'kaputt' }), { status: 500 })),
    )
    ;(document.querySelector('[data-tour="ai-generate"]') as HTMLButtonElement).click()
    flushSync()
    const ta = document.querySelector('.gen-input') as HTMLTextAreaElement
    ta.value = 'Fran'
    ta.dispatchEvent(new InputEvent('input', { bubbles: true }))
    flushSync()
    ;(document.querySelector('.btn-generate') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(document.querySelector('.gen-error')).not.toBeNull())
    expect(workouts.tabs[0].content).toBe('alt')
  })
})
```

- [ ] **Step 2: Tests laufen lassen (rot)**

Run: `cd frontend && npx vitest run src/lib/components/WorkoutEditor.test.ts`
Expected: FAIL — kein `[data-tour="ai-generate"]`-Button.

- [ ] **Step 3: Implementieren**

In `frontend/src/lib/components/WorkoutEditor.svelte` im `<script>` ergänzen:
```typescript
  import GenerateDialog from './GenerateDialog.svelte'
  import { requestWorkout, PHRASES, nextPhraseIndex } from '../generate/generate'

  let showGenerate = $state(false)
  let generating = $state(false)
  let phraseIndex = $state(0)
  let genError = $state<string | null>(null)
  let phraseTimer: ReturnType<typeof setInterval> | undefined

  function openGenerate() {
    genError = null
    showGenerate = true
  }

  async function runGenerate(prompt: string) {
    showGenerate = false
    genError = null
    generating = true
    phraseIndex = 0
    phraseTimer = setInterval(() => {
      phraseIndex = nextPhraseIndex(phraseIndex)
    }, 1500)
    const target = workouts.activeTab
    try {
      const workout = await requestWorkout(prompt)
      workouts.setContent(target, workout)
    } catch (e) {
      genError = e instanceof Error ? e.message : 'Generierung fehlgeschlagen.'
    } finally {
      generating = false
      clearInterval(phraseTimer)
    }
  }
```

Im Markup den Magic-Button in die Tab-Leiste einfügen, direkt nach dem `.tab-add`-Button:
```svelte
    <button class="tab-add" onclick={() => workouts.addTab()}>+</button>
    <button
      class="tab-magic"
      data-tour="ai-generate"
      title="Workout mit AI erstellen"
      aria-label="Workout mit AI erstellen"
      onclick={openGenerate}>✨</button
    >
```

Im `.editor-area`-Div den Overlay ergänzen (innerhalb `.editor-area`, nach dem `.workout-editor`-Div):
```svelte
  <div class="editor-area">
    <div
      bind:this={editorEl}
      class="workout-editor"
      contenteditable="true"
      spellcheck="false"
      data-placeholder="Workout eingeben..."
      oninput={onInput}
      onfocus={onFocus}
      onblur={onBlur}
      role="textbox"
      tabindex="0"
    ></div>
    {#if generating}
      <div class="gen-overlay">
        <span class="gen-phrase">{PHRASES[phraseIndex]}<span class="gen-dots"></span></span>
      </div>
    {/if}
    {#if genError}
      <div class="gen-error">{genError}</div>
    {/if}
  </div>
```

Ganz am Ende des Markups (nach dem bestehenden `{#if pendingDelete !== null}`-Block) den Dialog rendern:
```svelte
{#if showGenerate}
  <GenerateDialog onSubmit={runGenerate} onCancel={() => (showGenerate = false)} />
{/if}
```

Im `<style>`-Block ergänzen (die `.editor-area` bekommt `position: relative` für den Overlay):
```css
  .editor-area {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow-y: auto;
    position: relative;
  }
  .tab-magic {
    background: none;
    border: none;
    color: #7cc;
    font-size: 15px;
    cursor: pointer;
    padding: 0 14px;
    line-height: 1;
    margin-left: auto;
  }
  .tab-magic:hover {
    color: #fff;
  }
  .gen-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.85);
  }
  .gen-phrase {
    color: #7cc;
    font-family: 'JetBrains Mono', monospace;
    font-size: 22px;
    letter-spacing: 1px;
  }
  .gen-dots::after {
    content: '';
    animation: gen-dots 1.2s steps(4, end) infinite;
  }
  @keyframes gen-dots {
    0% { content: ''; }
    25% { content: '.'; }
    50% { content: '..'; }
    75% { content: '...'; }
  }
  .gen-error {
    position: absolute;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    color: #e63946;
    font-size: 12px;
    font-family: monospace;
    background: #1a1a1a;
    padding: 6px 12px;
    border-radius: 4px;
  }
```

Hinweis: Die vorhandene `.editor-area`-Regel wird ersetzt (nur `position: relative` ergänzt); die `.tab-bar` hat bereits `overflow-x: auto`, sodass `margin-left: auto` den Magic-Button rechtsbündig schiebt.

- [ ] **Step 4: Tests laufen lassen (grün)**

Run: `cd frontend && npx vitest run src/lib/components/WorkoutEditor.test.ts`
Expected: PASS (bestehende Fokus-Schutz-Tests + 3 neue AI-Tests).

- [ ] **Step 5: Volle Frontend-Suite + Build**

Run: `cd frontend && npm test && npm run build`
Expected: alle Tests grün, `svelte-check` und Vite-Build ohne Fehler.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/components/WorkoutEditor.svelte frontend/src/lib/components/WorkoutEditor.test.ts
git commit -m "feat(frontend): magic button, generate dialog wiring, animated overlay"
```

---

## Nach der Umsetzung

- k8s-Secret `ANTHROPIC_API_KEY` in die `wodch-backend`-Deployment-Env aufnehmen (manueller Ops-Schritt, nicht Teil dieses Plans — Secret gehört nicht ins Repo).
- Lokaler End-to-End-Test: `ANTHROPIC_API_KEY=… npm run dev` im Server, `npm run dev` im Frontend, Magic-Button → Dialog → Generieren; Overlay-Rotation und Ergebnis im aktiven Tab prüfen (siehe verify-Skill).
- Onboarding-Tour: optional einen Tour-Schritt für `[data-tour="ai-generate"]` ergänzen (separates Feature, außerhalb dieses Plans).
