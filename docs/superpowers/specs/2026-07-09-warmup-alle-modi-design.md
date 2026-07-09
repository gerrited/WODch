# Warmup für alle Timer-Modi

**Datum:** 2026-07-09
**Branch:** feature/onboarding-tour

## Ziel

Das Warmup (Vorlaufphase, die vor dem eigentlichen Timer runterzählt) soll nicht
nur beim Intervall-Modus, sondern auch bei **Stoppuhr**, **Count-Down** und
**Count-Up** verfügbar sein. Der Uhrzeit-Modus (`clock`) bleibt ausgenommen.

Zusätzlich werden zwei bestehende Defekte behoben, die beim Verdrahten sichtbar
werden:

1. **Latenter Phasen-Bug:** `timer.derived` ruft immer `deriveInterval` auf,
   unabhängig vom Modus. Bei laufender Stoppuhr liefert das fälschlich Phasen
   `work`/`rest`/`done`. Es fällt heute nur nicht auf, weil `displayTime`/
   `displayRound` diese Werte für Nicht-Intervall-Modi ignorieren. Sobald eine
   Warmup-Farbe an `derived.phase` hängt, muss die Ableitung modus-bewusst sein.
2. **EMOM/Custom-Warmup funktioniert nicht:** `applyPreset` setzt in seinem
   `base` immer `warmupEnabled: false`. Für EMOM und Custom ruft
   `applyModalStart` `applyPreset` *nach* dem `setConfig({ warmupEnabled })` aus
   `handleStart` auf und überschreibt das gerade aktivierte Warmup wieder.

## Verhalten

- Warmup ist eine gemeinsame Vorlaufphase für alle Modi außer `clock`.
- `warmup = warmupEnabled ? warmupDuration : 0`. Während `elapsed < warmup` gilt
  Phase `warmup`, angezeigte Zeit ist die Warmup-Restzeit `warmup - elapsed`.
- Nach Ablauf des Warmups rechnen Stoppuhr/Count-Down/Count-Up mit der
  korrigierten Laufzeit `elapsed - warmup`; das Intervall verhält sich wie bisher.
- Während des Warmups:
  - **Signalfarbe** Orange-Gelb (`#f0a500`), zusätzlich zu `work` (rot) und
    `rest` (grün). Gilt automatisch auch für den bestehenden Intervall-Warmup.
  - **Label** `"WARMUP"` im vorhandenen Runden-Slot der Timer-Bar.

## Umsetzung

### 1. Datenmodell — keine Änderung
`warmupEnabled` + `warmupDuration` existieren bereits im `TimerDoc`. Sie gelten
künftig für alle Nicht-Uhrzeit-Modi.

### 2. Engine (`frontend/src/lib/timer/engine.ts`)
- `Derived` wird modus-bewusst. Neben `idle` erhalten die einfachen Modi die
  Phasen `warmup` und `running` (Count-Down zusätzlich `done`). Intervall behält
  `warmup`/`work`/`rest`/`done`.
- Warmup-Rest gemeinsam ableiten und vor der modus-spezifischen Berechnung prüfen.
- `displayTime`: bei Phase `warmup` die Warmup-Restzeit zeigen; sonst wie bisher,
  jedoch mit um das Warmup korrigierter Laufzeit für Stoppuhr/Count-Down/Count-Up.
- `displayRound`: gibt bei Phase `warmup` `"WARMUP"` zurück (für alle Modi), sonst
  unverändert.

### 3. Store & Modal
- **`frontend/src/lib/stores/timer.svelte.ts`:** `warmupEnabled: false` aus dem
  `base`-Objekt in `applyPreset` entfernen (Warmup orthogonal zum Preset).
- **`frontend/src/lib/components/modalStart.ts`:** Bedingung
  `form.mode === 'interval'` durch „alle Modi außer `clock`" ersetzen; Warmup-Dauer
  wird übernommen, wenn aktiviert.
- **`frontend/src/lib/components/TimerModal.svelte`:** Warmup-Sektion für
  `stopwatch`, `countdown`, `countup`, `interval` anzeigen (nicht bei `clock`).

### 4. Timer-Bar (`frontend/src/lib/components/TimerBar.svelte`)
- `class:warmup={timer.derived.phase === 'warmup'}` mit CSS-Regel `.time.warmup`
  in Signalfarbe `#f0a500`.

### 5. Tests
- `engine.test.ts`: Warmup-Fälle für Stoppuhr/Count-Down/Count-Up (Phase,
  Restzeit, Übergang nach Warmup) plus modus-bewusste `derived`-Ableitung.
- `modalStart.test.ts`: Warmup-Übernahme für Nicht-Intervall-Modi und EMOM/Custom.
- `timer.test.ts`: `applyPreset` überschreibt `warmupEnabled` nicht mehr.

## Nicht im Scope (YAGNI)
- Warmup für den Uhrzeit-Modus.
- Konfigurierbare Warmup-Farbe oder Sound-Cues.
