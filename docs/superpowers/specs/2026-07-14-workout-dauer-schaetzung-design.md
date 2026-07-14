# Workout-Dauer-Schätzung — Design

**Datum:** 2026-07-14
**Status:** Entwurf, vom Nutzer freigegeben

## Ziel

Der Nutzer soll die voraussichtliche Dauer des **gesamten Workouts über alle Tabs
hinweg** schätzen lassen können. Nutzer teilen ein Workout häufig in Tabs auf (z. B.
Warmup / MetCon / Cooldown); daher ist die Summe über alle Tabs die sinnvolle
Schätzung. Die Schätzung erfolgt AI-basiert (Server-seitig über Claude Haiku, wie die
bestehende Generierung) und zeigt eine **Gesamtdauer plus Aufschlüsselung** in
benannte Abschnitte an — bevorzugt ein Abschnitt pro Tab, mit dem Tab-Titel als Label.

Alle Tabs mit nicht-leerem Inhalt gehen samt Titel in die Schätzung ein. Die Schätzung
ist read-only, ephemeral und wird weder persistiert noch über die Session
synchronisiert.

## Nicht-Ziele (YAGNI)

- Kein Übernehmen der Dauer in den Countdown-Timer.
- Keine Persistenz, kein Session-Sync des Ergebnisses.
- Keine lokale Heuristik / kein Offline-Fallback.
- Keine Historie mehrerer Schätzungen.

## Architektur & Datenfluss

Spiegelt den bestehenden Generate-Flow, aber ohne Schreiben in den Tab-Inhalt:

```
WorkoutEditor (Uhr-Button, .tab-estimate)
   → estimateDuration(tabs)                 [frontend/src/lib/generate/estimate.ts]
   → POST /estimate { tabs: [{title,content}] }  [server/src/index.ts Route → estimate.ts]
   → Claude Haiku, System-Prompt "Schätze die Dauer …", JSON-Antwort
   → { totalMinutes, segments: [{ label, minutes }] }
   → Popover rendert Ergebnis
```

- **Modell:** `claude-haiku-4-5` (gleich wie Generate).
- **Geteilte Infrastruktur:** derselbe Rate-Limiter (`createRateLimiter(10, 60_000)`)
  und `hasApiKey`-Check wie `/generate`.
- **Eingabe:** alle Tabs mit nicht-leerem Inhalt, jeweils `{ title, content }`. Der
  Server serialisiert sie zu einem Prompt (Tab-Titel als Überschrift je Abschnitt).
- **Cap:** kombinierte Länge aller Tab-Inhalte ≤ `maxPromptChars = 2000`; hartes
  Body-Limit der Route auf 16384 Bytes angehoben (Generate bleibt bei 4096).

## Datentypen

Frontend (`frontend/src/lib/generate/estimate.ts`):

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
  segments: DurationSegment[] // 0..n, kann leer sein
}
```

Request-Body: `{ tabs: EstimateTab[] }` (nur Tabs mit nicht-leerem `content`).
Server-Antwort-Body bei Erfolg: `{ estimate: DurationEstimate }`.
Server-Antwort-Body bei Fehler: `{ error: string }` (deutsche Meldung).

## Server

### `server/src/estimate.ts` (neu)

Analog zu `generate.ts`:

- `ESTIMATE_CONFIG`: `{ model: 'claude-haiku-4-5', maxTokens, maxPromptChars: 2000,
  systemPrompt }`.
  - System-Prompt: erklärt, dass die Eingabe ein Workout ist, das der Nutzer **in
    benannte Abschnitte (Tabs)** aufgeteilt haben kann (z. B. Warmup / MetCon /
    Cooldown). Claude soll die Gesamtdauer schätzen und **ausschließlich striktes
    JSON** im Schema `{ "totalMinutes": number, "segments": [{ "label": string,
    "minutes": number }] }` zurückgeben — keine Einleitung, keine Markdown-Fences,
    keine Erklärung. **Bevorzugt ein Abschnitt pro Tab, mit dem Tab-Titel als
    Label.** Labels auf Deutsch, kurz. `segments` darf leer sein, wenn keine klaren
    Phasen erkennbar sind.
- `buildPrompt(tabs: EstimateTab[]): string` (rein, unit-getestet): serialisiert die
  Tabs zu einem Text, jeweils mit dem Titel als Überschrift, gefolgt vom Inhalt.
- `handleEstimate(input: { tabs: unknown; ip: string }, deps)`:
  - `hasApiKey()` false → `{ status: 503, body: { error: 'Schätzung ist nicht konfiguriert.' } }`
  - `rateLimiter.allow(ip)` false → `{ status: 429, body: { error: 'Zu viele Anfragen. Bitte kurz warten.' } }`
  - Validierung: `tabs` ist Array von `{ title: string, content: string }`; nach
    Filtern leerer Inhalte ≥ 1 Tab; kombinierte Content-Länge ≤ `maxPromptChars`.
    Sonst → `{ status: 400, body: { error: 'Ungültiger Workout-Text.' } }`
  - Erfolg → ruft `deps.estimateDuration(tabs)`, das ein validiertes
    `DurationEstimate` liefert → `{ status: 200, body: { estimate } }`
  - Fehler (inkl. Parsing/Schema) → `{ status: 500, body: { error: 'Schätzung fehlgeschlagen.' } }`
- `hasApiKey()`: identisch zu generate (kann geteilt/importiert werden).
- `estimateDuration(tabs)`: dünner SDK-Wrapper (nicht unit-getestet). `buildPrompt`,
  ruft Claude, extrahiert Text-Blocks, **strippt Code-Fences defensiv** (wie
  `formatWorkout`), `JSON.parse`, dann `parseEstimate`.
- `parseEstimate(raw: unknown): DurationEstimate` (rein, unit-getestet): validiert
  Schema — `totalMinutes` endliche positive Zahl; `segments` Array aus
  `{ label: nicht-leerer String, minutes: endliche nicht-negative Zahl }`. Bei
  Abweichung `throw`. Diese Funktion ist die testbare Kern-Logik.

### `server/src/index.ts` (Route)

Neue Route `if (req.url === '/estimate' && req.method === 'POST')`, die das Muster der
`/generate`-Route spiegelt: IP-Extraktion, `raw`-Akkumulation mit **16384-Byte-Cap**
(größer als bei Generate wegen mehrerer Tabs), JSON-Parse mit 400 bei Fehler, dann
`handleEstimate({ tabs: JSON.parse(raw).tabs, ip }, …)`.

`startServer`-`opts` wird um `estimateDuration?` erweitert (für Test-Injektion,
analog zu `generateWorkout?`).

> Anmerkung: Body-Lesen ist zwischen `/generate` und `/estimate` identisch. Ein
> Extrahieren in einen `readJsonBody`-Helfer ist optional und darf im Zuge dieser
> Arbeit erfolgen, ist aber kein Muss (bestehendes Muster wird sonst nur dupliziert).

## Frontend

### `frontend/src/lib/generate/estimate.ts` (neu)

```ts
export async function estimateDuration(tabs: EstimateTab[]): Promise<DurationEstimate>
```

Ruft `POST /estimate` mit `{ tabs }`, parst `{ estimate }` bei OK, wirft
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

- Button disabled, wenn `estimating` oder **alle** Tabs leer/nur Whitespace sind.
- Ladephase: dezenter Puls/Spinner am Uhr-Button (kein Vollbild-Overlay wie bei
  Generate — Editor bleibt bedienbar).
- Bei Klick: alle Tabs mit nicht-leerem Inhalt als `EstimateTab[]` sammeln
  (`{ title, content }`), `estimateDuration(tabs)`.
- Die Schätzung gilt für das **gesamte Workout** (alle Tabs), nicht für einen
  einzelnen Tab. Sie wird beim Tab-Wechsel **nicht** verworfen.
- `onInput` setzt `estimateStale = true`, falls ein `estimate` offen ist (Änderung an
  irgendeinem Tab macht das Ergebnis veraltet).

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
- Der Nutzer kann während einer laufenden Schätzung den Tab wechseln oder tippen; das
  beeinflusst den laufenden Request nicht (Ergebnis gilt global). Tippen setzt
  anschließend `estimateStale`.
- Kombinierte Content-Länge über `maxPromptChars` → 400 (im Popover angezeigt).
- Kaputtes/nicht-schema-konformes JSON von Claude → 500 (im Server via `parseEstimate`
  abgefangen).
- Nach Reload ist die Schätzung weg (kein Persistieren).

## Tests (Vitest)

- **`server/test/estimate.test.ts`** — `handleEstimate` mit gemocktem
  `estimateDuration`: 503- / 429- / 400-Pfade (leere/nur-Whitespace Tabs, kombinierter
  Content über Cap), Erfolg (200 + `{ estimate }`). Plus `parseEstimate`: gültiges
  JSON → Objekt; fehlende/falsch-typisierte Felder → `throw`; Code-Fence-Stripping.
  Plus `buildPrompt`: Tabs werden mit Titeln serialisiert.
- **`server/test/estimateHttp.test.ts`** — Route-Verdrahtung via `startServer(0,
  { estimateDuration })`: 200-Erfolg, `not json` → 400, leeres `tabs`-Array → 400.
- **`frontend/src/lib/generate/estimate.test.ts`** — `fetch` gemockt: OK → parst zu
  `DurationEstimate`; sendet `{ tabs }`; Fehler-Body; Nicht-OK-Status wirft.
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
