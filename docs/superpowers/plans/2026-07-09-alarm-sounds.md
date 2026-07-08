# Alarm-Sounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kurzer Piepton bei 3, 2, 1 Sekunden Restzeit und langer Ton bei 0 bzw. Phasenwechsel — im countdown- und interval-Modus.

**Architecture:** Ein purer Cue-Detektor (`lib/audio/cues.ts`) vergleicht zwei aufeinanderfolgende Timer-Schnappschüsse und liefert `'short' | 'long' | null`. Ein Sound-Store (`lib/audio/beeps.svelte.ts`) synthetisiert Beeps per Web Audio API und hält den Mute-State (localStorage). Verdrahtet wird per `$effect` in `App.svelte`; der Mute-Button sitzt in `TimerBar.svelte`.

**Tech Stack:** Svelte 5 (Runes), TypeScript, Vitest, Web Audio API. Frontend liegt unter `frontend/`; alle Pfade unten sind relativ zu `frontend/`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-09-alarm-sounds-design.md`
- localStorage-Key für Mute: `wodch-sound-muted` (Wert `'1'` = stumm; fehlend/anderes = Ton an)
- Kurzer Ton: 880 Hz, 150 ms. Langer Ton: 880 Hz, 700 ms.
- Töne nur bei `isRunning`; keine Töne in den Modi clock/stopwatch/countup.
- Kein „Nachpiepen" bei Sync-Sprüngen: Cues feuern nur, wenn die Restzeit-Sekunde exakt um 1 fällt bzw. ein Phasenwechsel aus Sekunde 1 heraus passiert.
- Tests laufen mit `npx vitest run <datei>` im Verzeichnis `frontend/`.
- Kommentare im Code auf Deutsch (bestehende Konvention, siehe `lib/timer/engine.ts`).

---

### Task 1: Cue-Detektor (`lib/audio/cues.ts`)

**Files:**
- Create: `frontend/src/lib/audio/cues.ts`
- Test: `frontend/src/lib/audio/cues.test.ts`

**Interfaces:**
- Consumes: `TimerDoc` aus `../types`, `Derived` aus `../timer/engine`
- Produces:
  - `type Cue = 'short' | 'long' | null`
  - `interface CueSnapshot { isRunning: boolean; phase: 'countdown' | 'warmup' | 'work' | 'rest' | 'done'; round: number; secondsLeft: number }`
  - `function snapshot(doc: TimerDoc, derived: Derived, elapsed: number): CueSnapshot | null`
  - `function detectCue(prev: CueSnapshot | null, next: CueSnapshot | null): Cue`

- [ ] **Step 1: Failing Tests schreiben**

`frontend/src/lib/audio/cues.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { snapshot, detectCue, type CueSnapshot } from './cues'
import { deriveInterval } from '../timer/engine'
import { defaultTimerDoc, type TimerDoc } from '../types'

const SEC = 1000

function doc(overrides: Partial<TimerDoc> = {}): TimerDoc {
  return { ...defaultTimerDoc(), ...overrides }
}

// Schnappschuss für einen laufenden Countdown bei gegebener elapsed-Zeit
function cdSnap(elapsed: number, running = true): CueSnapshot | null {
  const d = doc({ mode: 'countdown', isRunning: running, countdownTarget: 10 * SEC })
  return snapshot(d, { phase: 'idle' }, elapsed)
}

// Schnappschuss für laufendes Tabata-Interval (20s/10s × 8, ohne Warmup)
function ivSnap(elapsed: number, running = true): CueSnapshot | null {
  const d = doc({ mode: 'interval', isRunning: running, warmupEnabled: false })
  return snapshot(d, deriveInterval(d, elapsed, true), elapsed)
}

describe('snapshot', () => {
  it('countdown: secondsLeft = aufgerundete Restsekunden, geklemmt auf 0', () => {
    expect(cdSnap(6500)).toEqual({ isRunning: true, phase: 'countdown', round: 0, secondsLeft: 4 })
    expect(cdSnap(11 * SEC)!.secondsLeft).toBe(0)
  })

  it('interval: Phase/Runde/Restsekunden aus Derived', () => {
    expect(ivSnap(17 * SEC)).toEqual({ isRunning: true, phase: 'work', round: 1, secondsLeft: 3 })
  })

  it('interval idle sowie clock/stopwatch/countup liefern null', () => {
    const idle = doc({ mode: 'interval' })
    expect(snapshot(idle, { phase: 'idle' }, 0)).toBeNull()
    for (const mode of ['clock', 'stopwatch', 'countup'] as const) {
      expect(snapshot(doc({ mode, isRunning: true }), { phase: 'idle' }, 5 * SEC)).toBeNull()
    }
  })
})

describe('detectCue: Countdown 10s', () => {
  it('kurzer Ton beim Wechsel auf 3, 2, 1', () => {
    expect(detectCue(cdSnap(6900), cdSnap(7100))).toBe('short') // 4 → 3
    expect(detectCue(cdSnap(7900), cdSnap(8100))).toBe('short') // 3 → 2
    expect(detectCue(cdSnap(8900), cdSnap(9100))).toBe('short') // 2 → 1
  })

  it('langer Ton bei 0', () => {
    expect(detectCue(cdSnap(9900), cdSnap(10_100))).toBe('long') // 1 → 0
  })

  it('kein Ton oberhalb von 4s, innerhalb derselben Sekunde oder nach 0', () => {
    expect(detectCue(cdSnap(4900), cdSnap(5100))).toBeNull() // 6 → 5
    expect(detectCue(cdSnap(7100), cdSnap(7200))).toBeNull() // 3 → 3
    expect(detectCue(cdSnap(10_100), cdSnap(10_300))).toBeNull() // 0 → 0
  })

  it('kein Ton wenn pausiert', () => {
    expect(detectCue(cdSnap(7900, false), cdSnap(8100, false))).toBeNull()
    expect(detectCue(cdSnap(7900), cdSnap(8100, false))).toBeNull()
  })

  it('kein Nachpiepen bei Sync-Sprung (>1s)', () => {
    expect(detectCue(cdSnap(2 * SEC), cdSnap(9500))).toBeNull() // 8 → 1
  })
})

describe('detectCue: Interval (Tabata 20s/10s × 8)', () => {
  it('kurze Töne am Ende der work-Phase (3, 2, 1)', () => {
    expect(detectCue(ivSnap(16_900), ivSnap(17_100))).toBe('short') // work 4 → 3
    expect(detectCue(ivSnap(18_900), ivSnap(19_100))).toBe('short') // work 2 → 1
  })

  it('langer Ton beim Phasenwechsel work → rest', () => {
    expect(detectCue(ivSnap(19_900), ivSnap(20_100))).toBe('long')
  })

  it('langer Ton beim Wechsel rest → work (nächste Runde)', () => {
    expect(detectCue(ivSnap(29_900), ivSnap(30_100))).toBe('long')
  })

  it('langer Ton beim Ende der letzten Runde (→ done)', () => {
    expect(detectCue(ivSnap(239_900), ivSnap(240_100))).toBe('long')
  })

  it('langer Ton beim Wechsel warmup → work', () => {
    const d = doc({ mode: 'interval', isRunning: true, warmupEnabled: true }) // Warmup 10s
    const s = (e: number) => snapshot(d, deriveInterval(d, e, true), e)
    expect(detectCue(s(9_900), s(10_100))).toBe('long')
  })

  it('EMOM (rest=0): langer Ton beim Rundenwechsel work → work', () => {
    const d = doc({ mode: 'interval', isRunning: true, workDuration: 60 * SEC, restDuration: 0, totalRounds: 10 })
    const s = (e: number) => snapshot(d, deriveInterval(d, e, true), e)
    expect(detectCue(s(59_900), s(60_100))).toBe('long')
  })

  it('kein Ton bei Phasenwechsel durch Sync-Sprung (nicht aus Sekunde 1)', () => {
    expect(detectCue(ivSnap(5 * SEC), ivSnap(25 * SEC))).toBeNull() // work s15 → rest
  })

  it('kein Ton beim Start (prev = null)', () => {
    expect(detectCue(null, ivSnap(100))).toBeNull()
  })
})
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `cd frontend && npx vitest run src/lib/audio/cues.test.ts`
Expected: FAIL — `Cannot find module './cues'` (o. ä.)

- [ ] **Step 3: Implementierung schreiben**

`frontend/src/lib/audio/cues.ts`:

```ts
import type { TimerDoc } from '../types'
import type { Derived } from '../timer/engine'

export type Cue = 'short' | 'long' | null

export interface CueSnapshot {
  isRunning: boolean
  phase: 'countdown' | 'warmup' | 'work' | 'rest' | 'done'
  round: number
  secondsLeft: number
}

// Reduziert den Timer-Zustand auf das, was für Ton-Cues relevant ist.
// null = Modus/Phase ohne Töne (clock, stopwatch, countup, interval-idle).
export function snapshot(doc: TimerDoc, derived: Derived, elapsed: number): CueSnapshot | null {
  if (doc.mode === 'countdown') {
    const secondsLeft = Math.max(0, Math.ceil((doc.countdownTarget - elapsed) / 1000))
    return { isRunning: doc.isRunning, phase: 'countdown', round: 0, secondsLeft }
  }
  if (doc.mode === 'interval') {
    if (derived.phase === 'idle') return null
    if (derived.phase === 'done') return { isRunning: doc.isRunning, phase: 'done', round: 0, secondsLeft: 0 }
    return {
      isRunning: doc.isRunning,
      phase: derived.phase,
      round: derived.round,
      secondsLeft: Math.ceil(derived.remaining / 1000),
    }
  }
  return null
}

// Vergleicht zwei aufeinanderfolgende Ticks. Cues feuern nur bei natürlichem
// Sekundenwechsel (Differenz genau 1) bzw. Phasenwechsel aus Sekunde 1 heraus —
// Sync-Sprünge (applyRemote, Tab im Hintergrund) erzeugen so keine Töne.
export function detectCue(prev: CueSnapshot | null, next: CueSnapshot | null): Cue {
  if (!prev || !next) return null
  if (!prev.isRunning || !next.isRunning) return null
  if (prev.phase !== next.phase || prev.round !== next.round) {
    return prev.secondsLeft === 1 ? 'long' : null
  }
  if (prev.secondsLeft - next.secondsLeft !== 1) return null
  if (next.secondsLeft === 0) return 'long'
  if (next.secondsLeft <= 3) return 'short'
  return null
}
```

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `cd frontend && npx vitest run src/lib/audio/cues.test.ts`
Expected: PASS (alle Tests grün)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/audio/cues.ts frontend/src/lib/audio/cues.test.ts
git commit -m "feat(audio): add pure cue detector for countdown beeps"
```

---

### Task 2: Sound-Store mit Web Audio und Mute (`lib/audio/beeps.svelte.ts`)

**Files:**
- Create: `frontend/src/lib/audio/beeps.svelte.ts`
- Test: `frontend/src/lib/audio/beeps.test.ts`

**Interfaces:**
- Consumes: nichts aus anderen Tasks
- Produces: Singleton `sound` mit
  - `sound.muted: boolean` (reaktiv, `$state`)
  - `sound.toggleMuted(): void` — invertiert und persistiert unter `wodch-sound-muted`
  - `sound.unlock(): void` — erzeugt/entsperrt den AudioContext (bei User-Geste aufrufen)
  - `sound.beepShort(): void` / `sound.beepLong(): void` — spielen 880 Hz für 150 ms bzw. 700 ms; still bei `muted`
  - Export `MUTE_KEY = 'wodch-sound-muted'`

- [ ] **Step 1: Failing Tests für Mute-Persistenz schreiben**

Die Audio-Ausgabe selbst wird nicht getestet (lt. Spec); getestet wird Mute-State und Persistenz. `AudioContext` existiert in jsdom nicht — `beepShort`/`beepLong`/`unlock` dürfen deshalb ohne AudioContext nicht werfen.

`frontend/src/lib/audio/beeps.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { SoundStore, MUTE_KEY } from './beeps.svelte'

describe('SoundStore Mute-Persistenz', () => {
  beforeEach(() => localStorage.clear())

  it('Standard: nicht stumm', () => {
    expect(new SoundStore().muted).toBe(false)
  })

  it('lädt muted aus localStorage', () => {
    localStorage.setItem(MUTE_KEY, '1')
    expect(new SoundStore().muted).toBe(true)
  })

  it('toggleMuted persistiert', () => {
    const s = new SoundStore()
    s.toggleMuted()
    expect(s.muted).toBe(true)
    expect(localStorage.getItem(MUTE_KEY)).toBe('1')
    s.toggleMuted()
    expect(localStorage.getItem(MUTE_KEY)).toBe('0')
  })

  it('beep/unlock werfen nicht ohne AudioContext (jsdom)', () => {
    const s = new SoundStore()
    expect(() => {
      s.unlock()
      s.beepShort()
      s.beepLong()
    }).not.toThrow()
  })
})
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `cd frontend && npx vitest run src/lib/audio/beeps.test.ts`
Expected: FAIL — Modul nicht gefunden

- [ ] **Step 3: Implementierung schreiben**

`frontend/src/lib/audio/beeps.svelte.ts`:

```ts
export const MUTE_KEY = 'wodch-sound-muted'

// Web-Audio-Beeps + Mute-State. AudioContext wird lazy erzeugt und muss per
// unlock() aus einer User-Geste heraus entsperrt werden (Autoplay-Policy).
export class SoundStore {
  muted = $state(false)
  private ctx: AudioContext | null = null

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1'
    } catch {
      // korrupte Daten ignorieren
    }
  }

  toggleMuted() {
    this.muted = !this.muted
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0')
    } catch {
      // localStorage nicht verfügbar — Einstellung gilt nur für die Sitzung
    }
  }

  unlock() {
    if (typeof AudioContext === 'undefined') return
    this.ctx ??= new AudioContext()
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  beepShort() {
    this.beep(150)
  }

  beepLong() {
    this.beep(700)
  }

  private beep(durationMs: number) {
    if (this.muted) return
    if (typeof AudioContext === 'undefined') return
    this.ctx ??= new AudioContext()
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = 880
    // kurze Rampen gegen Knacken an Start und Ende
    const t0 = ctx.currentTime
    const t1 = t0 + durationMs / 1000
    gain.gain.setValueAtTime(0, t0)
    gain.gain.linearRampToValueAtTime(0.3, t0 + 0.01)
    gain.gain.setValueAtTime(0.3, t1 - 0.02)
    gain.gain.linearRampToValueAtTime(0, t1)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t0)
    osc.stop(t1)
  }
}

export const sound = new SoundStore()
```

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `cd frontend && npx vitest run src/lib/audio/beeps.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/audio/beeps.svelte.ts frontend/src/lib/audio/beeps.test.ts
git commit -m "feat(audio): add web-audio beep player with persisted mute"
```

---

### Task 3: Verdrahtung in App.svelte und Mute-Button in TimerBar

**Files:**
- Modify: `frontend/src/App.svelte` ($effect für Cues, unlock bei Space)
- Modify: `frontend/src/lib/components/TimerBar.svelte` (Mute-Button, unlock bei Klick)

**Interfaces:**
- Consumes: `snapshot`, `detectCue`, `CueSnapshot` aus `lib/audio/cues`; `sound` aus `lib/audio/beeps.svelte`
- Produces: nichts (Endverdrahtung)

- [ ] **Step 1: App.svelte erweitern**

Im `<script>`-Block von `frontend/src/App.svelte` — Imports ergänzen:

```ts
import { detectCue, snapshot, type CueSnapshot } from './lib/audio/cues'
import { sound } from './lib/audio/beeps.svelte'
```

Nach der `isMobile`-Deklaration den Cue-Effect einfügen:

```ts
// Ton-Cues: bei jedem Tick den Schnappschuss vergleichen und ggf. piepen
let prevSnap: CueSnapshot | null = null
$effect(() => {
  const next = snapshot(timer.doc, timer.derived, timer.elapsed)
  const cue = detectCue(prevSnap, next)
  prevSnap = next
  if (cue === 'short') sound.beepShort()
  else if (cue === 'long') sound.beepLong()
})
```

In `onKeydown` den Space-Zweig ergänzen (AudioContext bei Tastatur-Geste entsperren):

```ts
if (e.code === 'Space') {
  e.preventDefault()
  sound.unlock()
  timer.toggle()
}
```

- [ ] **Step 2: TimerBar.svelte erweitern**

Import ergänzen:

```ts
import { sound } from '../audio/beeps.svelte'
```

`handleClick` entsperrt den AudioContext (erste User-Geste):

```ts
function handleClick() {
  sound.unlock()
  if (barAction(timer.doc, timer.derived, timer.elapsed) === 'modal') onOpenModal()
  else timer.toggle()
}
```

Neuer Handler:

```ts
function handleMute(e: MouseEvent) {
  e.stopPropagation()
  sound.unlock()
  sound.toggleMuted()
}
```

Im Markup vor dem Gear-Button einfügen (Lautsprecher an/aus, Feather-Icons volume-2/volume-x):

```svelte
<button class="gear mute" onclick={handleMute} title={sound.muted ? 'Ton einschalten' : 'Ton ausschalten'} aria-label={sound.muted ? 'Ton einschalten' : 'Ton ausschalten'}>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    {#if sound.muted}
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    {:else}
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    {/if}
  </svg>
</button>
```

Im `<style>`-Block: der Mute-Button erbt die `.gear`-Optik, sitzt aber links vom Zahnrad:

```css
.gear.mute {
  right: 52px;
}
```

Und im Container-Query-Block (`@container (max-aspect-ratio: 3/2)`) den Selektor erweitern — aus:

```css
.brand,
.gear {
  top: 20px;
  transform: none;
}
```

wird:

```css
.brand,
.gear,
.gear.mute {
  top: 20px;
  transform: none;
}
```

(Hinweis: `.gear` deckt `.gear.mute` bereits ab — die explizite Erweiterung ist nur nötig, falls der Selektor später spezifischer wird; wenn `.gear` genügt, diesen Schritt auslassen.)

- [ ] **Step 3: Gesamte Test-Suite und Build prüfen**

Run: `cd frontend && npx vitest run && npm run build`
Expected: alle Tests PASS, Build ohne Fehler

- [ ] **Step 4: Manuell verifizieren**

Run: `cd frontend && npm run dev`
- Countdown auf z. B. 10 s stellen, starten: bei 3/2/1 kurzer Piep, bei 0 langer Piep.
- Tabata starten: kurze Pieps am Ende jeder work-/rest-Phase, langer Piep beim Phasenwechsel und am Ende.
- Mute-Button klicken: Icon wechselt, keine Töne mehr; Reload → Einstellung bleibt.
- Stopwatch/Countup/Clock: keine Töne.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.svelte frontend/src/lib/components/TimerBar.svelte
git commit -m "feat(audio): wire countdown beeps into app and add mute toggle"
```
