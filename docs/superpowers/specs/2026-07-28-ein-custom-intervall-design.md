# Ein einziger Custom-Timer statt 10 Slots

**Datum:** 2026-07-28
**Branch:** feat/ein-custom-intervall

## Ziel

Die 10 benannten Custom-Interval-Slots werden durch **einen** Custom-Timer
ersetzt, der sich die zuletzt benutzten Werte merkt.

Grund: Die Slots waren als Bibliothek gedacht, verhalten sich aber wie ein
Scratchpad mit 10 Feldern. Vier Eigenschaften der aktuellen Umsetzung machen
den Bibliotheks-Nutzen zunichte:

1. **Kein Speichern ohne Start** — der einzige Weg, ein Programm anzulegen, ist
   es zu starten (`applyModalStart`). Vorbereiten vor dem Training geht nicht.
2. **Versehentliches Überschreiben** — Slot auswählen, einen Wert ändern,
   „Start" → der gespeicherte Slot ist weg. Eine Variation laufen zu lassen,
   ohne das Original zu zerstören, ist unmöglich.
3. **Kein Löschen, festes 10er-Raster** — die Preset-Liste zeigt immer zehn
   Einträge, davon typisch neun leere „Custom N".
4. **Gerätelokal** — genau auf dem Gym-Display, wo der Timer läuft, fehlen die
   gespeicherten Namen.

Statt die Bibliothek auszubauen (Speichern/Speichern-als/Löschen, Sync ins
Session-Dokument) wird das Feature auf seinen tatsächlichen Nutzungsfall
reduziert: ein Ad-hoc-Intervall für das Workout von heute. Die Probleme 1–4
lösen sich durch Weglassen.

## Verhalten

- Die Intervall-Preset-Liste enthält genau einen Custom-Eintrag mit dem festen
  Label `Custom` (vorher zehn Einträge mit variablen Labels).
- Auswahl von „Custom" füllt die Formularfelder mit den gespeicherten Werten,
  sonst mit den Defaults (5 Runden, 5:00 Work, 1:00 Rest).
- „Start" speichert die Formularwerte, wendet sie an und startet — wie bisher.
  Die Auswahl allein speichert nichts.
- **Kein Name mehr.** Das Feld existierte nur, um in einer Liste aus zehn
  gleich aussehenden Einträgen den richtigen zu finden. Bei einem einzigen
  Eintrag trägt es keine Information: die Werte sind im Formular sichtbar,
  sobald „Custom" ausgewählt ist.
- Die gespeicherten Werte bleiben **gerätelokal** (`localStorage`) und werden
  nicht Teil des Session-Dokuments. Synchronisiert werden wie bisher nur die
  aufgelösten Werte im `TimerDoc` (`workDuration`, `restDuration`,
  `totalRounds`, `preset: 'custom'`) — der Timer läuft auf allen Geräten
  identisch.
- Bereits gespeicherte alte Slots werden **nicht migriert** (siehe Persistenz).

## Umsetzung

### 1. Datenmodell

`frontend/src/lib/types.ts` und `server/src/types.ts` (identische Definition in
beiden Paketen):

```ts
export type IntervalPreset = 'tabata' | 'fgb1' | 'fgb2' | 'emom' | 'custom'

export interface CustomInterval {
  rounds: number
  workDuration: number // ms
  restDuration: number // ms
}
```

Der Template-Literal-Typ `` `custom-${number}` `` und das Feld `name` fallen
weg. `TimerDoc` bleibt unverändert.

### 2. Store — `frontend/src/lib/stores/timer.svelte.ts`

- `CUSTOM_KEY` wird zu `'wodch-custom-interval'` (Singular).
- `customIntervals = $state<CustomInterval[]>([])` wird zu
  `customInterval = $state<CustomInterval | null>(null)`.
- `loadCustomIntervals()` → `loadCustomInterval()`: liest ein Objekt statt
  einer Liste, validiert die drei Felder als endliche Zahlen und ignoriert
  korrupte Daten still (bestehendes Verhalten). Löscht zusätzlich den alten Key
  `wodch-custom-intervals`, damit keine toten Daten liegenbleiben.
- `saveCustomInterval(slot, interval)` → `saveCustomInterval(interval)`: das
  Auffüllen leerer Slots (`while (list.length <= slot) …`) entfällt komplett.
- In `applyPreset` wird der `preset.startsWith('custom-')`-Zweig zu
  `preset === 'custom'`; `parseInt` und die Slot-Auflösung entfallen. Ohne
  gespeicherte Werte bleibt der Aufruf ein No-Op (bestehendes Verhalten für
  leere Slots).

### 3. Persistenz — keine Migration

Neuer Key mit neuer Form (Objekt statt Liste). Die alten 10 Slots werden nicht
übernommen: welcher davon der „richtige" wäre, ist willkürlich, und die Werte
sind in Sekunden neu eingegeben.

Der Key-Wechsel macht beide Formen kollisionsfrei — ein Objekt wird nie als
Liste gelesen und umgekehrt. Der alte Key wird jedoch bei jedem Laden
unbedingt gelöscht: Ein Tab mit noch altem Code verliert dadurch seine
gespeicherten Slots, sobald ein Tab mit neuem Code geöffnet wird. Das ist
beabsichtigt — die alten Daten werden ohnehin nicht migriert.

### 4. UI — `frontend/src/lib/components/TimerModal.svelte`

- Die `Array.from({ length: 10 }, …)`-Erzeugung in `presets` wird zu einem
  Literal `{ value: 'custom', label: 'Custom' }`. Damit ist `presets` nicht
  mehr von `timer.customIntervals` abhängig und kann von `$derived` auf eine
  Konstante zurückgehen.
- Die `customSlot`-Ableitung und der `$effect`, der Slot-Werte nachlädt, werden
  durch eine einmalige Initialisierung der Formular-States aus
  `timer.customInterval` ersetzt (das Modal wird pro Öffnen neu gemountet, ein
  reaktives Nachladen bei Preset-Wechsel ist nicht mehr nötig).
- `customName` und das zugehörige Textfeld (`maxlength="20"`) entfallen.
- `selectedPreset?.startsWith('custom-')` wird an beiden Stellen
  (`onPresetChange`, Block-Bedingung im Markup) zu `selectedPreset === 'custom'`.

### 5. Formular-Übergabe — `frontend/src/lib/components/modalStart.ts`

- `ModalForm` verliert `customName`.
- Der Custom-Zweig verliert `parseInt`/`Number.isFinite` und den
  `Custom ${slot + 1}`-Fallback-Namen; er ruft `saveCustomInterval({ rounds,
  workDuration, restDuration })` und dann `applyPreset('custom')`.

### 6. Server-Validierung — `server/src/store.ts`

`INTERVAL_PRESETS` bekommt `'custom'`. Die Alternative `/^custom-\d+$/` bleibt
mit einem Kommentar erhalten, damit Patches von noch offenen alten Clients
nicht still verworfen werden — ein Browser-Tab am Gym-Display bleibt
realistisch stundenlang offen, und Frontend und Backend sind getrennte
Deployments ohne garantierte Rollout-Reihenfolge. Nicht nötig ist die Toleranz
für persistierte Daten: der Session-Store ist eine In-Memory-`Map`, ein
Backend-Restart löscht alle Sessions. Die Legacy-Alternative kann in einem
Folge-Commit entfernt werden.

### 7. Tests

Bestehende Tests anpassen (kein neues Testkonzept nötig, die Fälle bleiben
dieselben):

- `frontend/src/lib/stores/timer.test.ts` — „custom interval: speichern, laden,
  anwenden" ohne Slot-Index und ohne `name`; der Default-Test prüft
  `customInterval === null` statt `[]`.
- `frontend/src/lib/components/modalStart.test.ts` — Form-Fixture ohne
  `customName`, Preset `'custom'`, Assertion auf `timer.customInterval`.
- `server/test/store.test.ts` — Randfall-Test von `preset: 'custom-3'` auf
  `preset: 'custom'` umstellen; ein zusätzlicher Fall hält die weiterhin
  akzeptierte Legacy-Form `'custom-3'` fest.

Ergänzend ein Test, dass `loadCustomInterval()` eine alte Liste unter dem neuen
Key still ignoriert und `customInterval` auf `null` bleibt.

### 8. Doku

- `README.md` — „10 Custom-Slots" → „Custom".
- `docs/rewrite-requirements.md` — Preset-Tabelle (Zeile 43), Persistenz-Absatz
  mit Key-Name (45), Custom-Namen-Labels (46), Modal-Felder (69), „speichert
  Custom-Slot" (71) sowie das Session-Dokument-Schema (104), das
  `customIntervals` fälschlich als synchronisiertes Feld führt — das war schon
  vor dieser Änderung falsch.

## Nicht Teil dieser Änderung

- Verkettete Intervall-Programme (Sequenz aus mehreren Work/Rest-Blöcken).
- Sync der Custom-Werte über das Session-Dokument. Die Doku-Korrektur in
  Kapitel 8 stellt nur den Ist-Zustand richtig und schafft keine neue
  Sync-Funktionalität.
- Ein „Speichern ohne Start" — mit nur einem Custom-Timer, der sich seine Werte
  ohnehin merkt, gibt es nichts vorzubereiten.
