# Workout-Dauer-Schätzung — Design

**Datum:** 2026-07-14
**Status:** Entwurf, vom Nutzer freigegeben

## Ziel

Der Nutzer soll die voraussichtliche Dauer des Workouts im **aktuell aktiven Tab**
schätzen lassen können. Die Schätzung erfolgt AI-basiert (Server-seitig über Claude
Haiku, wie die bestehende Generierung) und zeigt eine **Gesamtdauer plus kurze
Aufschlüsselung** in benannte Abschnitte an.

Nur der aktive Tab wird verwendet. Die Schätzung ist read-only, ephemeral und wird
weder persistiert noch über die Session synchronisiert.

## Nicht-Ziele (YAGNI)

- Kein Übernehmen der Dauer in den Countdown-Timer.
- Keine Persistenz, kein Session-Sync des Ergebnisses.
- Keine lokale Heuristik / kein Offline-Fallback.
- Keine Historie mehrerer Schätzungen.
- Keine Schätzung über mehrere Tabs hinweg.

## Architektur & Datenfluss

Spiegelt den bestehenden Generate-Flow, aber ohne Schreiben in den Tab-Inhalt:

```
WorkoutEditor (Uhr-Button, .tab-estimate)
   → estimateDuration(content)              [frontend/src/lib/generate/estimate.ts]
   → POST /estimate { content }             [server/src/index.ts Route → estimate.ts]
   → Claude Haiku, System-Prompt "Schätze die Dauer …", JSON-Antwort
   → { totalMinutes, segments: [{ label, minutes }] }
   → Popover rendert Ergebnis
```

- **Modell:** `claude-haiku-4-5` (gleich wie Generate).
- **Geteilte Infrastruktur:** derselbe Rate-Limiter (`createRateLimiter(10, 60_000)`)
  und `hasApiKey`-Check wie `/generate`.
- **Prompt-Cap:** gleiche Zeichengrenze wie Generate (`maxPromptChars = 500`),
  gleiches hartes Body-Limit (4096 Bytes) in der Route.

## Datentypen

Frontend (`frontend/src/lib/generate/estimate.ts`):

```ts
export interface DurationSegment {
  label: string
  minutes: number
}

export interface DurationEstimate {
  totalMinutes: number
  segments: DurationSegment[] // 0..n, kann leer sein
}
```

Server-Antwort-Body bei Erfolg: `{ estimate: DurationEstimate }`.
Server-Antwort-Body bei Fehler: `{ error: string }` (deutsche Meldung).

## Server

### `server/src/estimate.ts` (neu)

Analog zu `generate.ts`:

- `ESTIMATE_CONFIG`: `{ model: 'claude-haiku-4-5', maxTokens, maxPromptChars: 500,
  systemPrompt }`.
  - System-Prompt: fordert Claude auf, die Dauer eines gegebenen Workouts zu schätzen
    und **ausschließlich striktes JSON** im Schema `{ "totalMinutes": number,
    "segments": [{ "label": string, "minutes": number }] }` zurückzugeben — keine
    Einleitung, keine Markdown-Fences, keine Erklärung. Labels auf Deutsch, kurz
    (z. B. "Warmup", "Workout", "Cooldown"). `segments` darf leer sein, wenn das
    Workout keine klaren Phasen hat.
- `handleEstimate(input: { content: unknown; ip: string }, deps)`:
  - `hasApiKey()` false → `{ status: 503, body: { error: 'Schätzung ist nicht konfiguriert.' } }`
  - `rateLimiter.allow(ip)` false → `{ status: 429, body: { error: 'Zu viele Anfragen. Bitte kurz warten.' } }`
  - leerer / > `maxPromptChars` Content → `{ status: 400, body: { error: 'Ungültiger Workout-Text.' } }`
  - Erfolg → ruft `deps.estimateDuration(content)`, das ein validiertes
    `DurationEstimate` liefert → `{ status: 200, body: { estimate } }`
  - Fehler (inkl. Parsing/Schema) → `{ status: 500, body: { error: 'Schätzung fehlgeschlagen.' } }`
- `hasApiKey()`: identisch zu generate (kann geteilt/importiert werden).
- `estimateDuration(content)`: dünner SDK-Wrapper (nicht unit-getestet). Ruft Claude,
  extrahiert Text-Blocks, **strippt Code-Fences defensiv** (wie `formatWorkout`),
  `JSON.parse`, dann `parseEstimate`.
- `parseEstimate(raw: unknown): DurationEstimate` (rein, unit-getestet): validiert
  Schema — `totalMinutes` endliche positive Zahl; `segments` Array aus
  `{ label: nicht-leerer String, minutes: endliche nicht-negative Zahl }`. Bei
  Abweichung `throw`. Diese Funktion ist die testbare Kern-Logik.

### `server/src/index.ts` (Route)

Neue Route `if (req.url === '/estimate' && req.method === 'POST')`, die das exakte
Muster der `/generate`-Route spiegelt: IP-Extraktion, `raw`-Akkumulation mit
4096-Byte-Cap, JSON-Parse mit 400 bei Fehler, dann `handleEstimate`.

`startServer`-`opts` wird um `estimateDuration?` erweitert (für Test-Injektion,
analog zu `generateWorkout?`).

> Anmerkung: Body-Lesen ist zwischen `/generate` und `/estimate` identisch. Ein
> Extrahieren in einen `readJsonBody`-Helfer ist optional und darf im Zuge dieser
> Arbeit erfolgen, ist aber kein Muss (bestehendes Muster wird sonst nur dupliziert).

## Frontend

### `frontend/src/lib/generate/estimate.ts` (neu)

```ts
export async function estimateDuration(content: string): Promise<DurationEstimate>
```

Ruft `POST /estimate` mit `{ content }`, parst `{ estimate }` bei OK, wirft
`Error(data.error ?? 'Schätzung fehlgeschlagen.')` bei Nicht-OK oder fehlendem
`estimate`. Muster wie `requestWorkout`.

### `frontend/src/lib/components/WorkoutEditor.svelte`

**Auslöser:** Neuer Button `.tab-estimate` mit Uhr-SVG, direkt rechts neben
`.tab-magic`. Damit beide rechten Buttons zusammen rechtsbündig sitzen, wandert das
`margin-left: auto` von `.tab-magic` auf einen gemeinsamen Wrapper (oder auf den
ersten der beiden Buttons). Gleicher Stil: `color: #444`, Hover `#fff`, 18px SVG.

**Lokaler State** (nicht in Session):

- `estimating: boolean`
- `estimate: DurationEstimate | null`
- `estimateError: string | null`
- `estimateStale: boolean`

**Verhalten:**

- Button disabled, wenn `estimating` oder aktiver Tab-Content leer/nur Whitespace.
- Ladephase: dezenter Puls/Spinner am Uhr-Button (kein Vollbild-Overlay wie bei
  Generate — Editor bleibt bedienbar).
- Bei Klick: `target = workouts.activeTab` merken, `estimateDuration(content)`.
  Ergebnis nur anwenden, wenn `workouts.activeTab === target` (gleiches Muster wie
  `runGenerate`).
- `onInput` setzt `estimateStale = true`, falls ein `estimate` offen ist.
- Tab-Wechsel (`activeTab` ändert sich): `estimate`, `estimateError`, `estimateStale`
  zurücksetzen (Ergebnis gehört zu genau einem Tab).

**Popover:** Erscheint unterhalb der Tab-Leiste, rechtsbündig unter dem Uhr-Button.
Panel im GenerateDialog-Stil (`#111`, `1px solid #333`, radius 8px, Monospace).

```
┌─ Geschätzte Dauer ────────┐
│  ~ 18 Min           ✕     │
│  ─────────────────────    │
│  Warmup      ~4 Min       │
│  Workout     ~12 Min      │
│  Cooldown    ~2 Min       │
└───────────────────────────┘
```

- Kopf: große Gesamtdauer `~ {totalMinutes} Min`, rechts ✕ zum Schließen.
- Je Segment eine Zeile `label` … `~{minutes} Min`.
- Leere Segmentliste → nur Gesamtdauer, keine Trennlinie.
- Schließt bei ✕, Escape, Klick außerhalb.
- Bei `estimateStale`: dezenter Hinweis „Text geändert" im Popover (kein hartes
  Verschwinden); der Nutzer kann neu schätzen.
- Fehler: `estimateError` wird im Popover angezeigt (nicht im Editor).

## Fehlerbehandlung & Edge-Cases

- 503 / 429 / 400 → jeweilige deutsche Meldung im Popover.
- Segment-Minuten müssen sich nicht exakt zur Gesamtdauer summieren; die Gesamtdauer
  ist maßgeblich und prominent.
- Tab-Wechsel während laufendem Request: Ergebnis wird verworfen, wenn Ziel-Tab nicht
  mehr aktiv.
- Kaputtes/nicht-schema-konformes JSON von Claude → 500 (im Server via `parseEstimate`
  abgefangen).
- Nach Reload ist die Schätzung weg (kein Persistieren).

## Tests (Vitest)

- **`server/test/estimate.test.ts`** — `handleEstimate` mit gemocktem
  `estimateDuration`: 503- / 429- / 400-Pfade, Erfolg (200 + `{ estimate }`).
  Plus `parseEstimate`: gültiges JSON → Objekt; fehlende/falsch-typisierte Felder →
  `throw`; Code-Fence-Stripping.
- **`server/test/estimateHttp.test.ts`** — Route-Verdrahtung via `startServer(0,
  { estimateDuration })`: 200-Erfolg, `not json` → 400, leerer Content → 400.
- **`frontend/src/lib/generate/estimate.test.ts`** — `fetch` gemockt: OK → parst zu
  `DurationEstimate`; Fehler-Body; Nicht-OK-Status wirft.
- UI-State (`stale`/`disabled`) wird — wie GenerateDialog — leichtgewichtig getestet,
  soweit sinnvoll isolierbar.

## Betroffene / neue Dateien

Neu:
- `server/src/estimate.ts`
- `server/test/estimate.test.ts`
- `server/test/estimateHttp.test.ts`
- `frontend/src/lib/generate/estimate.ts`
- `frontend/src/lib/generate/estimate.test.ts`

Geändert:
- `server/src/index.ts` (Route + `startServer`-opts)
- `frontend/src/lib/components/WorkoutEditor.svelte` (Button, State, Popover, Styles)
