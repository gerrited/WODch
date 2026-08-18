# Ein einziger Custom-Timer — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die 10 benannten Custom-Interval-Slots werden durch einen einzigen, namenlosen Custom-Timer ersetzt, der sich die zuletzt benutzten Werte gerätelokal merkt.

**Architecture:** Drei Schichten sind betroffen und werden in dieser Reihenfolge geändert: Server-Validierung (akzeptiert `'custom'` zusätzlich zur Legacy-Form), dann Frontend-Typ + Store (Liste → einzelnes Objekt, neuer localStorage-Key), dann UI (zehn Radio-Einträge → einer, Name-Feld weg). Server zuerst, damit zu keinem Zeitpunkt ein Client ein Preset schickt, das der Server ablehnt.

**Tech Stack:** Svelte 5 (Runes: `$state`, `$derived`), TypeScript, Vitest. Zwei npm-Pakete: `frontend/` und `server/`, jedes mit eigenem `npm test` (= `vitest run`).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-28-ein-custom-intervall-design.md` — bei Widersprüchen gilt die Spec.
- **Branch:** `feat/ein-custom-intervall` (existiert bereits, die Spec ist dort committet). Nicht auf `main` committen.
- **Preset-Wert:** exakt der String `'custom'` (Kleinschreibung, kein Suffix).
- **localStorage-Key neu:** `wodch-custom-interval` (Singular). Alter Key: `wodch-custom-intervals` (Plural) — wird nur noch gelöscht, nie gelesen.
- **`CustomInterval` hat kein `name`-Feld mehr.** Kein Fallback-Name, kein Text-Input, keine `Custom N`-Labels.
- **Keine Migration** alter Slot-Daten.
- **`IntervalPreset` muss in `frontend/src/lib/types.ts` und `server/src/types.ts` identisch bleiben** — beide Dateien pflegen dieselbe Definition von Hand (kein gemeinsames Paket).
- **UI-Texte deutsch**, Label des Presets exakt `Custom`.
- **Test-Kommandos:** Frontend `npm test --prefix frontend`, Server `npm test --prefix server`. Einzelne Datei: `npm test --prefix frontend -- src/lib/stores/timer.test.ts`.
- **TDD:** in jeder Task erst der Test, Rot sehen, dann Implementierung, Grün sehen, dann Commit.

---

### Task 1: Server akzeptiert das Preset `'custom'`

Der Server validiert eingehende `timer`-Patches. Ohne diese Änderung würde er `preset: 'custom'` als ungültig ablehnen und die Sync-Updates still verwerfen. Die Legacy-Form `custom-<zahl>` bleibt gültig, damit alte, noch offene Browser-Tabs (Gym-Display) weiter syncen.

**Files:**
- Modify: `server/src/types.ts:2`
- Modify: `server/src/store.ts:33,41`
- Test: `server/test/store.test.ts:153-159`

**Interfaces:**
- Consumes: nichts.
- Produces: `IntervalPreset` mit dem Member `'custom'`; `isTimerDoc` akzeptiert `preset: 'custom'` und weiterhin `preset: 'custom-3'`.

- [ ] **Step 1: Test anpassen und einen Legacy-Fall ergänzen**

In `server/test/store.test.ts` den Test ab Zeile 153 ersetzen durch:

```ts
  it('akzeptiert valide Ränder (custom-Preset, startedAt null)', () => {
    const store = createStore()
    store.create('s1', makeDoc())
    expect(store.applyPatch('s1', 'timer', makeTimer({ preset: 'custom' }), 2)).toBe(true)
    expect(store.applyPatch('s1', 'video', { isPlaying: false, startedAt: null, accumulatedSeconds: 0 }, 3)).toBe(true)
    expect(store.applyPatch('s1', 'workouts', { tabs: [], activeTab: 0 }, 4)).toBe(true)
  })

  it('akzeptiert weiterhin das Legacy-Preset custom-<n> alter Clients', () => {
    const store = createStore()
    store.create('s1', makeDoc())
    expect(store.applyPatch('s1', 'timer', makeTimer({ preset: 'custom-3' as never }), 2)).toBe(true)
  })
```

Hinweis: `as never` ist nötig, weil `'custom-3'` nach der Typänderung kein gültiger `IntervalPreset` mehr ist — der Test prüft bewusst Laufzeitverhalten für Daten, die der Typ nicht mehr zulässt.

- [ ] **Step 2: Test laufen lassen, Rot sehen**

Run: `npm test --prefix server -- test/store.test.ts`
Expected: FAIL — der erste Test scheitert mit `expected false to be true` (`'custom'` ist noch nicht in `INTERVAL_PRESETS`). Der Legacy-Test ist bereits grün.

- [ ] **Step 3: Typ erweitern**

`server/src/types.ts` Zeile 2:

```ts
export type IntervalPreset = 'tabata' | 'fgb1' | 'fgb2' | 'emom' | 'custom'
```

- [ ] **Step 4: Validierung erweitern**

`server/src/store.ts` Zeile 33:

```ts
const INTERVAL_PRESETS = new Set(['tabata', 'fgb1', 'fgb2', 'emom', 'custom'])
```

Zeile 40-41 bekommt einen Kommentar, der die Legacy-Alternative begründet:

```ts
    // /^custom-\d+$/ ist die Legacy-Form vor der Umstellung auf ein einziges
    // Custom-Intervall. Sie bleibt gültig, damit Patches von noch offenen alten
    // Tabs nicht still verworfen werden; entfernbar, sobald keine alten Clients
    // mehr laufen.
    (v.preset === null ||
      (typeof v.preset === 'string' && (INTERVAL_PRESETS.has(v.preset) || /^custom-\d+$/.test(v.preset)))) &&
```

- [ ] **Step 5: Tests laufen lassen, Grün sehen**

Run: `npm test --prefix server`
Expected: PASS, alle Tests des Server-Pakets.

- [ ] **Step 6: Commit**

```bash
git add server/src/types.ts server/src/store.ts server/test/store.test.ts
git commit -m "feat(server): Preset 'custom' validieren, Legacy custom-<n> tolerieren"
```

---

### Task 2: Store hält ein einzelnes Custom-Intervall

Kern der Änderung: aus der 10er-Liste wird ein Objekt, aus dem Slot-Index nichts. Der neue localStorage-Key trennt die neue Form sauber von der alten.

**Files:**
- Modify: `frontend/src/lib/types.ts:2-9`
- Modify: `frontend/src/lib/stores/timer.svelte.ts:11,16,82-109`
- Test: `frontend/src/lib/stores/timer.test.ts:84-95`

**Interfaces:**
- Consumes: `IntervalPreset` aus Task 1 (dieselbe Definition, eigene Datei).
- Produces:
  - `export const CUSTOM_KEY = 'wodch-custom-interval'`
  - `export const LEGACY_CUSTOM_KEY = 'wodch-custom-intervals'`
  - `interface CustomInterval { rounds: number; workDuration: number; restDuration: number }`
  - `TimerStore.customInterval: CustomInterval | null`
  - `TimerStore.loadCustomInterval(): void`
  - `TimerStore.saveCustomInterval(interval: CustomInterval): void`
  - `TimerStore.applyPreset('custom')` liest `this.customInterval`; ist es `null`, ändert sich nichts.

- [ ] **Step 1: Tests schreiben**

In `frontend/src/lib/stores/timer.test.ts` die beiden Tests in Zeile 84-95 ersetzen durch:

```ts
  it('custom interval: speichern, laden, anwenden', () => {
    store.saveCustomInterval({ rounds: 4, workDuration: 3 * MIN, restDuration: 30 * SEC })
    const fresh = new TimerStore()
    expect(fresh.customInterval).toEqual({ rounds: 4, workDuration: 3 * MIN, restDuration: 30 * SEC })
    fresh.applyPreset('custom')
    expect(fresh.doc).toMatchObject({ preset: 'custom', workDuration: 3 * MIN, restDuration: 30 * SEC, totalRounds: 4 })
  })

  it('applyPreset(custom) ohne gespeicherte Werte ändert nichts', () => {
    const before = { ...store.doc }
    store.applyPreset('custom')
    expect(store.doc).toEqual(before)
  })

  it('korrupte localStorage-Daten werden ignoriert', () => {
    localStorage.setItem(CUSTOM_KEY, '{{{nope')
    expect(new TimerStore().customInterval).toBeNull()
  })

  it('unvollständige gespeicherte Werte werden ignoriert', () => {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify({ rounds: 4, workDuration: 60_000 }))
    expect(new TimerStore().customInterval).toBeNull()
  })

  it('eine Liste unter dem neuen Key wird ignoriert', () => {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify([{ rounds: 4, workDuration: 60_000, restDuration: 0 }]))
    expect(new TimerStore().customInterval).toBeNull()
  })

  it('alte Slot-Liste wird nicht migriert und der Legacy-Key gelöscht', () => {
    localStorage.setItem(
      LEGACY_CUSTOM_KEY,
      JSON.stringify([{ name: 'Murph', rounds: 4, workDuration: 60_000, restDuration: 0 }]),
    )
    expect(new TimerStore().customInterval).toBeNull()
    expect(localStorage.getItem(LEGACY_CUSTOM_KEY)).toBeNull()
  })
```

Zeile 2 der Datei lautet aktuell `import { TimerStore, CUSTOM_KEY } from './timer.svelte'` und wird zu:

```ts
import { TimerStore, CUSTOM_KEY, LEGACY_CUSTOM_KEY } from './timer.svelte'
```

`beforeEach` in Zeile 12-17 ruft bereits `localStorage.clear()` — die neuen Tests brauchen kein eigenes Setup.

- [ ] **Step 2: Tests laufen lassen, Rot sehen**

Run: `npm test --prefix frontend -- src/lib/stores/timer.test.ts`
Expected: FAIL — `LEGACY_CUSTOM_KEY` existiert nicht (Import-Fehler bzw. `undefined`), `saveCustomInterval` erwartet noch zwei Argumente, `customInterval` existiert nicht.

- [ ] **Step 3: Typ ändern**

`frontend/src/lib/types.ts` Zeile 2-9:

```ts
export type IntervalPreset = 'tabata' | 'fgb1' | 'fgb2' | 'emom' | 'custom'

export interface CustomInterval {
  rounds: number
  workDuration: number // ms
  restDuration: number // ms
}
```

- [ ] **Step 4: Store umbauen**

`frontend/src/lib/stores/timer.svelte.ts` — Zeile 11 wird zu:

```ts
export const CUSTOM_KEY = 'wodch-custom-interval'
export const LEGACY_CUSTOM_KEY = 'wodch-custom-intervals'
```

Zeile 16 wird zu:

```ts
  customInterval = $state<CustomInterval | null>(null)
```

Der Konstruktor-Aufruf in Zeile 30 wird zu `this.loadCustomInterval()`.

Der Custom-Zweig in `applyPreset` (Zeile 82-87) wird zu:

```ts
    } else if (preset === 'custom') {
      const ci = this.customInterval
      if (!ci) return
      this.commit({ ...base, workDuration: ci.workDuration, restDuration: ci.restDuration, totalRounds: ci.rounds })
    }
```

`loadCustomIntervals`/`saveCustomInterval` (Zeile 90-109) werden zu:

```ts
  loadCustomInterval() {
    localStorage.removeItem(LEGACY_CUSTOM_KEY)
    try {
      const raw = localStorage.getItem(CUSTOM_KEY)
      if (!raw) return
      const p = JSON.parse(raw)
      if (
        typeof p === 'object' && p !== null && !Array.isArray(p) &&
        Number.isFinite(p.rounds) && Number.isFinite(p.workDuration) && Number.isFinite(p.restDuration)
      ) {
        this.customInterval = { rounds: p.rounds, workDuration: p.workDuration, restDuration: p.restDuration }
      }
    } catch {
      // korrupte Daten ignorieren
    }
  }

  saveCustomInterval(interval: CustomInterval) {
    this.customInterval = interval
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(interval))
  }
```

- [ ] **Step 5: Tests laufen lassen**

Run: `npm test --prefix frontend -- src/lib/stores/timer.test.ts`
Expected: PASS. `modalStart.test.ts` und `TimerModal` sind jetzt kaputt — das ist erwartet und wird in Task 3 und 4 behoben. Deshalb hier nur die eine Testdatei laufen lassen.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/stores/timer.svelte.ts frontend/src/lib/stores/timer.test.ts
git commit -m "feat(timer): ein einzelnes Custom-Intervall im Store statt 10 Slots"
```

---

### Task 3: Formular-Übergabe ohne Slot und ohne Name

`applyModalStart` ist die Brücke zwischen Modal-Formular und Store. Nach Task 2 kompiliert der Custom-Zweig nicht mehr.

**Files:**
- Modify: `frontend/src/lib/components/modalStart.ts:15,36-46`
- Test: `frontend/src/lib/components/modalStart.test.ts:17,54-59`

**Interfaces:**
- Consumes: `TimerStore.saveCustomInterval(interval)` und `applyPreset('custom')` aus Task 2.
- Produces: `ModalForm` ohne das Feld `customName`; alle übrigen Felder unverändert. Task 4 baut sein `buildForm()` gegen diese Form.

- [ ] **Step 1: Test anpassen**

In `frontend/src/lib/components/modalStart.test.ts` die Zeile 17 (`customName: '',`) aus dem Fixture **löschen** und den Test in Zeile 54-59 ersetzen durch:

```ts
  it('custom: speichert Werte und startet', () => {
    timer.setMode('interval')
    applyModalStart(timer, form({ mode: 'interval', preset: 'custom', customRounds: 4, customWorkMin: 0, customWorkSec: 40, customRestMin: 0, customRestSec: 20 }))
    expect(timer.customInterval).toEqual({ rounds: 4, workDuration: 40_000, restDuration: 20_000 })
    expect(timer.doc).toMatchObject({ preset: 'custom', workDuration: 40_000, totalRounds: 4, isRunning: true })
  })
```

- [ ] **Step 2: Test laufen lassen, Rot sehen**

Run: `npm test --prefix frontend -- src/lib/components/modalStart.test.ts`
Expected: FAIL — `timer.customInterval` ist `null`, weil `applyModalStart` noch den `custom-`-Präfix erwartet und bei `preset: 'custom'` in keinen Zweig läuft.

- [ ] **Step 3: `ModalForm` und Custom-Zweig umbauen**

`frontend/src/lib/components/modalStart.ts` — Zeile 15 (`customName: string`) aus dem Interface **löschen**. Den Custom-Zweig (Zeile 36-46) ersetzen durch:

```ts
  } else if (form.mode === 'interval' && form.preset === 'custom') {
    timer.saveCustomInterval({
      rounds: form.customRounds,
      workDuration: ms(form.customWorkMin, form.customWorkSec),
      restDuration: ms(form.customRestMin, form.customRestSec),
    })
    timer.applyPreset('custom')
```

- [ ] **Step 4: Test laufen lassen, Grün sehen**

Run: `npm test --prefix frontend -- src/lib/components/modalStart.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/components/modalStart.ts frontend/src/lib/components/modalStart.test.ts
git commit -m "feat(timer): Modal-Formular ohne Custom-Slot und ohne Namensfeld"
```

---

### Task 4: Modal zeigt genau einen Custom-Eintrag

Letzte Code-Änderung: die Preset-Liste, der `$effect` zum Nachladen der Slot-Werte, das Namensfeld und dessen jetzt totes CSS.

Wichtig für das Verständnis: das Modal wird in `frontend/src/App.svelte:105` per `{#if showModal}` gemountet und bei jedem Öffnen neu erzeugt. Die Formularfelder dürfen deshalb direkt bei der Deklaration aus `timer.customInterval` initialisiert werden — ein reaktiver `$effect` ist nur nötig, wenn sich die Quelle während der Lebensdauer der Komponente ändert, und mit nur einem Custom-Eintrag passiert das nicht mehr.

**Files:**
- Modify: `frontend/src/lib/components/TimerModal.svelte:16-25,46-64,71-73,83-86,185-191,314-322`

**Interfaces:**
- Consumes: `timer.customInterval` (Task 2), `ModalForm` ohne `customName` (Task 3).
- Produces: nichts für Folge-Tasks.

- [ ] **Step 1: Preset-Liste auf einen Custom-Eintrag reduzieren**

Zeile 16-25 ersetzen. `$derived` fällt weg, weil die Liste nach dem Entfernen der Namen keine reaktive Quelle mehr hat:

```ts
  const presets: { value: IntervalPreset; label: string }[] = [
    { value: 'tabata', label: 'Tabata (20s/10s × 8)' },
    { value: 'fgb1', label: 'Fight Gone Bad 1 (5×5min)' },
    { value: 'fgb2', label: 'Fight Gone Bad 2 (3×5min)' },
    { value: 'emom', label: 'EMOM' },
    { value: 'custom', label: 'Custom' },
  ]
```

- [ ] **Step 2: Slot-Ableitung und `$effect` durch direkte Initialisierung ersetzen**

Zeile 46-64 komplett ersetzen durch:

```ts
  // Das Modal wird pro Öffnen neu gemountet (App.svelte: {#if showModal}),
  // deshalb genügt eine Initialisierung aus den gespeicherten Werten.
  const ci = timer.customInterval
  let customRounds = $state(ci?.rounds ?? 5)
  let customWorkMin = $state(splitMs(ci?.workDuration ?? 300_000)[0])
  let customWorkSec = $state(splitMs(ci?.workDuration ?? 300_000)[1])
  let customRestMin = $state(splitMs(ci?.restDuration ?? 60_000)[0])
  let customRestSec = $state(splitMs(ci?.restDuration ?? 60_000)[1])
```

Damit sind `customSlot`, `customName` und der `$effect` weg.

- [ ] **Step 3: Preset-Wechsel und `buildForm` anpassen**

`onPresetChange` (Zeile 71-73) wird zu:

```ts
  function onPresetChange() {
    if (selectedPreset && selectedPreset !== 'custom') timer.applyPreset(selectedPreset)
  }
```

(Custom wird bewusst erst bei „Start" angewendet, damit die Formularwerte vorher noch bearbeitbar sind.)

In `buildForm` (Zeile 83-86) `customName,` aus dem Objektliteral **löschen**; die Zeile `customName, customRounds,` wird zu `customRounds,`.

- [ ] **Step 4: Markup — Bedingung ändern, Namensfeld entfernen**

Zeile 185 wird zu:

```svelte
    {#if selectedPreset === 'custom'}
```

Die `config-row` mit dem Namensfeld (Zeile 188-191) komplett **löschen**:

```svelte
        <div class="config-row">
          <span>Name</span>
          <input type="text" bind:value={customName} class="text-input" maxlength="20" />
        </div>
```

- [ ] **Step 5: Totes CSS entfernen**

Die Regel `.text-input` (Zeile 314-322) **löschen** — nach Step 4 ist sie der einzige verbliebene Nutzer dieser Klasse in der gesamten Codebase (geprüft: nur diese Datei referenziert `text-input`). Svelte würde sie sonst als unbenutzten Selektor melden.

- [ ] **Step 6: Typprüfung und komplette Frontend-Suite**

Run: `npm run build --prefix frontend`
Expected: `svelte-check` meldet 0 Fehler und der Vite-Build läuft durch. Bei einem Fehler wie „`customName` is not defined" ist in Step 3 oder 4 eine Referenz übrig geblieben.

Run: `npm test --prefix frontend`
Expected: PASS, alle Tests des Frontend-Pakets.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/components/TimerModal.svelte
git commit -m "feat(timer): Modal zeigt einen Custom-Eintrag statt zehn Slots"
```

---

### Task 5: Doku angleichen

Zwei Dokumente beschreiben die 10 Slots als Ist-Zustand. Zusätzlich wird ein Fehler richtiggestellt, der schon vorher falsch war.

**Files:**
- Modify: `README.md:9`
- Modify: `docs/rewrite-requirements.md:43,45,46,69,71,104`

**Interfaces:**
- Consumes: das fertige Verhalten aus Task 1-4.
- Produces: nichts.

- [ ] **Step 1: README aktualisieren**

In `README.md` Zeile 9 den Teil `Intervall mit Presets (Tabata, Fight Gone Bad 1/2, EMOM, 10 Custom-Slots)` ersetzen durch:

```
Intervall mit Presets (Tabata, Fight Gone Bad 1/2, EMOM, Custom)
```

- [ ] **Step 2: Anforderungsdokument aktualisieren**

In `docs/rewrite-requirements.md`:

Zeile 43 (Tabellenzeile) wird zu:

```
| Custom | Frei konfigurierbar: Runden 1–99, Work- und Rest-Dauer; Rest = 0 erlaubt. Ein einziges Programm, kein Name |
```

Zeile 45 wird zu:

```
- Das Custom-Programm wird **lokal persistiert** (aktuell `localStorage`, Key `wodch-custom-interval`) — die einzigen lokal persistierten Daten der App. Korrupte oder unvollständige Daten werden still ignoriert.
```

Zeile 46 (`- Preset-Labels zeigen den gespeicherten Custom-Namen, sonst „Custom N".`) **löschen** — es gibt keine Namen mehr.

Zeile 69: `Custom-Felder (Name/Runden/Work/Rest)` wird zu `Custom-Felder (Runden/Work/Rest)`.

Zeile 71: `(speichert Custom-Slot)` wird zu `(speichert das Custom-Programm)`.

Im Session-Dokument-Schema (Zeile 100-109) die Zeile mit `customIntervals` aus der `timer`-Beschreibung entfernen und stattdessen klarstellen, dass das Custom-Programm nicht synchronisiert wird. Der `timer`-Block wird zu:

```
├── timer: kompletter Timer-State inkl. mode, preset, phase, isRunning,
│          startedAt, accumulatedMs, alle Dauern/Runden, clock12h
│          (elapsed wird NIE übertragen; das lokal gespeicherte
│          Custom-Programm ebenfalls nicht — synchronisiert werden nur
│          seine aufgelösten Werte in workDuration/restDuration/totalRounds)
```

- [ ] **Step 3: Prüfen, dass keine Slot-Referenzen übrig sind**

Run: `grep -rn "Custom-Slot\|customIntervals\|custom-\${\|Custom N\|10 Custom" README.md docs/rewrite-requirements.md frontend/src server/src`
Expected: keine Treffer. Der einzige zulässige Rest ist die Legacy-Regex `/^custom-\d+$/` in `server/src/store.ts` — sie enthält keinen dieser Suchbegriffe und darf bleiben.

- [ ] **Step 4: Volle Suite beider Pakete als Abschluss-Gate**

Run: `npm test --prefix frontend && npm test --prefix server`
Expected: PASS in beiden Paketen.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/rewrite-requirements.md
git commit -m "docs: Custom-Intervall als einzelnes Programm dokumentieren"
```

---

## Manuelle Verifikation nach Task 5

Automatische Tests decken Store, Formular-Logik und Server-Validierung ab, aber keine Svelte-Komponente (es gibt keine Komponententests für `TimerModal`). Diese Schritte deshalb von Hand in `npm run dev --prefix frontend` prüfen:

1. Modal öffnen (⚙ oder `M`), Modus „Intervall" wählen → die Preset-Liste zeigt **fünf** Einträge, der letzte heißt `Custom`.
2. „Custom" wählen → Felder Runden/Work/Rest erscheinen, **kein** Namensfeld. Defaults: 5 Runden, 5:00, 1:00.
3. Werte auf 4 / 0:40 / 0:20 setzen, „Start" → Timer läuft mit 0:40 Work und Rundenanzeige `1 / 4`.
4. Seite neu laden, Modal öffnen, „Custom" wählen → 4 / 0:40 / 0:20 stehen wieder da.
5. In DevTools → Application → Local Storage prüfen: `wodch-custom-interval` existiert, `wodch-custom-intervals` ist verschwunden.
6. Session teilen, Link in einem zweiten Tab öffnen, Custom-Intervall starten → beide Tabs zeigen dieselbe Zeit und Rundenanzeige.

## Deployment-Hinweis

Frontend und Backend sind getrennte Images (`ghcr.io/gerrited/wodch-frontend`, `ghcr.io/gerrited/wodch-backend`). CI baut bei Push auf `main` beide als `:latest`; der Rollout ist manuell (`kubectl rollout restart`). **Backend zuerst neu starten**, dann Frontend — sonst schickt ein neuer Client `preset: 'custom'` an einen Server, der es noch nicht kennt. Der Backend-Restart löscht ohnehin alle laufenden Sessions (In-Memory-`Map`), er sollte also außerhalb einer Trainingseinheit passieren.
