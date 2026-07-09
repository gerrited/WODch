# Warmup für alle Timer-Modi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Warmup (Vorlaufphase) auch für Stoppuhr, Count-Down und Count-Up verfügbar machen — mit eigener Signalfarbe und "WARMUP"-Label — und dabei zwei Defekte beheben (falsche Intervall-Phase bei Nicht-Intervall-Modi; nicht greifendes Warmup bei EMOM/Custom).

**Architecture:** Eine neue, modus-bewusste Phasen-Ableitung `derivePhase` ersetzt den bisherigen ungefilterten `deriveInterval`-Aufruf im Store. Die Warmup-Vorlaufphase wird als gemeinsame Logik vor die modus-spezifische Zeitberechnung gezogen. `deriveInterval` bleibt als Intervall-Kern unverändert.

**Tech Stack:** Svelte 5 (Runes), TypeScript, Vitest.

## Global Constraints

- Warmup-Signalfarbe: `#f0a500` (Orange-Gelb). Vorhandene Phasen-Farben: work `#e63946` (rot), rest `#2dc653` (grün).
- Warmup-Label-Text: exakt `WARMUP`.
- Uhrzeit-Modus (`clock`) hat kein Warmup.
- Kommentare/UI-Texte auf Deutsch (bestehende Konvention).
- Tests laufen aus `frontend/`: `npx vitest run <pfad>`.

---

### Task 1: Modus-bewusste Phasen-Ableitung `derivePhase`

**Files:**
- Modify: `frontend/src/lib/timer/engine.ts` (Typ `Derived` erweitern, Funktion `derivePhase` ergänzen)
- Test: `frontend/src/lib/timer/engine.test.ts`

**Interfaces:**
- Consumes: bestehende `deriveInterval(cfg, elapsed, started)`, Typ `TimerDoc`.
- Produces:
  - `type Derived` erweitert um Variante `{ phase: 'running' }`.
  - `export function derivePhase(doc: TimerDoc, elapsed: number, started: boolean): Derived` — liefert modus-abhängig: `idle` (nicht gestartet), `warmup`/`work`/`rest`/`done` (interval, delegiert an `deriveInterval`), `warmup`→`running` (stopwatch/countup), `warmup`→`running`/`done` (countdown), `running` (clock).

- [ ] **Step 1: Failing test schreiben**

In `frontend/src/lib/timer/engine.test.ts` den Import erweitern und einen neuen `describe`-Block ergänzen. Import-Zeile (aktuell Zeile 2) ändern zu:

```ts
import { elapsedNow, deriveInterval, derivePhase, displayTime, displayRound } from './engine'
```

Neuen Block nach dem `describe('deriveInterval Randfälle', …)`-Block (nach Zeile 73) einfügen:

```ts
describe('derivePhase (modus-bewusst)', () => {
  it('idle wenn nicht gestartet', () => {
    expect(derivePhase(doc({ mode: 'stopwatch' }), 0, false)).toEqual({ phase: 'idle' })
  })

  it('stopwatch: running sobald gestartet (nie work/rest)', () => {
    expect(derivePhase(doc({ mode: 'stopwatch' }), 5 * SEC, true)).toEqual({ phase: 'running' })
  })

  it('countup: running sobald gestartet', () => {
    expect(derivePhase(doc({ mode: 'countup' }), 5 * SEC, true)).toEqual({ phase: 'running' })
  })

  it('countdown: running bis target, dann done', () => {
    const d = doc({ mode: 'countdown', countdownTarget: 60 * SEC })
    expect(derivePhase(d, 30 * SEC, true)).toEqual({ phase: 'running' })
    expect(derivePhase(d, 60 * SEC, true)).toEqual({ phase: 'done' })
  })

  it('einfache Modi: warmup zuerst, dann running', () => {
    const d = doc({ mode: 'stopwatch', warmupEnabled: true, warmupDuration: 10 * SEC })
    expect(derivePhase(d, 3 * SEC, true)).toEqual({ phase: 'warmup', round: 0, remaining: 7 * SEC })
    expect(derivePhase(d, 12 * SEC, true)).toEqual({ phase: 'running' })
  })

  it('countdown mit warmup: target läuft erst nach warmup', () => {
    const d = doc({ mode: 'countdown', countdownTarget: 60 * SEC, warmupEnabled: true, warmupDuration: 10 * SEC })
    expect(derivePhase(d, 65 * SEC, true)).toEqual({ phase: 'running' }) // 65-10 = 55 < 60
    expect(derivePhase(d, 70 * SEC, true)).toEqual({ phase: 'done' })    // 70-10 = 60
  })

  it('interval: delegiert an deriveInterval', () => {
    const d = doc({ mode: 'interval', workDuration: 20 * SEC, restDuration: 10 * SEC, totalRounds: 8 })
    expect(derivePhase(d, 5 * SEC, true)).toEqual({ phase: 'work', round: 1, remaining: 15 * SEC })
  })
})
```

- [ ] **Step 2: Test ausführen, Fehlschlag prüfen**

Run: `cd frontend && npx vitest run src/lib/timer/engine.test.ts`
Expected: FAIL — `derivePhase is not a function` / Import-Fehler.

- [ ] **Step 3: Implementierung**

In `frontend/src/lib/timer/engine.ts` den `Derived`-Typ (aktuell Zeilen 9-12) erweitern:

```ts
export type Derived =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'warmup' | 'work' | 'rest'; round: number; remaining: number }
  | { phase: 'done' }
```

Danach — direkt nach der `deriveInterval`-Funktion (nach Zeile 35) — einfügen:

```ts
// Modus-bewusste Phase: Intervall behält work/rest/done, einfache Modi kennen
// nur warmup → running (Countdown zusätzlich done). Uhrzeit hat keine Phasen.
export function derivePhase(doc: TimerDoc, elapsed: number, started: boolean): Derived {
  if (!started) return { phase: 'idle' }
  if (doc.mode === 'interval') return deriveInterval(doc, elapsed, started)
  if (doc.mode === 'clock') return { phase: 'running' }
  const warmup = doc.warmupEnabled ? doc.warmupDuration : 0
  if (elapsed < warmup) return { phase: 'warmup', round: 0, remaining: warmup - elapsed }
  if (doc.mode === 'countdown') {
    return elapsed - warmup >= doc.countdownTarget ? { phase: 'done' } : { phase: 'running' }
  }
  return { phase: 'running' } // stopwatch, countup
}
```

- [ ] **Step 4: Test ausführen, Erfolg prüfen**

Run: `cd frontend && npx vitest run src/lib/timer/engine.test.ts`
Expected: PASS (alle bisherigen + neuen Tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/timer/engine.ts frontend/src/lib/timer/engine.test.ts
git commit -m "feat(timer): modus-bewusste Phasen-Ableitung derivePhase

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Warmup in `displayTime` und "WARMUP"-Label in `displayRound`

**Files:**
- Modify: `frontend/src/lib/timer/engine.ts` (`displayTime`, `displayRound`)
- Test: `frontend/src/lib/timer/engine.test.ts`

**Interfaces:**
- Consumes: `derivePhase` (Task 1), `isStarted`, `formatMs`.
- Produces: unverändertes Signatur-Verhalten von `displayTime`/`displayRound`; neu: Warmup-Restzeit bei stopwatch/countdown/countup und `"WARMUP"` als `displayRound`-Rückgabe in der Warmup-Phase (alle Modi).

- [ ] **Step 1: Failing tests schreiben**

In `frontend/src/lib/timer/engine.test.ts`, im `describe('displayTime', …)`-Block nach dem Test `'interval mit warmup: Warmup-Restzeit'` (nach Zeile 112) ergänzen:

```ts
  it('stopwatch mit warmup: erst Warmup-Restzeit, dann Stoppuhr ab 0', () => {
    const d = doc({ mode: 'stopwatch', isRunning: true, startedAt: 0, warmupEnabled: true, warmupDuration: 10 * SEC })
    expect(displayTime(d, 4 * SEC, noon)).toBe('00:06')
    expect(displayTime(d, 12 * SEC, noon)).toBe('00:02.00')
  })

  it('countdown mit warmup: Ziel zählt erst nach Warmup', () => {
    const d = doc({ mode: 'countdown', isRunning: true, startedAt: 0, countdownTarget: 60 * SEC, warmupEnabled: true, warmupDuration: 10 * SEC })
    expect(displayTime(d, 4 * SEC, noon)).toBe('00:06')
    expect(displayTime(d, 10 * SEC, noon)).toBe('01:00')
  })

  it('countup mit warmup: Startwert erst nach Warmup', () => {
    const d = doc({ mode: 'countup', isRunning: true, startedAt: 0, countupStart: 90 * SEC, warmupEnabled: true, warmupDuration: 10 * SEC })
    expect(displayTime(d, 4 * SEC, noon)).toBe('00:06')
    expect(displayTime(d, 10 * SEC, noon)).toBe('01:30')
  })
```

Im `describe('displayRound', …)`-Block den bestehenden Test `'null bei idle, warmup und done'` (Zeilen 120-126) **ersetzen** durch:

```ts
  it('null bei idle und done', () => {
    expect(displayRound(doc({ mode: 'interval', isRunning: false }), 0)).toBeNull()
    const d = doc({ mode: 'interval', isRunning: true, startedAt: 0, totalRounds: 1, workDuration: 1000, restDuration: 0 })
    expect(displayRound(d, 5000)).toBeNull()
  })

  it('"WARMUP" während der Warmup-Phase (alle Modi)', () => {
    const iv = doc({ mode: 'interval', isRunning: true, startedAt: 0, warmupEnabled: true, warmupDuration: 10 * SEC })
    expect(displayRound(iv, 3000)).toBe('WARMUP')
    const sw = doc({ mode: 'stopwatch', isRunning: true, startedAt: 0, warmupEnabled: true, warmupDuration: 10 * SEC })
    expect(displayRound(sw, 3000)).toBe('WARMUP')
  })
```

- [ ] **Step 2: Test ausführen, Fehlschlag prüfen**

Run: `cd frontend && npx vitest run src/lib/timer/engine.test.ts`
Expected: FAIL — stopwatch/countdown/countup mit warmup liefern noch die ungewarmte Zeit; `displayRound` liefert `null` statt `'WARMUP'`.

- [ ] **Step 3: Implementierung**

In `frontend/src/lib/timer/engine.ts` `displayTime` (aktuell Zeilen 41-50) **ersetzen** durch:

```ts
export function displayTime(doc: TimerDoc, elapsed: number, now: Date): string {
  if (doc.mode === 'clock') return formatClock(now, doc.clock12h)
  if (doc.mode === 'interval') {
    const d = deriveInterval(doc, elapsed, isStarted(doc))
    if (d.phase === 'idle' || d.phase === 'done') return formatMs(doc.workDuration)
    return formatMs(d.remaining)
  }
  const started = isStarted(doc)
  const warmup = doc.warmupEnabled ? doc.warmupDuration : 0
  if (started && elapsed < warmup) return formatMs(warmup - elapsed)
  const t = started ? elapsed - warmup : elapsed
  if (doc.mode === 'stopwatch') return formatMs(t, true)
  if (doc.mode === 'countdown') return formatMs(doc.countdownTarget - t)
  return formatMs(doc.countupStart + t) // countup
}
```

`displayRound` (aktuell Zeilen 52-57) **ersetzen** durch:

```ts
export function displayRound(doc: TimerDoc, elapsed: number): string | null {
  const d = derivePhase(doc, elapsed, isStarted(doc))
  if (d.phase === 'warmup') return 'WARMUP'
  if (doc.mode !== 'interval') return null
  if (d.phase !== 'work' && d.phase !== 'rest') return null
  return `${d.round} / ${doc.totalRounds}`
}
```

- [ ] **Step 4: Test ausführen, Erfolg prüfen**

Run: `cd frontend && npx vitest run src/lib/timer/engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/timer/engine.ts frontend/src/lib/timer/engine.test.ts
git commit -m "feat(timer): Warmup-Zeit und WARMUP-Label für alle Modi

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Store auf `derivePhase` umstellen + `applyPreset`-Warmup-Fix

**Files:**
- Modify: `frontend/src/lib/stores/timer.svelte.ts` (Import, `derived`-Ableitung, `applyPreset`)
- Test: `frontend/src/lib/stores/timer.test.ts`

**Interfaces:**
- Consumes: `derivePhase` (Task 1).
- Produces: `timer.derived` ist modus-bewusst; `applyPreset` lässt `warmupEnabled` unangetastet.

- [ ] **Step 1: Failing test schreiben**

In `frontend/src/lib/stores/timer.test.ts` im `describe`-Block (bei den `applyPreset`-Tests, nach dem Test `'applyPreset materialisiert …'`) ergänzen:

```ts
  it('applyPreset lässt warmupEnabled unangetastet', () => {
    store.setConfig({ warmupEnabled: true })
    store.applyPreset('emom')
    expect(store.doc.warmupEnabled).toBe(true)
  })
```

- [ ] **Step 2: Test ausführen, Fehlschlag prüfen**

Run: `cd frontend && npx vitest run src/lib/stores/timer.test.ts`
Expected: FAIL — `warmupEnabled` ist nach `applyPreset('emom')` `false`.

- [ ] **Step 3: Implementierung**

In `frontend/src/lib/stores/timer.svelte.ts`:

Import (Zeile 8) ändern von:

```ts
import { elapsedNow, deriveInterval, displayTime, displayRound, type Derived } from '../timer/engine'
```

zu:

```ts
import { elapsedNow, derivePhase, displayTime, displayRound, type Derived } from '../timer/engine'
```

`derived`-Ableitung (Zeilen 23-25) ändern von `deriveInterval(...)` zu:

```ts
  derived: Derived = $derived(
    derivePhase(this.doc, this.elapsed, this.doc.isRunning || this.doc.accumulatedMs > 0),
  )
```

In `applyPreset` das `base`-Objekt (Zeilen 67-74) — die Zeile `warmupEnabled: false,` **entfernen**, sodass es lautet:

```ts
    const base: Partial<TimerDoc> = {
      mode: 'interval',
      preset,
      isRunning: false,
      startedAt: null,
      accumulatedMs: 0,
    }
```

- [ ] **Step 4: Test ausführen, Erfolg prüfen**

Run: `cd frontend && npx vitest run src/lib/stores/timer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/stores/timer.svelte.ts frontend/src/lib/stores/timer.test.ts
git commit -m "fix(timer): Store nutzt derivePhase; applyPreset erhält warmupEnabled

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `barAction` auf `derived.phase` umstellen

**Files:**
- Modify: `frontend/src/lib/components/barAction.ts`
- Modify: `frontend/src/lib/components/TimerBar.svelte:18` (Aufruf ohne `elapsed`)
- Test: `frontend/src/lib/components/barAction.test.ts`

**Interfaces:**
- Consumes: `Derived` (mit neuer `running`-Variante), `derivePhase`.
- Produces: `barAction(doc: TimerDoc, derived: Derived): 'modal' | 'toggle'` — der `elapsed`-Parameter entfällt; Countdown-Ende wird über `derived.phase === 'done'` erkannt (berücksichtigt Warmup-Offset korrekt).

- [ ] **Step 1: Test anpassen (failing)**

`frontend/src/lib/components/barAction.test.ts` komplett **ersetzen** durch:

```ts
import { describe, it, expect } from 'vitest'
import { barAction } from './barAction'
import { defaultTimerDoc, type TimerDoc } from '../types'
import { derivePhase } from '../timer/engine'

function doc(overrides: Partial<TimerDoc> = {}): TimerDoc {
  return { ...defaultTimerDoc(), ...overrides }
}

function derivedFor(d: TimerDoc, elapsed: number) {
  return derivePhase(d, elapsed, d.isRunning || d.accumulatedMs > 0)
}

describe('barAction', () => {
  it('clock: immer modal', () => {
    expect(barAction(doc(), { phase: 'idle' })).toBe('modal')
  })

  it('stopwatch: modal wenn frisch, toggle wenn läuft oder pausiert', () => {
    const idle = doc({ mode: 'stopwatch' })
    expect(barAction(idle, derivedFor(idle, 0))).toBe('modal')
    const running = doc({ mode: 'stopwatch', isRunning: true, startedAt: 1 })
    expect(barAction(running, derivedFor(running, 500))).toBe('toggle')
    const paused = doc({ mode: 'stopwatch', accumulatedMs: 500 })
    expect(barAction(paused, derivedFor(paused, 500))).toBe('toggle')
  })

  it('interval: modal bei idle und done, toggle während work/rest', () => {
    const idle = doc({ mode: 'interval' })
    expect(barAction(idle, derivedFor(idle, 0))).toBe('modal')
    const running = doc({ mode: 'interval', isRunning: true, startedAt: 0 })
    expect(barAction(running, derivedFor(running, 5000))).toBe('toggle')
    const done = doc({ mode: 'interval', isRunning: true, startedAt: 0 })
    expect(barAction(done, derivedFor(done, 999_999_999))).toBe('modal')
  })

  it('countdown: modal wenn abgelaufen', () => {
    const d = doc({ mode: 'countdown', isRunning: true, startedAt: 0, countdownTarget: 60_000 })
    expect(barAction(d, derivedFor(d, 30_000))).toBe('toggle')
    expect(barAction(d, derivedFor(d, 60_000))).toBe('modal')
  })

  it('countdown mit warmup: erst nach warmup+target modal', () => {
    const d = doc({ mode: 'countdown', isRunning: true, startedAt: 0, countdownTarget: 60_000, warmupEnabled: true, warmupDuration: 10_000 })
    expect(barAction(d, derivedFor(d, 65_000))).toBe('toggle') // noch im Countdown
    expect(barAction(d, derivedFor(d, 70_000))).toBe('modal')  // abgelaufen
  })
})
```

- [ ] **Step 2: Test ausführen, Fehlschlag prüfen**

Run: `cd frontend && npx vitest run src/lib/components/barAction.test.ts`
Expected: FAIL — `barAction` erwartet noch 3 Argumente / Countdown-Logik nutzt `elapsed`.

- [ ] **Step 3: Implementierung**

`frontend/src/lib/components/barAction.ts` **ersetzen** durch:

```ts
import type { TimerDoc } from '../types'
import type { Derived } from '../timer/engine'

// Klick auf die Timer-Leiste: Modal im Clock-Modus und im Idle-/Fertig-Zustand, sonst Start/Pause
export function barAction(doc: TimerDoc, derived: Derived): 'modal' | 'toggle' {
  if (doc.mode === 'clock') return 'modal'
  if (doc.mode === 'interval') {
    return derived.phase === 'idle' || derived.phase === 'done' ? 'modal' : 'toggle'
  }
  if (doc.mode === 'countdown' && derived.phase === 'done') return 'modal'
  const started = doc.isRunning || doc.accumulatedMs > 0
  return started ? 'toggle' : 'modal'
}
```

In `frontend/src/lib/components/TimerBar.svelte` den Aufruf (Zeile 18) ändern von:

```ts
    if (barAction(timer.doc, timer.derived, timer.elapsed) === 'modal') onOpenModal()
```

zu:

```ts
    if (barAction(timer.doc, timer.derived) === 'modal') onOpenModal()
```

- [ ] **Step 4: Test ausführen, Erfolg prüfen**

Run: `cd frontend && npx vitest run src/lib/components/barAction.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/components/barAction.ts frontend/src/lib/components/barAction.test.ts frontend/src/lib/components/TimerBar.svelte
git commit -m "fix(timer): barAction nutzt Phase statt elapsed (Warmup-sicher)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `modalStart` — Warmup für alle Modi außer clock

**Files:**
- Modify: `frontend/src/lib/components/modalStart.ts:48`
- Test: `frontend/src/lib/components/modalStart.test.ts`

**Interfaces:**
- Consumes: bestehende `applyModalStart`-Struktur.
- Produces: Warmup-Dauer wird für jeden Modus außer `clock` übernommen, sofern `warmupEnabled`.

- [ ] **Step 1: Failing tests schreiben**

In `frontend/src/lib/components/modalStart.test.ts` nach dem Test `'warmup: übernimmt Dauer wenn aktiviert'` (nach Zeile 67) ergänzen:

```ts
  it('warmup: übernimmt Dauer auch bei countdown', () => {
    timer.setMode('countdown')
    timer.setConfig({ warmupEnabled: true })
    applyModalStart(timer, form({ mode: 'countdown', warmupMin: 0, warmupSec: 20 }))
    expect(timer.doc.warmupDuration).toBe(20_000)
    expect(timer.derived).toMatchObject({ phase: 'warmup' })
  })

  it('warmup: greift bei emom (applyPreset überschreibt nicht mehr)', () => {
    timer.setMode('interval')
    timer.setConfig({ warmupEnabled: true })
    applyModalStart(timer, form({ mode: 'interval', preset: 'emom', warmupMin: 0, warmupSec: 15 }))
    expect(timer.doc.warmupEnabled).toBe(true)
    expect(timer.doc.warmupDuration).toBe(15_000)
  })
```

- [ ] **Step 2: Test ausführen, Fehlschlag prüfen**

Run: `cd frontend && npx vitest run src/lib/components/modalStart.test.ts`
Expected: FAIL — bei countdown wird `warmupDuration` nicht gesetzt (Bedingung `=== 'interval'`); bei emom bleibt `warmupEnabled` false.

*(Hinweis: der emom-Teil hängt an Task 3 — den `applyPreset`-Fix. Task 3 muss vorher gemergt sein.)*

- [ ] **Step 3: Implementierung**

In `frontend/src/lib/components/modalStart.ts` Zeile 48 ändern von:

```ts
  const warmupEnabled = timer.doc.warmupEnabled && form.mode === 'interval'
```

zu:

```ts
  const warmupEnabled = timer.doc.warmupEnabled && form.mode !== 'clock'
```

- [ ] **Step 4: Test ausführen, Erfolg prüfen**

Run: `cd frontend && npx vitest run src/lib/components/modalStart.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/components/modalStart.ts frontend/src/lib/components/modalStart.test.ts
git commit -m "feat(timer): Warmup-Dauer für alle Modi außer clock übernehmen

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: UI — Warmup-Sektion im Modal + Signalfarbe/Label in der Timer-Bar

**Files:**
- Modify: `frontend/src/lib/components/TimerModal.svelte` (Warmup-Sektion-Bedingung)
- Modify: `frontend/src/lib/components/TimerBar.svelte` (Warmup-Farbklasse + CSS)

**Interfaces:**
- Consumes: `timer.derived.phase` (kann `'warmup'` sein), `timer.displayRound` (liefert `'WARMUP'`).
- Produces: sichtbare Warmup-Konfiguration für stopwatch/countdown/countup/interval und orange-gelbe Warmup-Anzeige.

- [ ] **Step 1: Warmup-Sektion im Modal freischalten**

In `frontend/src/lib/components/TimerModal.svelte` die Bedingung der WARMUP-Sektion (Zeile 213) ändern von:

```svelte
    {#if selectedMode === 'interval'}
      <section class="section">
        <div class="label">WARMUP</div>
```

zu:

```svelte
    {#if selectedMode !== 'clock'}
      <section class="section">
        <div class="label">WARMUP</div>
```

*(Nur diese eine `{#if}`-Zeile ändern — es ist die Sektion mit `<div class="label">WARMUP</div>`, nicht die PRESET-Sektion oben.)*

- [ ] **Step 2: Warmup-Signalfarbe + Label in der Timer-Bar**

In `frontend/src/lib/components/TimerBar.svelte` die Zeit-Span (Zeile 42) ändern von:

```svelte
    <span class="time" class:work={timer.derived.phase === 'work'} class:rest={timer.derived.phase === 'rest'}>
```

zu:

```svelte
    <span class="time" class:work={timer.derived.phase === 'work'} class:rest={timer.derived.phase === 'rest'} class:warmup={timer.derived.phase === 'warmup'}>
```

Im `<style>`-Block nach der `.time.rest`-Regel (nach Zeile 96) ergänzen:

```css
  .time.warmup {
    color: #f0a500;
  }
```

- [ ] **Step 3: Typecheck + gesamte Testsuite**

Run: `cd frontend && npm run build && npm test`
Expected: `svelte-check` ohne Fehler, Vite-Build erfolgreich, alle Vitest-Suiten PASS.

- [ ] **Step 4: Visuelle Verifikation (dev-Server)**

Run: `cd frontend && npm run dev`
Dann im Browser prüfen — für **Stoppuhr, Count-Down, Count-Up** je einzeln:
1. Zahnrad öffnen → Modus wählen → WARMUP „Aktiviert" anhaken → z. B. 5 Sek → Start.
2. Erwartung: Zeit zählt orange-gelb (`#f0a500`) von 5 s runter, Label `WARMUP` erscheint über/neben der Zeit.
3. Nach Ablauf: Modus startet normal (Stoppuhr ab 0, Count-Down ab Zielzeit, Count-Up ab Startwert), Farbe wird wieder weiß, Label verschwindet.
4. Zusätzlich **EMOM**: Intervall → EMOM → Warmup aktivieren → Start → Warmup läuft, danach Runden.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/components/TimerModal.svelte frontend/src/lib/components/TimerBar.svelte
git commit -m "feat(timer): Warmup-UI für alle Modi (Modal-Sektion, Signalfarbe, Label)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Warmup für stopwatch/countdown/countup → Tasks 2, 5, 6. ✓
- Modus-bewusste `derived` (latenter Bug) → Tasks 1, 3, 4. ✓
- EMOM/Custom-Warmup-Fix → Task 3 (`applyPreset`) + Task 5. ✓
- Signalfarbe `#f0a500` → Task 6. ✓
- `WARMUP`-Label → Tasks 2 (`displayRound`) + 6 (Anzeige). ✓
- Modal-Sektion für alle außer clock → Task 6. ✓
- Tests engine/modalStart/timer → Tasks 1-5. ✓

**Type consistency:** `derivePhase(doc, elapsed, started)` einheitlich in Store (Task 3), barAction-Test (Task 4). `Derived`-Variante `running` in Task 1 eingeführt, in barAction (Task 4) konsumiert. `barAction(doc, derived)` — 2 Argumente konsistent in Task 4 (Impl, Test, TimerBar-Aufruf).

**Reihenfolge-Hinweis:** Task 5 (emom-Test) setzt Task 3 voraus. Tasks in Nummernreihenfolge ausführen.
