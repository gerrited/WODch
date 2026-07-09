# Onboarding-Tour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Geführte Spotlight-Tour, die neuen Nutzern beim ersten Besuch Timer, Workout-Editor, Video und Session-Sharing direkt an den echten UI-Elementen erklärt — danach jederzeit über einen ?-Button neu startbar.

**Architecture:** Reine Schritt-Logik in `tour.ts` (Muster wie `barAction.ts`), Overlay-Komponente `Tour.svelte` mit Spotlight per `box-shadow`-Trick, Ziel-Elemente per `data-tour`-Attribut. `App.svelte` entscheidet Erstbesuch via localStorage-Flag `wodch.tourDone` und wählt Desktop- oder Mobil-Schrittliste; mobil schaltet die Tour den aktiven Tab über eine exportierte `selectTab()`-Funktion von `MobileTabs` um.

**Tech Stack:** Svelte 5 (Runes), TypeScript, Vitest + jsdom. Keine neuen Dependencies.

**Spec:** `docs/superpowers/specs/2026-07-09-onboarding-tour-design.md`

## Global Constraints

- Keine neuen npm-Dependencies.
- UI-Texte und Code-Kommentare auf Deutsch (wie Bestand).
- localStorage-Zugriffe immer in `try/catch` (Private Mode), wie in `MobileTabs.svelte`.
- localStorage-Flag heißt exakt `wodch.tourDone`; gesetzt wird der Wert `'1'`.
- Alle Tests laufen mit `cd frontend && npm test`; der Build mit `cd frontend && npm run build` (inkl. `svelte-check`).
- Tab-Indizes mobil: 0 = Workout, 1 = Timer, 2 = Video (siehe `MobileTabs.svelte`).

---

### Task 1: Tour-Logik (`tour.ts`) mit Schrittlisten

**Files:**
- Create: `frontend/src/lib/components/tour.ts`
- Test: `frontend/src/lib/components/tour.test.ts`

**Interfaces:**
- Consumes: nichts (reine Logik, keine Abhängigkeiten außer TypeScript).
- Produces:
  - `type TourStep = { target: string | null; title: string; body: string; tab?: number }`
  - `const desktopSteps: TourStep[]` (7 Schritte)
  - `const mobileSteps: TourStep[]` (7 Schritte, alle außer Schritt 1 mit `tab`)
  - `function shouldAutoStart(flag: string | null): boolean`
  - `function cardPlacement(rectTop: number, rectBottom: number, viewportHeight: number): 'above' | 'below'`

- [ ] **Step 1: Failing Test schreiben**

`frontend/src/lib/components/tour.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { shouldAutoStart, cardPlacement, desktopSteps, mobileSteps } from './tour'

describe('shouldAutoStart', () => {
  it('startet, wenn kein Flag gesetzt ist', () => {
    expect(shouldAutoStart(null)).toBe(true)
  })

  it('startet nicht, wenn das Flag gesetzt ist', () => {
    expect(shouldAutoStart('1')).toBe(false)
  })

  it('startet bei unbekanntem Flag-Wert (defensiv)', () => {
    expect(shouldAutoStart('kaputt')).toBe(true)
  })
})

describe('cardPlacement', () => {
  it('platziert die Karte unter dem Ziel, wenn darunter mehr Platz ist', () => {
    expect(cardPlacement(50, 100, 800)).toBe('below')
  })

  it('platziert die Karte über dem Ziel, wenn darüber mehr Platz ist', () => {
    expect(cardPlacement(700, 750, 800)).toBe('above')
  })
})

describe('Schrittlisten', () => {
  it('haben beide 7 Schritte und starten zentriert (ohne Ziel)', () => {
    expect(desktopSteps).toHaveLength(7)
    expect(mobileSteps).toHaveLength(7)
    expect(desktopSteps[0].target).toBeNull()
    expect(mobileSteps[0].target).toBeNull()
  })

  it('alle weiteren Schritte haben ein Ziel', () => {
    for (const step of [...desktopSteps.slice(1), ...mobileSteps.slice(1)]) {
      expect(step.target).toBeTruthy()
    }
  })

  it('mobile Schritte mit Ziel tragen einen gültigen Tab-Index', () => {
    for (const step of mobileSteps.slice(1)) {
      expect(step.tab).toBeGreaterThanOrEqual(0)
      expect(step.tab).toBeLessThanOrEqual(2)
    }
  })

  it('desktop Schritte haben keinen Tab-Index', () => {
    for (const step of desktopSteps) {
      expect(step.tab).toBeUndefined()
    }
  })
})
```

- [ ] **Step 2: Test ausführen, Fehlschlag verifizieren**

Run: `cd frontend && npx vitest run src/lib/components/tour.test.ts`
Expected: FAIL — `Cannot find module './tour'` (o. ä. Auflösungsfehler).

- [ ] **Step 3: Implementierung schreiben**

`frontend/src/lib/components/tour.ts`:

```ts
// Schrittdefinitionen und reine Logik der Onboarding-Tour
export type TourStep = {
  target: string | null // data-tour-Key des Ziel-Elements, null = zentrierte Karte
  title: string
  body: string
  tab?: number // mobil: Tab, der für diesen Schritt aktiv sein muss (0 Workout, 1 Timer, 2 Video)
}

// Tour automatisch starten, solange sie nie abgeschlossen/übersprungen wurde
export function shouldAutoStart(flag: string | null): boolean {
  return flag !== '1'
}

// Karte auf die Seite des Ziels mit mehr Platz legen
export function cardPlacement(
  rectTop: number,
  rectBottom: number,
  viewportHeight: number
): 'above' | 'below' {
  return viewportHeight - rectBottom >= rectTop ? 'below' : 'above'
}

export const desktopSteps: TourStep[] = [
  {
    target: null,
    title: 'Willkommen bei WODch',
    body: 'Intervall-Timer, Workout-Editor und Video-Player in einem Layout — alles per Link mit anderen Geräten teilbar. Die wichtigsten Funktionen in einer kurzen Tour.',
  },
  {
    target: 'timer-bar',
    title: 'Timer',
    body: 'Ein Klick auf die Leiste startet und pausiert den Timer. Solange nichts läuft, öffnet der Klick die Einstellungen. Tastenkürzel: Space Start/Pause, R Reset, M Einstellungen.',
  },
  {
    target: 'gear',
    title: 'Timer-Modi',
    body: 'Hier findest du alle Modi: Uhrzeit, Stoppuhr, Count-Down, Count-Up und Intervall mit Presets wie Tabata oder EMOM — optional mit Warmup.',
  },
  {
    target: 'editor',
    title: 'Workouts',
    body: 'Freier Text für dein Workout. Mehrere Tabs: Doppelklick benennt um, Ziehen sortiert.',
  },
  {
    target: 'video',
    title: 'Video',
    body: 'YouTube-URL einfügen und das Video läuft — mit ∞-Loop und ±10s-Buttons.',
  },
  {
    target: 'share',
    title: 'Session teilen',
    body: 'Erzeugt einen Link. Alle Geräte mit dem Link sehen Timer, Workouts und Video synchron und können alles steuern. Die Session verfällt 24 h nach der letzten Änderung.',
  },
  {
    target: 'help',
    title: 'Noch was',
    body: 'Die Bereiche lassen sich an den Trennlinien ziehen. Diese Tour startest du jederzeit über den ?-Button neu.',
  },
]

export const mobileSteps: TourStep[] = [
  {
    target: null,
    title: 'Willkommen bei WODch',
    body: 'Intervall-Timer, Workout-Editor und Video-Player — alles per Link mit anderen Geräten teilbar. Die wichtigsten Funktionen in einer kurzen Tour.',
  },
  {
    target: 'timer-bar',
    tab: 1,
    title: 'Timer',
    body: 'Tippen startet und pausiert den Timer. Solange nichts läuft, öffnet das Tippen die Einstellungen.',
  },
  {
    target: 'gear',
    tab: 1,
    title: 'Timer-Modi',
    body: 'Hier findest du alle Modi: Uhrzeit, Stoppuhr, Count-Down, Count-Up und Intervall mit Presets wie Tabata oder EMOM — optional mit Warmup.',
  },
  {
    target: 'editor',
    tab: 0,
    title: 'Workouts',
    body: 'Freier Text für dein Workout. Mehrere Tabs: Doppeltippen benennt um, Ziehen sortiert.',
  },
  {
    target: 'video',
    tab: 2,
    title: 'Video',
    body: 'YouTube-URL einfügen und das Video läuft — mit ∞-Loop und ±10s-Buttons.',
  },
  {
    target: 'share',
    tab: 1,
    title: 'Session teilen',
    body: 'Erzeugt einen Link. Alle Geräte mit dem Link sehen Timer, Workouts und Video synchron und können alles steuern. Die Session verfällt 24 h nach der letzten Änderung.',
  },
  {
    target: 'help',
    tab: 1,
    title: 'Noch was',
    body: 'Diese Tour startest du jederzeit über den ?-Button neu.',
  },
]
```

- [ ] **Step 4: Test ausführen, Erfolg verifizieren**

Run: `cd frontend && npx vitest run src/lib/components/tour.test.ts`
Expected: PASS (9 Tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/components/tour.ts frontend/src/lib/components/tour.test.ts
git commit -m "feat(tour): add tour step definitions and pure logic"
```

---

### Task 2: Tour-Overlay-Komponente (`Tour.svelte`)

**Files:**
- Create: `frontend/src/lib/components/Tour.svelte`
- Test: `frontend/src/lib/components/Tour.test.ts`

**Interfaces:**
- Consumes: `TourStep`, `cardPlacement` aus `./tour` (Task 1).
- Produces: Komponente `Tour` mit Props `{ steps: TourStep[]; onClose: () => void; onTab?: (tab: number) => void }`. `onClose` wird bei „Fertig“, „Überspringen“ und `Escape` aufgerufen. `onTab` wird bei jedem Schritt mit gesetztem `tab` aufgerufen.

- [ ] **Step 1: Failing Test schreiben**

`frontend/src/lib/components/Tour.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, unmount, flushSync } from 'svelte'
import Tour from './Tour.svelte'
import type { TourStep } from './tour'

const steps: TourStep[] = [
  { target: null, title: 'Start', body: 'Erster Schritt' },
  { target: 'ziel-a', tab: 1, title: 'Mitte', body: 'Zweiter Schritt' },
  { target: 'ziel-b', title: 'Ende', body: 'Letzter Schritt' },
]

let component: Record<string, unknown>

function mountTour(props: { onClose?: () => void; onTab?: (tab: number) => void } = {}) {
  component = mount(Tour, {
    target: document.body,
    props: { steps, onClose: props.onClose ?? (() => {}), onTab: props.onTab },
  })
  flushSync()
}

function click(selector: string) {
  ;(document.querySelector(selector) as HTMLButtonElement).click()
  flushSync()
}

describe('Tour', () => {
  afterEach(() => {
    unmount(component)
    document.body.innerHTML = ''
  })

  it('zeigt den ersten Schritt mit Titel, Text und Schrittanzeige', () => {
    mountTour()
    expect(document.querySelector('.tour-title')?.textContent).toBe('Start')
    expect(document.querySelector('.tour-body')?.textContent).toBe('Erster Schritt')
    expect(document.querySelector('.tour-progress')?.textContent).toBe('1/3')
  })

  it('blendet Zurück im ersten Schritt aus und zeigt es danach', () => {
    mountTour()
    expect(document.querySelector('.tour-back')).toBeNull()
    click('.tour-next')
    expect(document.querySelector('.tour-back')).not.toBeNull()
  })

  it('navigiert mit Weiter und Zurück durch die Schritte', () => {
    mountTour()
    click('.tour-next')
    expect(document.querySelector('.tour-title')?.textContent).toBe('Mitte')
    click('.tour-back')
    expect(document.querySelector('.tour-title')?.textContent).toBe('Start')
  })

  it('zeigt im letzten Schritt Fertig und ruft onClose', () => {
    const onClose = vi.fn()
    mountTour({ onClose })
    click('.tour-next')
    click('.tour-next')
    const next = document.querySelector('.tour-next') as HTMLButtonElement
    expect(next.textContent?.trim()).toBe('Fertig')
    next.click()
    flushSync()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('ruft onClose bei Überspringen', () => {
    const onClose = vi.fn()
    mountTour({ onClose })
    click('.tour-skip')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('ruft onClose bei Escape', () => {
    const onClose = vi.fn()
    mountTour({ onClose })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    flushSync()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('meldet den Tab des Schritts über onTab', () => {
    const onTab = vi.fn()
    mountTour({ onTab })
    click('.tour-next')
    expect(onTab).toHaveBeenCalledWith(1)
  })

  it('zeigt die Karte zentriert, wenn der Schritt kein Ziel hat', () => {
    mountTour()
    expect(document.querySelector('.tour-card.center')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Test ausführen, Fehlschlag verifizieren**

Run: `cd frontend && npx vitest run src/lib/components/Tour.test.ts`
Expected: FAIL — `Cannot find module './Tour.svelte'`.

- [ ] **Step 3: Komponente implementieren**

`frontend/src/lib/components/Tour.svelte`:

Hinweis: In jsdom liefert `getBoundingClientRect()` immer Nullen — die Tests prüfen daher Karteninhalt und Navigation, nicht die Spotlight-Geometrie. Ein Ziel gilt nur als gefunden, wenn das Element existiert **und** eine Ausdehnung hat (`width > 0`); in jsdom fällt die Karte damit auf `center` zurück, im Browser nicht.

```svelte
<script lang="ts">
  import { cardPlacement, type TourStep } from './tour'

  let {
    steps,
    onClose,
    onTab,
  }: {
    steps: TourStep[]
    onClose: () => void
    onTab?: (tab: number) => void
  } = $props()

  let index = $state(0)
  const step = $derived(steps[index])
  const isLast = $derived(index === steps.length - 1)

  let targetRect = $state<DOMRect | null>(null)

  function measure() {
    if (!step.target) {
      targetRect = null
      return
    }
    const el = document.querySelector(`[data-tour="${step.target}"]`)
    const rect = el?.getBoundingClientRect() ?? null
    // Element ohne Ausdehnung (nicht sichtbar / jsdom): zentrierte Karte statt Spotlight
    targetRect = rect && rect.width > 0 ? rect : null
  }

  // Bei Schrittwechsel: Tab melden, dann nach dem Rendern (Tab-Wechsel!) das Ziel vermessen
  $effect(() => {
    if (step.tab !== undefined) onTab?.(step.tab)
    targetRect = null
    const frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
  })

  function next() {
    if (isLast) onClose()
    else index += 1
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose()
  }

  const placement = $derived(
    targetRect ? cardPlacement(targetRect.top, targetRect.bottom, window.innerHeight) : 'center'
  )

  const CARD_WIDTH = 320

  const cardStyle = $derived.by(() => {
    if (!targetRect) return ''
    const left = Math.max(16, Math.min(targetRect.left, window.innerWidth - CARD_WIDTH - 16))
    const vertical =
      placement === 'below'
        ? `top: ${targetRect.bottom + 12}px;`
        : `bottom: ${window.innerHeight - targetRect.top + 12}px;`
    return `left: ${left}px; ${vertical}`
  })
</script>

<svelte:window onkeydown={onKeydown} onresize={measure} />

<div class="tour">
  {#if targetRect}
    <div
      class="spotlight"
      style="top: {targetRect.top - 4}px; left: {targetRect.left -
        4}px; width: {targetRect.width + 8}px; height: {targetRect.height + 8}px"
    ></div>
  {:else}
    <div class="backdrop"></div>
  {/if}

  <div class="tour-card" class:center={!targetRect} style={cardStyle}>
    <div class="tour-title">{step.title}</div>
    <div class="tour-body">{step.body}</div>
    <div class="tour-footer">
      <span class="tour-progress">{index + 1}/{steps.length}</span>
      <button class="tour-skip" onclick={onClose}>Überspringen</button>
      {#if index > 0}
        <button class="tour-back" onclick={() => (index -= 1)}>Zurück</button>
      {/if}
      <button class="tour-next" onclick={next}>{isLast ? 'Fertig' : 'Weiter'}</button>
    </div>
  </div>
</div>

<style>
  .tour {
    position: fixed;
    inset: 0;
    z-index: 1000;
  }
  .backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
  }
  .spotlight {
    position: fixed;
    border-radius: 8px;
    /* dunkelt alles außer dem Ziel ab */
    box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.7);
    pointer-events: none;
  }
  .tour-card {
    position: fixed;
    width: 320px;
    max-width: calc(100vw - 32px);
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 16px;
    color: #ddd;
    font-family: monospace;
  }
  .tour-card.center {
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }
  .tour-title {
    font-size: 16px;
    font-weight: 700;
    color: #fff;
    margin-bottom: 8px;
  }
  .tour-body {
    font-size: 13px;
    line-height: 1.5;
    margin-bottom: 14px;
  }
  .tour-footer {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .tour-progress {
    color: #666;
    font-size: 12px;
    margin-right: auto;
  }
  .tour-footer button {
    background: none;
    border: 1px solid #444;
    border-radius: 4px;
    color: #ccc;
    font-family: monospace;
    font-size: 12px;
    padding: 6px 10px;
    cursor: pointer;
  }
  .tour-footer button:hover {
    background: #222;
    color: #fff;
  }
  .tour-skip {
    border-color: transparent;
    color: #666;
  }
  .tour-next {
    border-color: #a8d129;
    color: #a8d129;
  }
</style>
```

- [ ] **Step 4: Test ausführen, Erfolg verifizieren**

Run: `cd frontend && npx vitest run src/lib/components/Tour.test.ts`
Expected: PASS (8 Tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/components/Tour.svelte frontend/src/lib/components/Tour.test.ts
git commit -m "feat(tour): add spotlight tour overlay component"
```

---

### Task 3: `data-tour`-Attribute und ?-Button in der Timer-Leiste

**Files:**
- Modify: `frontend/src/lib/components/TimerBar.svelte`
- Modify: `frontend/src/lib/components/ShareButton.svelte`
- Modify: `frontend/src/lib/components/WorkoutEditor.svelte`
- Modify: `frontend/src/lib/components/VideoPlayer.svelte`

**Interfaces:**
- Consumes: nichts Neues.
- Produces:
  - `data-tour`-Keys im DOM: `timer-bar`, `gear`, `share`, `editor`, `video`, `help` (von Task 2 zur Laufzeit per `querySelector` genutzt).
  - `TimerBar` bekommt die neue, verpflichtende Prop `onStartTour: () => void` (Task 4/5 reicht sie durch). Props-Signatur: `{ onOpenModal: () => void; onStartTour: () => void }`.

- [ ] **Step 1: TimerBar erweitern**

In `frontend/src/lib/components/TimerBar.svelte`:

Props-Zeile ersetzen:

```ts
let { onOpenModal, onStartTour }: { onOpenModal: () => void; onStartTour: () => void } = $props()
```

Handler neben `handleGear` ergänzen:

```ts
function handleHelp(e: MouseEvent) {
  e.stopPropagation()
  onStartTour()
}
```

Root-Div und Zahnrad markieren (nur Attribute ergänzen):

```svelte
<div class="timer-bar" data-tour="timer-bar" onclick={handleClick} role="button" tabindex="-1" onkeydown={() => {}}>
```

```svelte
<button class="gear" data-tour="gear" onclick={handleGear} title="Timer-Einstellungen" aria-label="Timer-Einstellungen">
```

?-Button direkt vor `<ShareButton />` einfügen:

```svelte
<button class="help" data-tour="help" onclick={handleHelp} title="Tour starten" aria-label="Tour starten">?</button>
```

Style ergänzen (analog zu `.gear`/`.share-btn`, links vom Share-Button; im Container-Query-Block `.help` zur bestehenden Regel dazunehmen):

```css
.help {
  position: absolute;
  right: 104px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #444;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 18px;
  font-weight: 700;
  line-height: 22px;
  transition: color 0.15s;
}
.help:hover {
  color: #888;
  background: #222;
}
```

Und im bestehenden `@container (max-aspect-ratio: 3/2)`-Block die Selektorliste erweitern:

```css
.brand,
.gear,
.help {
  top: 20px;
  transform: none;
}
```

- [ ] **Step 2: ShareButton, WorkoutEditor, VideoPlayer markieren**

`ShareButton.svelte` — Button-Zeile:

```svelte
<button class="share-btn" data-tour="share" onclick={handleClick} title={label} aria-label={label}>
```

`WorkoutEditor.svelte` — Root-Element (Zeile ~75):

```svelte
<div class="workout-wrapper" data-tour="editor">
```

`VideoPlayer.svelte` — Root-Element (Zeile ~61):

```svelte
<div class="video-player" data-tour="video">
```

- [ ] **Step 3: Tests und Typecheck ausführen**

Run: `cd frontend && npm test`
Expected: Bestehende Tests PASS. (Hinweis: `App.svelte` reicht `onStartTour` noch nicht durch — `svelte-check` via `npm run build` würde hier fehlschlagen; das löst Task 5 auf. Deshalb in diesem Task nur `npm test`, kein Build.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/components/TimerBar.svelte frontend/src/lib/components/ShareButton.svelte frontend/src/lib/components/WorkoutEditor.svelte frontend/src/lib/components/VideoPlayer.svelte
git commit -m "feat(tour): add data-tour anchors and help button in timer bar"
```

---

### Task 4: `selectTab`-Export in MobileTabs

**Files:**
- Modify: `frontend/src/lib/components/MobileTabs.svelte`
- Test: `frontend/src/lib/components/MobileTabs.test.ts` (erweitern)

**Interfaces:**
- Consumes: nichts Neues.
- Produces: Instanz-Export `selectTab(index: number): void` — schaltet den aktiven Tab um und rastet das Panel sofort (ohne Animation) ein. `App.svelte` (Task 5) ruft ihn über `bind:this` auf.

- [ ] **Step 1: Failing Test schreiben**

In `frontend/src/lib/components/MobileTabs.test.ts` ergänzen (innerhalb des bestehenden `describe`; `mount` gibt die Instanz-Exports zurück, `component` existiert bereits):

```ts
it('schaltet den Tab über den selectTab-Export um', () => {
  mountTabs()
  ;(component as { selectTab: (i: number) => void }).selectTab(2)
  flushSync()
  const tabs = [...document.querySelectorAll('[role="tab"]')]
  expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true'])
})
```

- [ ] **Step 2: Test ausführen, Fehlschlag verifizieren**

Run: `cd frontend && npx vitest run src/lib/components/MobileTabs.test.ts`
Expected: FAIL — `component.selectTab is not a function`.

- [ ] **Step 3: Export implementieren**

In `frontend/src/lib/components/MobileTabs.svelte`, nach der bestehenden `select`-Funktion:

```ts
// Für die Onboarding-Tour: Tab von außen umschalten, ohne Scroll-Animation
export function selectTab(index: number) {
  active = index
  scrollToActive('instant')
}
```

- [ ] **Step 4: Test ausführen, Erfolg verifizieren**

Run: `cd frontend && npx vitest run src/lib/components/MobileTabs.test.ts`
Expected: PASS (7 Tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/components/MobileTabs.svelte frontend/src/lib/components/MobileTabs.test.ts
git commit -m "feat(tour): expose selectTab on MobileTabs for external tab switching"
```

---

### Task 5: Integration in App.svelte, README, Verifikation

**Files:**
- Modify: `frontend/src/App.svelte`
- Modify: `README.md` (Abschnitt „Bedienung“)

**Interfaces:**
- Consumes: `Tour` (Task 2), `desktopSteps`/`mobileSteps`/`shouldAutoStart` (Task 1), `onStartTour`-Prop von `TimerBar` (Task 3), `selectTab` von `MobileTabs` (Task 4).
- Produces: fertiges Feature; keine neuen Schnittstellen.

- [ ] **Step 1: App.svelte integrieren**

Imports ergänzen:

```ts
import Tour from './lib/components/Tour.svelte'
import { desktopSteps, mobileSteps, shouldAutoStart } from './lib/components/tour'
```

State und Handler ergänzen (nach `let showModal = $state(false)`):

```ts
let showTour = $state(false)
let mobileTabs = $state<{ selectTab: (i: number) => void }>()

function endTour() {
  showTour = false
  try {
    localStorage.setItem('wodch.tourDone', '1')
  } catch {
    // localStorage nicht verfügbar — Tour startet dann bei jedem Besuch
  }
}
```

In `onKeydown` als erste Zeile (Tastenkürzel während der Tour aus, Escape behandelt die Tour selbst):

```ts
if (showTour) return
```

In `onMount` ergänzen:

```ts
try {
  showTour = shouldAutoStart(localStorage.getItem('wodch.tourDone'))
} catch {
  showTour = true
}
```

Beide `TimerBar`-Verwendungen (Mobile-Snippet und Desktop-Split) erweitern:

```svelte
<TimerBar onOpenModal={() => (showModal = true)} onStartTour={() => (showTour = true)} />
```

`MobileTabs` referenzieren:

```svelte
<MobileTabs bind:this={mobileTabs}>
```

Tour rendern (nach dem `TimerModal`-Block):

```svelte
{#if showTour}
  <Tour
    steps={isMobile ? mobileSteps : desktopSteps}
    onClose={endTour}
    onTab={(i) => mobileTabs?.selectTab(i)}
  />
{/if}
```

- [ ] **Step 2: README ergänzen**

In `README.md`, Features-Liste, den Punkt **Bedienung** um die Tour erweitern (am Ende der Zeile anhängen):

```markdown
Beim ersten Besuch führt eine kurze Tour durch die Funktionen — jederzeit neu startbar über den ?-Button in der Timer-Leiste.
```

- [ ] **Step 3: Alle Tests und Build ausführen**

Run: `cd frontend && npm test && npm run build`
Expected: alle Tests PASS, `svelte-check` ohne Fehler, Build erfolgreich.

- [ ] **Step 4: Manuelle Verifikation (Dev-Server)**

Run: `cd frontend && npm run dev`
Prüfen (frisches Browserprofil oder `localStorage.removeItem('wodch.tourDone')` in der Konsole):
1. Tour startet automatisch, Willkommens-Karte zentriert.
2. Weiter/Zurück durchläuft alle 7 Schritte, Spotlight sitzt auf Timer-Leiste, Zahnrad, Editor, Video, 📤 und ?.
3. „Fertig“/„Überspringen“/Escape schließen; Reload → keine Tour mehr.
4. ?-Button startet die Tour erneut; Klick auf ? togglet nicht den Timer.
5. Fenster schmal ziehen (<768px): Tour im Mobile-Layout starten → Tabs wechseln automatisch pro Schritt.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.svelte README.md
git commit -m "feat(tour): auto-start onboarding tour on first visit, restart via help button"
```
