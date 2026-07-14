# Workout-Phasen als eigene Tabs — Design

**Datum:** 2026-07-14
**Status:** Entwurf, freigegeben

## Ziel

Beim KI-Generieren eines Workouts teilt die KI das Ergebnis **ggf.** in Phasen
auf (z. B. Warm-up, Haupt-WOD, Cooldown, Accessory/Skill). Jede Phase wird zu
einem eigenen Workout-Tab. Phase 1 ersetzt den aktuell aktiven Tab, weitere
Phasen werden als neue Tabs direkt dahinter angehängt. Die KI vergibt die
Phasen-Titel frei. Liefert die KI ein einfaches Workout ohne sinnvolle Phasen,
bleibt es bei genau einem Tab — identisch zum heutigen Verhalten.

## Kontext (Ist-Zustand)

- Generierungs-Fluss: `WorkoutEditor.svelte` → `runGenerate(prompt)` →
  `requestWorkout(prompt)` (`frontend/src/lib/generate/generate.ts`) → POST
  `/generate` → Backend `handleGenerate` (`server/src/generate.ts`) liefert
  `{ workout: string }` → `workouts.setContent(activeTab, workout)`.
- Backend generiert bislang **einen** Text als reinen, zentrierbaren
  Monospace-Text.
- Tab-Modell: `WorkoutTab = { id, title, content }`
  (`frontend/src/lib/stores/workouts.svelte.ts`).
- Session-Sync propagiert Struktur-Änderungen über
  `onStructure?.(snapshot())`.

## Entscheidungen

- **Tab-Verhalten:** aktiven Tab mit Phase 1 ersetzen, restliche Phasen anhängen.
- **Phasen-Titel:** die KI vergibt Titel frei (kein fester Katalog).
- **Aufteilung:** die KI entscheidet, ob überhaupt aufgeteilt wird ("ggf.").

## Umsetzung

### 1. Backend-Contract (`server/src/generate.ts`)

`/generate` liefert künftig `{ phases: { title: string, content: string }[] }`
statt `{ workout: string }`.

- **System-Prompt** angepasst: Phasen werden durch eine Markerzeile mit Titel
  getrennt (robuster als JSON, da der Monospace-/ASCII-Text sonst
  JSON-Escaping bräuchte). Format:

  ```
  === Warm-up ===
  …Inhalt…
  === Metcon ===
  …Inhalt…
  ```

  Instruktion an die KI: Nur aufteilen, wenn sinnvoll (z. B. eigenes Warm-up,
  Skill/Accessory, Cooldown). Ein einfaches Workout gibt **eine** Phase **ohne**
  Marker zurück.
- Neue reine Funktion `parsePhases(raw): { title, content }[]`:
  - Splittet an Markerzeilen (`/^\s*={2,}\s*(.+?)\s*={2,}\s*$/`).
  - Wendet die bestehende `formatWorkout`-Säuberung pro Phasen-Content an
    (Code-Fences entfernen, Padding).
  - Keine Marker ⇒ genau eine Phase mit leerem Titel (`title: ''`).
  - Leere Phasen (nur Whitespace) werden verworfen.
- `handleGenerate` gibt `{ phases }` zurück; Fehlerfälle (kein API-Key,
  Rate-Limit, ungültiger Prompt, Exception) bleiben unverändert.
- `maxTokens` moderat anheben (mehrere Phasen brauchen mehr Platz), Wert im
  Plan festlegen.

### 2. Frontend-Datenschicht (`frontend/src/lib/generate/generate.ts`)

- Neuer Typ `Phase = { title: string; content: string }`.
- `requestWorkout(prompt): Promise<Phase[]>` (statt `Promise<string>`):
  - Parst die neue `{ phases }`-Antwort.
  - `formatWorkout` wird pro Phasen-`content` angewendet (bleibt als
    Hilfsfunktion erhalten und getestet).
  - Fehlt `phases` oder ist es leer ⇒ `throw new Error(...)` wie bisher.

### 3. Store (`frontend/src/lib/stores/workouts.svelte.ts`)

Neue Methode `applyGenerated(active: number, phases: Phase[])`:

- **Eine Phase:** nur `content` des aktiven Tabs setzen, Titel unangetastet
  (heutiges Verhalten).
- **Mehrere Phasen:** aktiven Tab mit Phase 1 (Titel + Content) überschreiben,
  restliche Phasen als neue Tabs mit eigener `nanoid`-`id` direkt hinter dem
  aktiven Tab einfügen; `activeTab` bleibt auf Phase 1.
- Feuert **genau einmal** `onStructure?.(snapshot())`, damit die Session-Sync
  die komplette neue Tab-Struktur überträgt (nicht mehrere Einzel-Events).

### 4. Aufruf (`frontend/src/lib/components/WorkoutEditor.svelte`)

`runGenerate` ruft `const phases = await requestWorkout(prompt)` und danach
`workouts.applyGenerated(target, phases)`. Lade-Phrasen und Fehlerbehandlung
bleiben unverändert.

## Tests

- `parsePhases`: kein Marker, mehrere Marker, leere/Whitespace-Phasen,
  umgebender Whitespace.
- `requestWorkout`: neue Antwortform, Fehlerfall (fehlendes/leeres `phases`).
- Store `applyGenerated`: eine Phase (Titel bleibt), n Phasen (ersetzen +
  anhängen, `onStructure` genau 1× gefeuert, `activeTab` korrekt).
- Bestehende `generateHttp`-Tests auf neuen Contract anpassen.

## Bewusst weggelassen (YAGNI)

- Kein User-Toggle „aufteilen ja/nein".
- Kein fester Phasen-Katalog.
- Keine Migration alter Sessions (rein Client-seitig, kein Persistenzformat
  betroffen).
