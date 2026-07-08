# Design: Alarm-Sounds für Countdown und Interval

**Datum:** 2026-07-09
**Status:** Genehmigt

## Ziel

Beim Herunterzählen soll ein kurzer Ton bei 3, 2 und 1 Sekunden Restzeit ertönen und ein langer Ton bei 0. Das gilt für den **countdown**-Modus und für jede Phase im **interval**-Modus (warmup, work, rest — inklusive Übergang in `done`). Die Modi stopwatch, countup und clock bleiben stumm.

## Architektur

Zwei neue Module unter `frontend/src/lib/audio/`, verdrahtet über ein `$effect` in `App.svelte`. Die Cue-Erkennung ist — wie die bestehende Timer-Ableitung in `lib/timer/engine.ts` — eine pure Funktion und damit deterministisch und unit-testbar. Die Audio-Ausgabe ist davon getrennt.

### `lib/audio/beeps.ts` — Sound-Ausgabe

- Web Audio API, Beeps per Oszillator synthetisiert (keine Audio-Assets).
- `beepShort()`: ~880 Hz, 150 ms. `beepLong()`: ~880 Hz, 700 ms.
- AudioContext wird lazy erzeugt; `unlock()` wird bei der ersten Nutzer-Geste aufgerufen (Klick auf die TimerBar), um die Autoplay-Policy der Browser zu erfüllen.
- Mute-State: `muted` wird unter dem localStorage-Key `wodch-sound-muted` persistiert (pro Gerät, Standard: Ton an). Bei `muted` spielen `beepShort`/`beepLong` nichts ab.

### `lib/audio/cues.ts` — Cue-Erkennung

Pure Funktion `detectCue(prev, next)`, die zwei aufeinanderfolgende Timer-Zustände (Modus, Phase, Runde, Restzeit, isRunning) vergleicht und `'short' | 'long' | null` liefert:

- **Kurzer Ton**, wenn `ceil(remaining / 1000)` auf 3, 2 oder 1 wechselt.
- **Langer Ton**, wenn die Restzeit 0 erreicht bzw. die Phase wechselt: warmup→work, work→rest, rest→work (nächste Runde), letzte Runde→done, Countdown abgelaufen.
- Cues nur bei `isRunning` — Reset, Pause oder Konfigurationsänderungen erzeugen keine Töne.
- **Dedupe/Sync-Sprünge:** Springt die Restzeit um mehr als eine Sekunde (Remote-Sync via `applyRemote`, Tab war im Hintergrund), wird nicht „nachgepiept". Pro Cue-Schlüssel (Phase + Runde + Sekunde) höchstens ein Ton.

### Verdrahtung in `App.svelte`

Ein `$effect` beobachtet `timer.doc`, `timer.derived` und die Restzeit (getrieben vom bestehenden 10-ms-Tick des TimerStore), ruft `detectCue` auf und spielt den resultierenden Ton ab.

### Mute-Button in `TimerBar.svelte`

Lautsprecher-Icon neben dem Zahnrad (gleiche Optik: `stroke="currentColor"`, Farbe `#444`, Hover `#888`), mit `e.stopPropagation()` wie beim Gear-Button, damit der Klick den Timer nicht togglet. Icon-Zustand: Lautsprecher (an) / durchgestrichener Lautsprecher (aus).

## Fehlerfälle

- **Autoplay-Policy:** Auf Geräten, die eine Session nur empfangen und nie angetippt wurden, bleibt der AudioContext gesperrt — es bleibt still, bis einmal interagiert wurde. Browser-Restriktion, kein Workaround.
- **Remote-Sync:** Jeder Client piept lokal auf Basis seiner deterministisch abgeleiteten Restzeit; es gibt keine Sound-Nachrichten über die Session.
- **Korruptes localStorage:** wird ignoriert, Standard „Ton an" (gleiches Muster wie `loadCustomIntervals`).

## Tests

- Unit-Tests (Vitest) für `detectCue`: Countdown 4→3→2→1→0, alle Interval-Phasenwechsel, Warmup, letzte Runde→done, keine Cues bei Pause/Reset/stopwatch/countup, Dedupe bei Sync-Sprüngen.
- Mute-Persistenz: Setzen/Laden des localStorage-Keys.
- `beeps.ts` (Audio-Ausgabe selbst) wird nicht automatisiert getestet.
