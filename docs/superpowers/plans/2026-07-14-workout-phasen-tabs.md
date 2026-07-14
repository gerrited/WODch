# Workout-Phasen als eigene Tabs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Beim KI-Generieren teilt die KI das Workout ggf. in Phasen auf; jede Phase wird zu einem eigenen Workout-Tab (Phase 1 ersetzt den aktiven Tab, weitere Phasen werden angehängt).

**Architecture:** Das Backend splittet den generierten Rohtext an Marker-Zeilen (`=== Titel ===`) in `parsePhases` und liefert `{ phases: {title, content}[] }`. Das Frontend formatiert jede Phase mit dem bestehenden `formatWorkout` und der Store verteilt die Phasen über `applyGenerated` auf die Tabs.

**Tech Stack:** TypeScript, Svelte 5 (Runes), Vitest, Node http, `@anthropic-ai/sdk`, `nanoid`.

## Global Constraints

- Alle Nutzertexte/Fehlermeldungen auf Deutsch, mit korrekten Umlauten (ä/ö/ü/ß).
- Tests mit Vitest: `npm test` in `frontend/` bzw. `server/`.
- Der `generateWorkout`-Dependency behält die Signatur `(prompt: string) => Promise<string>` (liefert Rohtext); das Aufteilen passiert in `parsePhases`, nicht im SDK-Wrapper.
- `formatWorkout` bleibt der einzige Ort für Fence-Entfernung + Padding und lebt weiterhin im Frontend (`frontend/src/lib/generate/generate.ts`). Das Backend formatiert Phasen-Inhalte NICHT.

---

### Task 1: Backend — `parsePhases` + Contract auf `{ phases }` umstellen

**Files:**
- Modify: `server/src/generate.ts`
- Test: `server/test/generate.test.ts`
- Test: `server/test/generateHttp.test.ts:27-28`

**Interfaces:**
- Produces: `interface Phase { title: string; content: string }` (exportiert aus `server/src/generate.ts`)
- Produces: `parsePhases(raw: string): Phase[]` — splittet an Marker-Zeilen; keine Marker ⇒ genau eine Phase mit `title: ''`; leere (nur Whitespace) Phasen werden verworfen; `content` ist der getrimmte Rohtext der Phase (KEIN `formatWorkout`).
- Produces: `handleGenerate(...)` liefert bei Erfolg `{ status: 200, body: { phases: Phase[] } }`.
- Consumes: `RateLimiter` aus `./rateLimit.js` (unverändert).

- [ ] **Step 1: Failing-Tests für `parsePhases` schreiben**

Am Ende von `server/test/generate.test.ts` ergänzen (Import oben um `parsePhases` erweitern: `import { handleGenerate, parsePhases, type GenerateDeps } from '../src/generate.ts'`):

```typescript
describe('parsePhases', () => {
  it('ohne Marker: eine Phase mit leerem Titel', () => {
    expect(parsePhases('FÜR ZEIT\n21-15-9')).toEqual([{ title: '', content: 'FÜR ZEIT\n21-15-9' }])
  })

  it('mehrere Marker: je eine Phase mit Titel und Inhalt', () => {
    const raw = '=== Warm-up ===\nRun 400m\n=== Metcon ===\n21-15-9\nThruster'
    expect(parsePhases(raw)).toEqual([
      { title: 'Warm-up', content: 'Run 400m' },
      { title: 'Metcon', content: '21-15-9\nThruster' },
    ])
  })

  it('verwirft Phasen ohne Inhalt', () => {
    const raw = '=== Warm-up ===\n\n=== Metcon ===\n21-15-9'
    expect(parsePhases(raw)).toEqual([{ title: 'Metcon', content: '21-15-9' }])
  })

  it('ignoriert reine Trennlinien ohne Titel', () => {
    expect(parsePhases('======\nFRAN')).toEqual([{ title: '', content: '======\nFRAN' }])
  })

  it('trimmt umgebenden Whitespace der Phase', () => {
    expect(parsePhases('=== A ===\n\n  FRAN  \n\n')).toEqual([{ title: 'A', content: 'FRAN' }])
  })
})
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `cd server && npm test -- generate.test.ts`
Expected: FAIL — `parsePhases` ist kein Export.

- [ ] **Step 3: `parsePhases`, Contract, Prompt und maxTokens implementieren**

In `server/src/generate.ts`:

`GENERATE_CONFIG` anpassen (maxTokens hoch, Prompt mit Marker-Instruktion):

```typescript
export const GENERATE_CONFIG = {
  model: 'claude-haiku-4-5',
  maxTokens: 1500,
  maxPromptChars: 500,
  systemPrompt:
    'Du bist ein erfahrener CrossFit- und Gym-Coach. Erstelle aus dem Wunsch des ' +
    'Nutzers ein Workout als reinen, zentrierbaren Monospace-Text — keine Einleitung, ' +
    'keine Markdown-Formatierung, keine Erklärungen. Wenn es sinnvoll ist, gliedere das ' +
    'Workout in Phasen (z. B. Warm-up, das eigentliche Workout, Skill/Accessory, ' +
    'Cooldown). Trenne jede Phase durch eine eigene Zeile im Format "=== Titel ===" ' +
    'direkt vor ihrem Inhalt, wobei Titel ein kurzer Phasenname ist. Gib bei einem ' +
    'einfachen Workout ohne sinnvolle Phasen einfach nur das Workout ohne solche ' +
    'Trennzeilen zurück. Halte dich kurz.',
} as const
```

`Phase`-Typ und `parsePhases` ergänzen (z. B. direkt unter `GENERATE_CONFIG`):

```typescript
export interface Phase {
  title: string
  content: string
}

const PHASE_MARKER = /^\s*={2,}\s*(.+?)\s*={2,}\s*$/

// Splittet den Rohtext an Marker-Zeilen "=== Titel ===". Ohne Marker entsteht
// genau eine Phase mit leerem Titel. Leere Phasen werden verworfen.
export function parsePhases(raw: string): Phase[] {
  const phases: Phase[] = []
  let current: { title: string; lines: string[] } | null = null
  const flush = () => {
    if (!current) return
    const content = current.lines.join('\n').trim()
    if (content) phases.push({ title: current.title, content })
    current = null
  }
  for (const line of raw.split('\n')) {
    const m = PHASE_MARKER.exec(line)
    if (m && /[^\s=]/.test(m[1])) {
      flush()
      current = { title: m[1].trim(), lines: [] }
    } else {
      if (!current) current = { title: '', lines: [] }
      current.lines.push(line)
    }
  }
  flush()
  return phases
}
```

In `handleGenerate` den Erfolgs-Zweig umstellen:

```typescript
  try {
    const raw = await deps.generateWorkout(prompt)
    return { status: 200, body: { phases: parsePhases(raw) } }
  } catch {
    return { status: 500, body: { error: 'Generierung fehlgeschlagen.' } }
  }
```

- [ ] **Step 4: `parsePhases`-Tests laufen lassen — müssen bestehen**

Run: `cd server && npm test -- generate.test.ts`
Expected: PASS für die `parsePhases`-Tests; der `handleGenerate`-Erfolgstest schlägt noch fehl (erwartet altes `{ workout }`).

- [ ] **Step 5: `handleGenerate`-Erfolgstest auf neuen Contract anpassen**

In `server/test/generate.test.ts` den Test „liefert bei Erfolg 200 mit dem Workout" ändern zu:

```typescript
  it('liefert bei Erfolg 200 mit Phasen', async () => {
    const res = await handleGenerate({ prompt: 'kurzes AMRAP', ip: '1.1.1.1' }, deps())
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      phases: [{ title: '', content: 'FÜR ZEIT\n21-15-9\nThruster\nPull-up' }],
    })
  })

  it('splittet mehrere Phasen aus dem Generat', async () => {
    const d = deps({ generateWorkout: async () => '=== Warm-up ===\nRun\n=== Metcon ===\n21-15-9' })
    const res = await handleGenerate({ prompt: 'x', ip: '2.2.2.2' }, d)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      phases: [
        { title: 'Warm-up', content: 'Run' },
        { title: 'Metcon', content: '21-15-9' },
      ],
    })
  })
```

- [ ] **Step 6: HTTP-Integrationstest anpassen**

In `server/test/generateHttp.test.ts` den Erfolgstest (Zeilen 27–28) ändern:

```typescript
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ phases: [{ title: '', content: 'WORKOUT für: Beine' }] })
```

- [ ] **Step 7: Komplette Server-Tests laufen lassen**

Run: `cd server && npm test`
Expected: PASS (alle Suites grün).

- [ ] **Step 8: Commit**

```bash
git add server/src/generate.ts server/test/generate.test.ts server/test/generateHttp.test.ts
git commit -m "feat(generate): Backend liefert Workout-Phasen statt Einzeltext

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Frontend — `requestWorkout` liefert `Phase[]`

**Files:**
- Modify: `frontend/src/lib/generate/generate.ts`
- Test: `frontend/src/lib/generate/generate.test.ts`

**Interfaces:**
- Consumes: Backend-Antwort `{ phases: { title: string; content: string }[] }`.
- Produces: `interface Phase { title: string; content: string }` (exportiert).
- Produces: `requestWorkout(prompt: string): Promise<Phase[]>` — wendet `formatWorkout` auf jeden Phasen-`content` an; wirft bei Fehler-Status oder fehlendem/leerem `phases`.
- `formatWorkout`, `PHRASES`, `nextPhraseIndex` bleiben unverändert.

- [ ] **Step 1: Failing-Tests schreiben**

`frontend/src/lib/generate/generate.test.ts` — den `requestWorkout`-Block ersetzen durch:

```typescript
describe('requestWorkout', () => {
  it('gibt formatierte Phasen bei Erfolg zurück', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ phases: [{ title: '', content: 'FRAN' }] }), { status: 200 }),
      ),
    )
    expect(await requestWorkout('leicht')).toEqual([{ title: '', content: '\n\nFRAN\n\n' }])
  })

  it('gibt mehrere formatierte Phasen zurück', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              phases: [
                { title: 'Warm-up', content: 'Run' },
                { title: 'Metcon', content: '21-15-9' },
              ],
            }),
            { status: 200 },
          ),
      ),
    )
    expect(await requestWorkout('x')).toEqual([
      { title: 'Warm-up', content: '\n\nRun\n\n' },
      { title: 'Metcon', content: '\n\n21-15-9\n\n' },
    ])
  })

  it('wirft mit der Server-Fehlermeldung bei Fehler-Status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Zu viele Anfragen.' }), { status: 429 })),
    )
    await expect(requestWorkout('x')).rejects.toThrow('Zu viele Anfragen.')
  })

  it('wirft bei leerem Phasen-Array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ phases: [] }), { status: 200 })),
    )
    await expect(requestWorkout('x')).rejects.toThrow('Generierung fehlgeschlagen.')
  })
})
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `cd frontend && npm test -- generate.test.ts`
Expected: FAIL — `requestWorkout` liefert noch einen String.

- [ ] **Step 3: `requestWorkout` umbauen**

In `frontend/src/lib/generate/generate.ts` den `Phase`-Typ ergänzen und `requestWorkout` ersetzen (`formatWorkout` bleibt darunter unverändert):

```typescript
export interface Phase {
  title: string
  content: string
}

export async function requestWorkout(prompt: string): Promise<Phase[]> {
  const res = await fetch('/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  let data: { phases?: { title?: string; content?: string }[]; error?: string } = {}
  try {
    data = await res.json()
  } catch {
    // Body leer/kein JSON — fällt unten auf Default-Fehler zurück
  }
  if (!res.ok || !Array.isArray(data.phases) || data.phases.length === 0) {
    throw new Error(data.error ?? 'Generierung fehlgeschlagen.')
  }
  return data.phases.map((p) => ({
    title: typeof p.title === 'string' ? p.title : '',
    content: formatWorkout(p.content ?? ''),
  }))
}
```

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `cd frontend && npm test -- generate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/generate/generate.ts frontend/src/lib/generate/generate.test.ts
git commit -m "feat(generate): requestWorkout liefert formatierte Phasen

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Store — `applyGenerated` verteilt Phasen auf Tabs

**Files:**
- Modify: `frontend/src/lib/stores/workouts.svelte.ts`
- Test: `frontend/src/lib/stores/workouts.test.ts`

**Interfaces:**
- Consumes: `Phase` aus `../generate/generate` (`{ title, content }`).
- Produces: `applyGenerated(active: number, phases: Phase[]): void` auf `WorkoutStore` — eine Phase: nur `content` des aktiven Tabs setzen, Titel unverändert; mehrere Phasen: aktiven Tab mit Phase 1 (Titel wenn nicht leer + Content) überschreiben, restliche Phasen als neue Tabs mit eigener `nanoid`-`id` direkt hinter dem aktiven Tab einfügen, `activeTab` bleibt = `active`. Feuert `onStructure?.(snapshot())` genau einmal.

- [ ] **Step 1: Failing-Tests schreiben**

In `frontend/src/lib/stores/workouts.test.ts` ergänzen (der bestehende `import { WorkoutStore }` reicht):

```typescript
  it('applyGenerated mit einer Phase setzt nur Inhalt, Titel bleibt', () => {
    const spy = vi.fn()
    store.onStructure = spy
    store.applyGenerated(0, [{ title: '', content: 'FRAN' }])
    expect(store.tabs).toHaveLength(1)
    expect(store.tabs[0].title).toBe('Workout 1')
    expect(store.tabs[0].content).toBe('FRAN')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('applyGenerated mit mehreren Phasen ersetzt aktiven Tab und hängt an', () => {
    const spy = vi.fn()
    store.onStructure = spy
    store.applyGenerated(0, [
      { title: 'Warm-up', content: 'Run' },
      { title: 'Metcon', content: '21-15-9' },
      { title: 'Cooldown', content: 'Stretch' },
    ])
    expect(store.tabs).toHaveLength(3)
    expect(store.tabs.map((t) => t.title)).toEqual(['Warm-up', 'Metcon', 'Cooldown'])
    expect(store.tabs.map((t) => t.content)).toEqual(['Run', '21-15-9', 'Stretch'])
    expect(store.activeTab).toBe(0)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('applyGenerated fügt neue Tabs hinter dem aktiven ein', () => {
    store.addTab() // Tab 2, activeTab = 1
    store.applyGenerated(1, [
      { title: 'A', content: 'a' },
      { title: 'B', content: 'b' },
    ])
    expect(store.tabs.map((t) => t.title)).toEqual(['Workout 1', 'A', 'B'])
    expect(store.activeTab).toBe(1)
  })
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `cd frontend && npm test -- workouts.test.ts`
Expected: FAIL — `applyGenerated` existiert nicht.

- [ ] **Step 3: `applyGenerated` implementieren**

In `frontend/src/lib/stores/workouts.svelte.ts` den Import erweitern und die Methode ergänzen (z. B. nach `setContent`):

Import oben:

```typescript
import type { Phase } from '../generate/generate'
```

Methode:

```typescript
  applyGenerated(active: number, phases: Phase[]) {
    if (phases.length === 0) return
    this.tabs[active].content = phases[0].content
    if (phases.length > 1) {
      if (phases[0].title) this.tabs[active].title = phases[0].title
      const newTabs = phases.slice(1).map((p) => ({
        id: nanoid(6),
        title: p.title || 'Workout',
        content: p.content,
      }))
      this.tabs.splice(active + 1, 0, ...newTabs)
      this.activeTab = active
    }
    this.onStructure?.(this.snapshot())
  }
```

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `cd frontend && npm test -- workouts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/stores/workouts.svelte.ts frontend/src/lib/stores/workouts.test.ts
git commit -m "feat(workouts): applyGenerated verteilt Phasen auf Tabs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `WorkoutEditor` — Generat über `applyGenerated` einspielen

**Files:**
- Modify: `frontend/src/lib/components/WorkoutEditor.svelte:36-39`

**Interfaces:**
- Consumes: `requestWorkout(prompt): Promise<Phase[]>` (Task 2), `workouts.applyGenerated(active, phases)` (Task 3).

- [ ] **Step 1: Aufruf umstellen**

In `frontend/src/lib/components/WorkoutEditor.svelte`, im `try`-Block von `runGenerate`:

Vorher:

```javascript
      const workout = await requestWorkout(prompt)
      workouts.setContent(target, workout)
```

Nachher:

```javascript
      const phases = await requestWorkout(prompt)
      workouts.applyGenerated(target, phases)
```

- [ ] **Step 2: Typecheck + komplette Frontend-Tests laufen lassen**

Run: `cd frontend && npm run build && npm test`
Expected: `svelte-check` ohne Fehler, alle Vitest-Suites grün.

- [ ] **Step 3: Manuelle End-to-End-Prüfung**

Server mit `ANTHROPIC_API_KEY` starten und im Frontend ein Workout mit klaren Phasen generieren (z. B. „20 Min AMRAP mit Warm-up und Cooldown"). Erwartung: aktiver Tab enthält die erste Phase (Titel übernommen), weitere Phasen erscheinen als zusätzliche Tabs dahinter; ein einfacher Prompt ohne Phasen erzeugt weiterhin genau einen Tab.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/components/WorkoutEditor.svelte
git commit -m "feat(WorkoutEditor): Phasen als eigene Tabs einspielen

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec-Abdeckung:**
- Backend-Contract `{ phases }` + Marker-Prompt + `parsePhases` + maxTokens → Task 1.
- Frontend `requestWorkout: Phase[]` + `formatWorkout` pro Phase → Task 2.
- Store `applyGenerated` (1 Phase / n Phasen, `onStructure` genau 1×) → Task 3.
- Aufruf in `WorkoutEditor.runGenerate` → Task 4.
- Tests (parsePhases, requestWorkout, applyGenerated, generateHttp) → in den jeweiligen Tasks.

**Typ-Konsistenz:** `Phase { title, content }` in Backend (Task 1) und Frontend (Task 2) identisch; `applyGenerated(active, phases)` konsistent zwischen Task 3 (Definition) und Task 4 (Aufruf). `generateWorkout`-Signatur bleibt `(prompt) => Promise<string>` — keine Änderung an `index.ts` nötig.

**YAGNI:** kein User-Toggle, kein fester Phasen-Katalog, keine Session-Migration.
