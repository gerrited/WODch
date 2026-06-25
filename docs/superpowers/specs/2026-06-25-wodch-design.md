# WODch — Design Spec

**Datum:** 2026-06-25  
**Status:** Genehmigt

---

## Überblick

WODch ist eine Web-App für CrossFit-/Gym-Trainings. Sie kombiniert einen Workout-Editor, einen vollwertigen Gym-Timer (vergleichbar mit dem Rogue Fitness Echo Gym Timer 2.0) und einen Video-Player in einem flexibel anpassbaren Layout.

---

## Layout

Das Layout besteht aus zwei Zeilen, deren Höhe per Drag angepasst werden kann.

### Zeile 1 — Timer-Leiste (Standard: 15% Höhe)
Zeigt Rundenanzeige und Timer horizontal zentriert nebeneinander:
```
          3 / 8    12:34
```
- Rundenanzeige links vom Timer
- Beide Elemente gemeinsam horizontal zentriert
- Klick auf die Leiste öffnet das Timer-Modal
- Mindesthöhe: 40px

### Zeile 2 — Hauptbereich (Standard: 85% Höhe)
Zwei horizontal angeordnete Panes, deren Breite per Drag angepasst werden kann (Standard: 50/50):

- **Links:** Workout-Editor
- **Rechts:** Video-Player

### Resize
Alle Trennlinien (horizontal zwischen Zeile 1/2, vertikal zwischen Editor/Video) sind per Drag-Handle verschiebbar. Implementierung via `splitpanes` (Vue 3).

---

## Tech-Stack

| Technologie | Zweck |
|---|---|
| Vue 3 + Vite | Framework + Build-Tool |
| TypeScript | Typsicherheit |
| Pinia | Timer-Zustandsverwaltung |
| `splitpanes` | Resize-fähiges Panel-Layout |

---

## Projektstruktur

```
WODch/
├── src/
│   ├── App.vue                  # Root: SplitPanes-Layout
│   ├── stores/
│   │   └── timerStore.ts        # Pinia: gesamter Timer-Zustand
│   ├── components/
│   │   ├── TimerBar.vue         # Zeile 1: Runde + Zeit
│   │   ├── WorkoutEditor.vue    # Zeile 2 links: Texteditor
│   │   ├── VideoPlayer.vue      # Zeile 2 rechts: Embed-Player
│   │   └── TimerModal.vue       # Modal: Modus-Auswahl & Steuerung
│   └── composables/
│       └── useVideoEmbed.ts     # YouTube/Instagram URL → Embed-URL
├── index.html
└── vite.config.ts
```

---

## Timer

### Zustand (`timerStore`)

```ts
mode: 'clock' | 'stopwatch' | 'countdown' | 'countup' | 'interval'
phase: 'work' | 'rest' | 'warmup' | 'idle'
direction: 'up' | 'down'
elapsed: number          // ms seit Start
currentRound: number
totalRounds: number
workDuration: number     // ms
restDuration: number     // ms
isRunning: boolean
intervalPreset: string   // 'tabata' | 'fgb1' | 'fgb2' | 'emom' | 'custom-1'…'custom-10'
```

### Mechanismus
- `setInterval` mit 10ms Takt
- Delta-basiert (`Date.now()` Differenz) für Genauigkeit unabhängig von Interval-Jitter
- Moduswechsel setzt den Store vollständig zurück

### Unterstützte Modi

| Modus | Beschreibung |
|---|---|
| Uhrzeit | 12h/24h Systemzeit |
| Stoppuhr | Hochzählen ab 0, 1/100s genau |
| Count-Up | Hochzählen ab frei eingestellter Zeit |
| Count-Down | Runterzählen ab frei eingestellter Zeit |
| Tabata | 20s Work / 10s Rest × 8 Runden |
| Fight Gone Bad 1 | 5 × (5 Min Work + 1 Min Rest) |
| Fight Gone Bad 2 | 3 × (5 Min Work + 1 Min Rest) |
| EMOM | 1-Min-Countdown, bis 99 Wdh., Intervall frei einstellbar |
| Custom Intervals | Bis zu 10 eigene Programme (Runden, Work-Zeit, Rest-Zeit) |
| Warmup | Freier Countdown vor dem eigentlichen Timer |

### Custom Intervals
- Bis zu 10 benannte Slots
- Einstellbar: Rundenanzahl, Work-Dauer, Rest-Dauer
- In `localStorage` gespeichert (einzige persistierte Daten der App)

---

## Timer-Modal

Öffnet sich per Klick auf die TimerBar (oder ⚙-Icon in der Ecke der Leiste). Schließt automatisch beim Start.

**Inhalt:**
1. Modus-Auswahl (Radio-Buttons)
2. Bei Intervall-Modus: Preset-Auswahl + ggf. Custom-Felder (Runden, Work, Rest)
3. Warmup-Toggle mit Dauer-Eingabe
4. Steuerung: Start / Pause / Reset

**Tastaturkürzel:**

| Taste | Aktion |
|---|---|
| `Space` | Start / Pause |
| `R` | Reset |
| `M` | Modal öffnen/schließen |

**Verhalten:**
- Pause/Resume direkt per Leertaste oder Klick auf die TimerBar — kein Modal nötig
- Reset setzt auf Ausgangsposition ohne Moduswechsel

---

## Workout-Editor

- `<textarea>` füllt den gesamten linken Pane aus
- Schwarzer Hintergrund (`#000`), weiße Schrift (`#fff`)
- Schriftgröße: `16px`, Monospace-Font (`JetBrains Mono` / `monospace`)
- Kein Speichern — beim Reload leer

---

## Video-Player

URL-Eingabefeld oben, `<iframe>` füllt den restlichen Platz.

### Unterstützte Formate

| Eingabe-URL | Embed-URL |
|---|---|
| `youtube.com/watch?v=XYZ` | `youtube.com/embed/XYZ` |
| `youtu.be/XYZ` | `youtube.com/embed/XYZ` |
| `instagram.com/reel/XYZ/` | `instagram.com/p/XYZ/embed/` |

Logik in `useVideoEmbed.ts` (Composable).

- Kein Video eingefügt: schwarzer Bereich mit Platzhalter-Text
- Instagram-Hinweis: Bei Ladefehler kurze Meldung „Post muss öffentlich sein"

---

## Visuelles Gesamtdesign

- Durchgehend schwarzer Hintergrund (`#000` / `#111`)
- Weiße Primärschrift, dunkelgraue Sekundärtexte (`#888`)
- Akzentfarbe Work-Phase: Rot (`#e63946`)
- Akzentfarbe Rest-Phase: Grün (z.B. `#2dc653`)
- Resize-Handles: `2px` Linie in `#333`, Hover: `#555`
- Keine abgerundeten Ecken im Hauptlayout — klares, kantiges Gym-Ästhetik
