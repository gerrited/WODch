# Workout-Dauer-Schätzung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Nutzer schätzt per Uhr-Button die Gesamtdauer seines Workouts über alle Tabs hinweg; Claude Haiku liefert Gesamtdauer plus Aufschlüsselung, angezeigt in einem Popover.

**Architecture:** Neuer Server-Endpoint `POST /estimate` (spiegelt `/generate`) nimmt alle nicht-leeren Tabs `{title, content}`, baut daraus einen Prompt, ruft Claude Haiku und validiert die JSON-Antwort strikt server-seitig. Ein Frontend-Client `estimate.ts` ruft den Endpoint; `WorkoutEditor.svelte` fügt Button, lokalen State und Popover hinzu. Die Schätzung ist ephemeral (kein Sync, keine Persistenz).

**Tech Stack:** TypeScript, Node `node:http`, `@anthropic-ai/sdk`, Svelte 5 (Runes), Vitest.

## Global Constraints

- Modell: `claude-haiku-4-5` (identisch zu Generate).
- Alle UI-Texte und Fehlermeldungen auf Deutsch, mit korrekten Umlauten.
- Geteilte Infrastruktur: Rate-Limiter `createRateLimiter(10, 60_000)` und `hasApiKey` wie bei `/generate`.
- Kombinierte Content-Länge aller Tabs ≤ 2000 Zeichen; hartes Body-Limit der `/estimate`-Route: 16384 Bytes.
- Antwort-Schema strikt: `{ totalMinutes: number > 0, segments: [{ label: string (nicht leer), minutes: number ≥ 0 }] }`. `segments` darf leer sein.
- Bevorzugt ein Segment pro Tab, Label = Tab-Titel.
- Keine Persistenz, kein Session-Sync, kein Timer-Übernehmen.
- Tests: `vitest run` (server: `cd server && npm test`, frontend: `cd frontend && npm test`).

---

### Task 1: Server-Modul `estimate.ts` (Kernlogik)

**Files:**
- Create: `server/src/estimate.ts`
- Test: `server/test/estimate.test.ts`

**Interfaces:**
- Consumes: `RateLimiter` aus `./rateLimit.js`; `hasApiKey` aus `./generate.js`.
- Produces:
  - `interface EstimateTab { title: string; content: string }`
  - `interface DurationSegment { label: string; minutes: number }`
  - `interface DurationEstimate { totalMinutes: number; segments: DurationSegment[] }`
  - `interface EstimateDeps { rateLimiter: RateLimiter; hasApiKey: () => boolean; estimateDuration: (tabs: EstimateTab[]) => Promise<DurationEstimate> }`
  - `function handleEstimate(input: { tabs: unknown; ip: string }, deps: EstimateDeps): Promise<{ status: number; body: object }>`
  - `function buildPrompt(tabs: EstimateTab[]): string`
  - `function parseEstimate(raw: unknown): DurationEstimate` (wirft bei Schema-Verletzung)
  - `function stripCodeFences(raw: string): string`
  - `function estimateDuration(tabs: EstimateTab[]): Promise<DurationEstimate>` (SDK-Wrapper, nicht unit-getestet)
  - `const ESTIMATE_CONFIG`

- [ ] **Step 1: Testdatei schreiben (`server/test/estimate.test.ts`)**

```ts
import { describe, it, expect } from 'vitest'
import {
  handleEstimate,
  parseEstimate,
  buildPrompt,
  stripCodeFences,
  type EstimateDeps,
  type EstimateTab,
} from '../src/estimate.ts'
import { createRateLimiter } from '../src/rateLimit.ts'

const OK_ESTIMATE = { totalMinutes: 18, segments: [{ label: 'Warmup', minutes: 4 }] }

function deps(overrides: Partial<EstimateDeps> = {}): EstimateDeps {
  return {
    rateLimiter: createRateLimiter(10, 60000),
    hasApiKey: () => true,
    estimateDuration: async () => OK_ESTIMATE,
    ...overrides,
  }
}

const tabs: EstimateTab[] = [{ title: 'MetCon', content: '21-15-9 Thruster' }]

describe('handleEstimate', () => {
  it('liefert bei Erfolg 200 mit der Schätzung', async () => {
    const res = await handleEstimate({ tabs, ip: '1.1.1.1' }, deps())
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ estimate: OK_ESTIMATE })
  })

  it('liefert 503 ohne API-Key', async () => {
    const res = await handleEstimate({ tabs, ip: '1.1.1.1' }, deps({ hasApiKey: () => false }))
    expect(res.status).toBe(503)
  })

  it('liefert 400 bei fehlendem tabs-Array', async () => {
    const res = await handleEstimate({ tabs: 'nope', ip: '1.1.1.1' }, deps())
    expect(res.status).toBe(400)
  })

  it('liefert 400 wenn alle Tabs leer sind', async () => {
    const res = await handleEstimate({ tabs: [{ title: 'x', content: '   ' }], ip: '1.1.1.1' }, deps())
    expect(res.status).toBe(400)
  })

  it('liefert 400 bei falsch typisierten Tab-Feldern', async () => {
    const res = await handleEstimate({ tabs: [{ title: 1, content: 'a' }], ip: '1.1.1.1' }, deps())
    expect(res.status).toBe(400)
  })

  it('liefert 400 wenn der kombinierte Inhalt zu lang ist', async () => {
    const big = [{ title: 'a', content: 'x'.repeat(2001) }]
    const res = await handleEstimate({ tabs: big, ip: '1.1.1.1' }, deps())
    expect(res.status).toBe(400)
  })

  it('filtert leere Tabs heraus, bevor estimateDuration aufgerufen wird', async () => {
    let received: EstimateTab[] = []
    const d = deps({
      estimateDuration: async (t) => {
        received = t
        return OK_ESTIMATE
      },
    })
    await handleEstimate(
      { tabs: [{ title: 'leer', content: '  ' }, { title: 'voll', content: 'Fran' }], ip: '1.1.1.1' },
      d,
    )
    expect(received).toEqual([{ title: 'voll', content: 'Fran' }])
  })

  it('liefert 429 wenn das Rate-Limit überschritten ist', async () => {
    const d = deps({ rateLimiter: createRateLimiter(1, 60000) })
    const first = await handleEstimate({ tabs, ip: '9.9.9.9' }, d)
    const second = await handleEstimate({ tabs, ip: '9.9.9.9' }, d)
    expect(first.status).toBe(200)
    expect(second.status).toBe(429)
  })

  it('liefert 500 wenn estimateDuration wirft', async () => {
    const d = deps({
      estimateDuration: async () => {
        throw new Error('upstream')
      },
    })
    const res = await handleEstimate({ tabs, ip: '1.1.1.1' }, d)
    expect(res.status).toBe(500)
  })
})

describe('parseEstimate', () => {
  it('akzeptiert gültiges Schema', () => {
    expect(parseEstimate({ totalMinutes: 12, segments: [{ label: 'Workout', minutes: 12 }] })).toEqual({
      totalMinutes: 12,
      segments: [{ label: 'Workout', minutes: 12 }],
    })
  })

  it('akzeptiert leere segments', () => {
    expect(parseEstimate({ totalMinutes: 5, segments: [] })).toEqual({ totalMinutes: 5, segments: [] })
  })

  it('wirft bei fehlendem totalMinutes', () => {
    expect(() => parseEstimate({ segments: [] })).toThrow()
  })

  it('wirft bei totalMinutes <= 0', () => {
    expect(() => parseEstimate({ totalMinutes: 0, segments: [] })).toThrow()
  })

  it('wirft bei segments ohne label', () => {
    expect(() => parseEstimate({ totalMinutes: 5, segments: [{ minutes: 5 }] })).toThrow()
  })

  it('wirft bei negativen minutes', () => {
    expect(() => parseEstimate({ totalMinutes: 5, segments: [{ label: 'x', minutes: -1 }] })).toThrow()
  })
})

describe('stripCodeFences', () => {
  it('entfernt umschließende ```-Fences', () => {
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })

  it('lässt reines JSON unverändert', () => {
    expect(stripCodeFences('{"a":1}')).toBe('{"a":1}')
  })
})

describe('buildPrompt', () => {
  it('serialisiert Tabs mit Titeln', () => {
    const p = buildPrompt([
      { title: 'Warmup', content: '3 Runden' },
      { title: 'MetCon', content: 'Fran' },
    ])
    expect(p).toContain('Warmup')
    expect(p).toContain('3 Runden')
    expect(p).toContain('MetCon')
    expect(p).toContain('Fran')
  })
})
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `cd server && npx vitest run test/estimate.test.ts`
Expected: FAIL — `Cannot find module '../src/estimate.ts'`

- [ ] **Step 3: `server/src/estimate.ts` implementieren**

```ts
import Anthropic from '@anthropic-ai/sdk'
import type { RateLimiter } from './rateLimit.js'

export const ESTIMATE_CONFIG = {
  model: 'claude-haiku-4-5',
  maxTokens: 400,
  maxPromptChars: 2000,
  systemPrompt:
    'Du bist ein erfahrener CrossFit- und Gym-Coach. Der Nutzer gibt dir ein Workout, das ' +
    'er in benannte Abschnitte (Tabs, z. B. Warmup, MetCon, Cooldown) aufgeteilt haben kann. ' +
    'Schätze die realistische Gesamtdauer in Minuten. Gib ausschließlich striktes JSON im ' +
    'Schema {"totalMinutes": number, "segments": [{"label": string, "minutes": number}]} ' +
    'zurück — keine Einleitung, keine Markdown-Fences, keine Erklärung. Erzeuge bevorzugt ' +
    'einen Abschnitt pro Tab und nutze den Tab-Titel als Label. Labels kurz und auf Deutsch. ' +
    'segments darf leer sein, wenn keine klaren Phasen erkennbar sind.',
} as const

export interface EstimateTab {
  title: string
  content: string
}

export interface DurationSegment {
  label: string
  minutes: number
}

export interface DurationEstimate {
  totalMinutes: number
  segments: DurationSegment[]
}

export interface EstimateDeps {
  rateLimiter: RateLimiter
  hasApiKey: () => boolean
  estimateDuration: (tabs: EstimateTab[]) => Promise<DurationEstimate>
}

export interface EstimateResult {
  status: number
  body: object
}

// Validiert das rohe tabs-Feld und filtert leere Inhalte. null = ungültige Struktur.
function validateTabs(input: unknown): EstimateTab[] | null {
  if (!Array.isArray(input)) return null
  const tabs: EstimateTab[] = []
  for (const t of input) {
    if (typeof t !== 'object' || t === null) return null
    const o = t as Record<string, unknown>
    if (typeof o.title !== 'string' || typeof o.content !== 'string') return null
    if (o.content.trim() === '') continue
    tabs.push({ title: o.title, content: o.content })
  }
  return tabs
}

export async function handleEstimate(
  input: { tabs: unknown; ip: string },
  deps: EstimateDeps,
): Promise<EstimateResult> {
  if (!deps.hasApiKey()) {
    return { status: 503, body: { error: 'Schätzung ist nicht konfiguriert.' } }
  }
  if (!deps.rateLimiter.allow(input.ip)) {
    return { status: 429, body: { error: 'Zu viele Anfragen. Bitte kurz warten.' } }
  }
  const tabs = validateTabs(input.tabs)
  const combined = tabs?.reduce((n, t) => n + t.content.length, 0) ?? 0
  if (!tabs || tabs.length === 0 || combined > ESTIMATE_CONFIG.maxPromptChars) {
    return { status: 400, body: { error: 'Ungültiger Workout-Text.' } }
  }
  try {
    const estimate = await deps.estimateDuration(tabs)
    return { status: 200, body: { estimate } }
  } catch {
    return { status: 500, body: { error: 'Schätzung fehlgeschlagen.' } }
  }
}

export function buildPrompt(tabs: EstimateTab[]): string {
  return tabs.map((t) => `## ${t.title}\n${t.content}`).join('\n\n')
}

// Entfernt umschließende ```-Code-Fences (optional mit Sprach-Angabe).
export function stripCodeFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```[^\n]*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim()
}

export function parseEstimate(raw: unknown): DurationEstimate {
  if (typeof raw !== 'object' || raw === null) throw new Error('Kein Objekt')
  const o = raw as Record<string, unknown>
  if (typeof o.totalMinutes !== 'number' || !Number.isFinite(o.totalMinutes) || o.totalMinutes <= 0) {
    throw new Error('totalMinutes ungültig')
  }
  if (!Array.isArray(o.segments)) throw new Error('segments ungültig')
  const segments = o.segments.map((s): DurationSegment => {
    if (typeof s !== 'object' || s === null) throw new Error('Segment ungültig')
    const seg = s as Record<string, unknown>
    if (typeof seg.label !== 'string' || seg.label.trim() === '') throw new Error('label ungültig')
    if (typeof seg.minutes !== 'number' || !Number.isFinite(seg.minutes) || seg.minutes < 0) {
      throw new Error('minutes ungültig')
    }
    return { label: seg.label, minutes: seg.minutes }
  })
  return { totalMinutes: o.totalMinutes, segments }
}

// Dünner SDK-Wrapper — bewusst nicht unit-getestet (kein Live-Call in Tests).
export async function estimateDuration(tabs: EstimateTab[]): Promise<DurationEstimate> {
  const client = new Anthropic()
  const response = await client.messages.create({
    model: ESTIMATE_CONFIG.model,
    max_tokens: ESTIMATE_CONFIG.maxTokens,
    system: ESTIMATE_CONFIG.systemPrompt,
    messages: [{ role: 'user', content: buildPrompt(tabs) }],
  })
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
  return parseEstimate(JSON.parse(stripCodeFences(text)))
}
```

- [ ] **Step 4: Test ausführen, Erfolg bestätigen**

Run: `cd server && npx vitest run test/estimate.test.ts`
Expected: PASS (alle Tests grün)

- [ ] **Step 5: Committen**

```bash
git add server/src/estimate.ts server/test/estimate.test.ts
git commit -m "feat(server): add estimate module for workout duration

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `/estimate`-Route verdrahten

**Files:**
- Modify: `server/src/index.ts` (Import, `startServer`-opts, neue Route)
- Test: `server/test/estimateHttp.test.ts`

**Interfaces:**
- Consumes: `handleEstimate`, `estimateDuration` (default), `EstimateTab` aus `./estimate.js`; `hasApiKey` aus `./generate.js`.
- Produces: `startServer(port, opts)` akzeptiert zusätzlich `estimateDuration?: (tabs: EstimateTab[]) => Promise<DurationEstimate>`.

- [ ] **Step 1: Testdatei schreiben (`server/test/estimateHttp.test.ts`)**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { startServer, type RunningServer } from '../src/index.ts'

let server: RunningServer
let base: string

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key'
  server = await startServer(0, {
    estimateDuration: async () => ({ totalMinutes: 15, segments: [{ label: 'MetCon', minutes: 15 }] }),
  })
  base = `http://127.0.0.1:${server.port}`
})

afterAll(async () => {
  await server.close()
  delete process.env.ANTHROPIC_API_KEY
})

describe('POST /estimate', () => {
  it('gibt eine Schätzung zurück', async () => {
    const res = await fetch(`${base}/estimate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tabs: [{ title: 'MetCon', content: 'Fran' }] }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      estimate: { totalMinutes: 15, segments: [{ label: 'MetCon', minutes: 15 }] },
    })
  })

  it('lehnt fehlerhaftes JSON mit 400 ab', async () => {
    const res = await fetch(`${base}/estimate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    })
    expect(res.status).toBe(400)
  })

  it('lehnt leeres tabs-Array mit 400 ab', async () => {
    const res = await fetch(`${base}/estimate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tabs: [] }),
    })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `cd server && npx vitest run test/estimateHttp.test.ts`
Expected: FAIL — `/estimate` liefert 404 (Route existiert nicht), Erfolgs-Test schlägt fehl.

- [ ] **Step 3: Import in `server/src/index.ts` ergänzen**

Ersetze die bestehende generate-Import-Zeile:

```ts
import { handleGenerate, hasApiKey, generateWorkout as defaultGenerateWorkout } from './generate.js'
```

durch:

```ts
import { handleGenerate, hasApiKey, generateWorkout as defaultGenerateWorkout } from './generate.js'
import {
  handleEstimate,
  estimateDuration as defaultEstimateDuration,
  type EstimateTab,
  type DurationEstimate,
} from './estimate.js'
```

- [ ] **Step 4: `startServer`-Signatur und Default in `server/src/index.ts` erweitern**

Ersetze:

```ts
export function startServer(
  port: number,
  opts: { generateWorkout?: (prompt: string) => Promise<string> } = {},
): Promise<RunningServer> {
  const store = createStore()
  const rateLimiter = createRateLimiter(10, 60_000)
  const generateWorkout = opts.generateWorkout ?? defaultGenerateWorkout
```

durch:

```ts
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
```

- [ ] **Step 5: `/estimate`-Route in `server/src/index.ts` einfügen**

Direkt **nach** dem schließenden `return` des `/generate`-Blocks (nach der Zeile `return` bei `}` der generate-Route, vor `res.writeHead(404)`) einfügen:

```ts
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
```

- [ ] **Step 6: Tests ausführen (gesamte Server-Suite)**

Run: `cd server && npm test`
Expected: PASS — inkl. neuer `estimateHttp.test.ts`, bestehende Tests weiterhin grün.

- [ ] **Step 7: Committen**

```bash
git add server/src/index.ts server/test/estimateHttp.test.ts
git commit -m "feat(server): wire POST /estimate route

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Frontend-Client `estimate.ts`

**Files:**
- Create: `frontend/src/lib/generate/estimate.ts`
- Test: `frontend/src/lib/generate/estimate.test.ts`

**Interfaces:**
- Produces:
  - `interface EstimateTab { title: string; content: string }`
  - `interface DurationSegment { label: string; minutes: number }`
  - `interface DurationEstimate { totalMinutes: number; segments: DurationSegment[] }`
  - `function estimateDuration(tabs: EstimateTab[]): Promise<DurationEstimate>`

- [ ] **Step 1: Testdatei schreiben (`frontend/src/lib/generate/estimate.test.ts`)**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { estimateDuration } from './estimate'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('estimateDuration', () => {
  it('gibt die Schätzung bei Erfolg zurück', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ estimate: { totalMinutes: 18, segments: [{ label: 'MetCon', minutes: 18 }] } }),
            { status: 200 },
          ),
      ),
    )
    const res = await estimateDuration([{ title: 'MetCon', content: 'Fran' }])
    expect(res).toEqual({ totalMinutes: 18, segments: [{ label: 'MetCon', minutes: 18 }] })
  })

  it('sendet die Tabs im Request-Body', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ estimate: { totalMinutes: 5, segments: [] } }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await estimateDuration([{ title: 'Warmup', content: '3 Runden' }])
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toEqual({ tabs: [{ title: 'Warmup', content: '3 Runden' }] })
  })

  it('wirft mit der Server-Fehlermeldung bei Fehler-Status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Zu viele Anfragen.' }), { status: 429 })),
    )
    await expect(estimateDuration([{ title: 'x', content: 'a' }])).rejects.toThrow('Zu viele Anfragen.')
  })

  it('wirft Default-Fehler bei fehlender estimate', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })))
    await expect(estimateDuration([{ title: 'x', content: 'a' }])).rejects.toThrow('Schätzung fehlgeschlagen.')
  })
})
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `cd frontend && npx vitest run src/lib/generate/estimate.test.ts`
Expected: FAIL — `Cannot find module './estimate'`

- [ ] **Step 3: `frontend/src/lib/generate/estimate.ts` implementieren**

```ts
export interface EstimateTab {
  title: string
  content: string
}

export interface DurationSegment {
  label: string
  minutes: number
}

export interface DurationEstimate {
  totalMinutes: number
  segments: DurationSegment[]
}

export async function estimateDuration(tabs: EstimateTab[]): Promise<DurationEstimate> {
  const res = await fetch('/estimate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tabs }),
  })
  let data: { estimate?: DurationEstimate; error?: string } = {}
  try {
    data = await res.json()
  } catch {
    // Body leer/kein JSON — fällt unten auf Default-Fehler zurück
  }
  if (!res.ok || !data.estimate) {
    throw new Error(data.error ?? 'Schätzung fehlgeschlagen.')
  }
  return data.estimate
}
```

- [ ] **Step 4: Test ausführen, Erfolg bestätigen**

Run: `cd frontend && npx vitest run src/lib/generate/estimate.test.ts`
Expected: PASS

- [ ] **Step 5: Committen**

```bash
git add frontend/src/lib/generate/estimate.ts frontend/src/lib/generate/estimate.test.ts
git commit -m "feat(frontend): add estimate client

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: WorkoutEditor — Uhr-Button, State, Popover

**Files:**
- Modify: `frontend/src/lib/components/WorkoutEditor.svelte`
- Test: `frontend/src/lib/components/WorkoutEditor.test.ts` (neuer `describe`-Block anhängen)

**Interfaces:**
- Consumes: `estimateDuration`, `EstimateTab`, `DurationEstimate` aus `../generate/estimate`; `workouts` Store.

- [ ] **Step 1: Failing UI-Test anhängen (`frontend/src/lib/components/WorkoutEditor.test.ts`)**

Am Dateiende anhängen:

```ts
describe('WorkoutEditor Dauer-Schätzung', () => {
  beforeEach(() => {
    workouts.applyRemote({
      tabs: [
        { id: 'w1', title: 'Warmup', content: '3 Runden' },
        { id: 'w2', title: 'MetCon', content: 'Fran' },
      ],
      activeTab: 0,
    })
    component = mount(WorkoutEditor, { target: document.body })
    flushSync()
  })

  afterEach(() => {
    unmount(component)
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('zeigt das Popover mit Gesamtdauer und Segmenten nach Klick', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              estimate: { totalMinutes: 18, segments: [{ label: 'MetCon', minutes: 18 }] },
            }),
            { status: 200 },
          ),
      ),
    )
    ;(document.querySelector('[data-tour="estimate"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(document.querySelector('.estimate-popover')).not.toBeNull())
    expect(document.querySelector('.estimate-total')?.textContent).toContain('18')
    expect(document.querySelector('.estimate-popover')?.textContent).toContain('MetCon')
  })

  it('sendet alle nicht-leeren Tabs an den Endpoint', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ estimate: { totalMinutes: 5, segments: [] } }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    ;(document.querySelector('[data-tour="estimate"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.tabs).toEqual([
      { title: 'Warmup', content: '3 Runden' },
      { title: 'MetCon', content: 'Fran' },
    ])
  })

  it('deaktiviert den Button, wenn alle Tabs leer sind', () => {
    workouts.applyRemote({ tabs: [{ id: 'w1', title: 'Warmup', content: '   ' }], activeTab: 0 })
    flushSync()
    const btn = document.querySelector('[data-tour="estimate"]') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('zeigt eine Fehlermeldung im Popover bei Fehler-Status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'kaputt' }), { status: 500 })),
    )
    ;(document.querySelector('[data-tour="estimate"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(document.querySelector('.estimate-error')).not.toBeNull())
    expect(document.querySelector('.estimate-error')?.textContent).toContain('kaputt')
  })
})
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `cd frontend && npx vitest run src/lib/components/WorkoutEditor.test.ts`
Expected: FAIL — `[data-tour="estimate"]` existiert nicht (null-Klick wirft).

- [ ] **Step 3: Script-Block in `WorkoutEditor.svelte` erweitern**

Ergänze den Import (nach der bestehenden generate-Import-Zeile, Zeile 6):

```ts
  import { estimateDuration, type EstimateTab, type DurationEstimate } from '../generate/estimate'
```

Ergänze nach den bestehenden `showGenerate`/`generating`-States (nach Zeile 21) den Estimate-State und die Logik:

```ts
  let estimating = $state(false)
  let estimate = $state<DurationEstimate | null>(null)
  let estimateError = $state<string | null>(null)
  let estimateStale = $state(false)
  let hasContent = $derived(workouts.tabs.some((t) => t.content.trim() !== ''))

  function collectTabs(): EstimateTab[] {
    return workouts.tabs
      .filter((t) => t.content.trim() !== '')
      .map((t) => ({ title: t.title, content: t.content }))
  }

  async function runEstimate() {
    const tabs = collectTabs()
    if (tabs.length === 0 || estimating) return
    estimateError = null
    estimateStale = false
    estimating = true
    try {
      estimate = await estimateDuration(tabs)
    } catch (e) {
      estimate = null
      estimateError = e instanceof Error ? e.message : 'Schätzung fehlgeschlagen.'
    } finally {
      estimating = false
    }
  }

  function closeEstimate() {
    estimate = null
    estimateError = null
    estimateStale = false
  }
```

- [ ] **Step 4: `onInput` um Stale-Markierung erweitern**

Ersetze in `WorkoutEditor.svelte`:

```ts
  function onInput() {
    if (!editorEl) return
    if (getText(editorEl).trim() === '') editorEl.replaceChildren()
    workouts.setContent(workouts.activeTab, getText(editorEl))
  }
```

durch:

```ts
  function onInput() {
    if (!editorEl) return
    if (getText(editorEl).trim() === '') editorEl.replaceChildren()
    workouts.setContent(workouts.activeTab, getText(editorEl))
    if (estimate) estimateStale = true
  }
```

- [ ] **Step 5: Escape-Taste ans Popover koppeln**

Ergänze in `WorkoutEditor.svelte` direkt vor `<div class="workout-wrapper" ...>` ein Window-Keydown-Handler nur, wenn noch keiner existiert. Füge stattdessen minimal invasiv den Handler als Attribut über `<svelte:window>` hinzu — direkt nach der `<script>`-Sektion (vor der ersten `<div>`):

```svelte
<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape' && (estimate || estimateError)) closeEstimate()
  }}
/>
```

- [ ] **Step 6: Uhr-Button in die Tab-Leiste einfügen**

Ersetze in `WorkoutEditor.svelte` den `.tab-magic`-Button-Block (das gesamte `<button class="tab-magic" ...> … </button>`) durch einen gemeinsamen rechtsbündigen Wrapper mit beiden Buttons:

```svelte
    <div class="tab-actions">
      <button
        class="tab-magic"
        data-tour="ai-generate"
        title="Workout mit AI erstellen"
        aria-label="Workout mit AI erstellen"
        onclick={openGenerate}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path
            d="M12 2l1.6 4.6L18 8.2l-4.4 1.6L12 14.4l-1.6-4.6L6 8.2l4.4-1.6L12 2zM19 13l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9L19 13zM5 14l.7 2 2 .7-2 .7L5 19.4l-.7-2-2-.7 2-.7L5 14z"
          />
        </svg>
      </button>
      <button
        class="tab-estimate"
        data-tour="estimate"
        title="Dauer schätzen"
        aria-label="Dauer schätzen"
        class:busy={estimating}
        disabled={estimating || !hasContent}
        onclick={runEstimate}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="12" cy="13" r="8" />
          <path d="M12 13V9" stroke-linecap="round" />
          <path d="M9 2h6" stroke-linecap="round" />
        </svg>
      </button>
    </div>
```

Hinweis: Da `.tab-magic` bislang `margin-left: auto` trug, muss diese Regel im `<style>` vom Button auf `.tab-actions` umziehen (siehe Step 8).

- [ ] **Step 7: Popover-Markup nach dem `.editor-area`-Block einfügen**

Ergänze in `WorkoutEditor.svelte` direkt **nach** dem schließenden `</div>` von `.editor-area` (vor dem schließenden `</div>` von `.workout-wrapper`):

```svelte
    {#if estimate || estimateError}
      <div class="estimate-popover" role="dialog" aria-label="Geschätzte Dauer">
        <button class="estimate-close" onclick={closeEstimate} aria-label="Schließen">✕</button>
        {#if estimateError}
          <div class="estimate-error">{estimateError}</div>
        {:else if estimate}
          <div class="estimate-total">~ {estimate.totalMinutes} Min</div>
          {#if estimateStale}
            <div class="estimate-stale">Text geändert — neu schätzen</div>
          {/if}
          {#if estimate.segments.length > 0}
            <div class="estimate-divider"></div>
            {#each estimate.segments as seg}
              <div class="estimate-seg">
                <span class="estimate-seg-label">{seg.label}</span>
                <span class="estimate-seg-min">~{seg.minutes} Min</span>
              </div>
            {/each}
          {/if}
        {/if}
      </div>
    {/if}
```

- [ ] **Step 8: Styles in `WorkoutEditor.svelte` ergänzen/anpassen**

Ersetze im `<style>`-Block die Regel:

```css
  .tab-magic {
    background: none;
    border: none;
    color: #444;
    cursor: pointer;
    padding: 0 14px;
    line-height: 1;
    margin-left: auto;
    display: flex;
    align-items: center;
  }
```

durch (das `margin-left: auto` wandert auf den Wrapper):

```css
  .tab-actions {
    display: flex;
    align-items: stretch;
    margin-left: auto;
  }
  .tab-magic,
  .tab-estimate {
    background: none;
    border: none;
    color: #444;
    cursor: pointer;
    padding: 0 14px;
    line-height: 1;
    display: flex;
    align-items: center;
  }
  .tab-estimate:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .tab-estimate.busy {
    animation: estimate-pulse 1s ease-in-out infinite;
  }
  @keyframes estimate-pulse {
    0%,
    100% {
      opacity: 0.4;
    }
    50% {
      opacity: 1;
    }
  }
  .tab-estimate svg {
    width: 18px;
    height: 18px;
    display: block;
  }
```

Und ergänze die `.tab-magic:hover`-Regel um den Estimate-Button:

```css
  .tab-magic:hover,
  .tab-estimate:hover:not(:disabled) {
    color: #fff;
  }
```

(Ersetze dazu die bestehende `.tab-magic:hover { color: #fff; }`-Regel.)

Füge am Ende des `<style>`-Blocks die Popover-Styles hinzu:

```css
  .estimate-popover {
    position: absolute;
    top: 44px;
    right: 8px;
    z-index: 50;
    background: #111;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 16px 18px;
    min-width: 220px;
    font-family: 'JetBrains Mono', monospace;
    color: #ccc;
    text-align: left;
  }
  .estimate-close {
    position: absolute;
    top: 8px;
    right: 10px;
    background: none;
    border: none;
    color: #666;
    font-size: 13px;
    cursor: pointer;
    padding: 2px 4px;
  }
  .estimate-close:hover {
    color: #fff;
  }
  .estimate-total {
    color: #7cc;
    font-size: 22px;
    letter-spacing: 1px;
  }
  .estimate-stale {
    color: #b58a4a;
    font-size: 11px;
    margin-top: 4px;
  }
  .estimate-divider {
    border-top: 1px solid #2a2a2a;
    margin: 12px 0 8px;
  }
  .estimate-seg {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    font-size: 13px;
    padding: 2px 0;
  }
  .estimate-seg-label {
    color: #999;
  }
  .estimate-seg-min {
    color: #ccc;
  }
  .estimate-error {
    color: #e63946;
    font-size: 13px;
  }
```

Hinweis: `.workout-wrapper` muss `position: relative` haben, damit das absolut positionierte Popover korrekt sitzt. Ergänze `position: relative;` in der `.workout-wrapper`-Regel.

- [ ] **Step 9: Tests ausführen, Erfolg bestätigen**

Run: `cd frontend && npx vitest run src/lib/components/WorkoutEditor.test.ts`
Expected: PASS (neue und bestehende Tests grün)

- [ ] **Step 10: Vollständige Frontend-Suite + Typecheck**

Run: `cd frontend && npm test && npx svelte-check --tsconfig ./tsconfig.json`
Expected: Tests PASS; svelte-check ohne Fehler.

- [ ] **Step 11: Committen**

```bash
git add frontend/src/lib/components/WorkoutEditor.svelte frontend/src/lib/components/WorkoutEditor.test.ts
git commit -m "feat(frontend): add duration estimate button and popover

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Manuelle Verifikation (nach Task 4)

1. `cd server && ANTHROPIC_API_KEY=<key> npm run dev` und `cd frontend && npm run dev`.
2. Workout in mehrere Tabs aufteilen (Warmup / MetCon / Cooldown), Inhalte eintragen.
3. Uhr-Button klicken → Puls während Ladephase, danach Popover mit `~ N Min` und einer Zeile pro Tab.
4. Text in einem Tab ändern → „Text geändert"-Hinweis erscheint im offenen Popover.
5. Alle Tab-Inhalte leeren → Uhr-Button ist ausgegraut/deaktiviert.
6. Escape / ✕ / erneuter Klick → Popover schließt bzw. schätzt neu.
