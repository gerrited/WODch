# WODch Session Sharing — Design Spec

**Datum:** 2026-06-27
**Status:** Approved

## Ziel

Workout-Sessions per Link teilen. Alle verbundenen Geräte sehen Timer, Workouts und YouTube-Video in Echtzeit synchron. Jedes Gerät hat volle Kontrolle.

---

## 1. Session-Modell & URL-Schema

- Session-ID: 6-stellige nanoid (bereits im Projekt vorhanden)
- URL-Format: `https://wodch.example.com/#session=Xk9mQp`
- **Erstellen:** "Teilen"-Button generiert ID, schreibt initialen State nach Firebase, setzt URL-Hash, kopiert Link in Clipboard
- **Beitreten:** App liest beim Laden den URL-Hash — ist `session=<id>` vorhanden, wird automatisch subscribed
- **Kein Host-Konzept:** Alle Geräte lesen und schreiben gleichberechtigt (last-write-wins)
- **Ablauf:** Firebase Security Rule löscht Sessions nach 24h anhand `updatedAt`-Timestamp

---

## 2. Firebase-Datenstruktur

Backend: Firebase Realtime Database (kostenloser Tier).

```
sessions/{sessionId}
├── timer
│   ├── mode: TimerMode
│   ├── preset: IntervalPreset | null
│   ├── phase: TimerPhase
│   ├── isRunning: boolean
│   ├── startedAt: number | null        // absoluter ms-Timestamp des letzten Starts
│   ├── accumulatedMs: number           // elapsed vor dem letzten Start
│   ├── countdownTarget: number
│   ├── countupStart: number
│   ├── workDuration: number
│   ├── restDuration: number
│   ├── warmupDuration: number
│   ├── warmupEnabled: boolean
│   ├── emomInterval: number
│   ├── emomRounds: number
│   ├── currentRound: number
│   ├── totalRounds: number
│   ├── clock12h: boolean
│   └── customIntervals: CustomInterval[]
├── video
│   ├── isPlaying: boolean
│   ├── startedAt: number | null        // absoluter ms-Timestamp des letzten Play
│   └── accumulatedSeconds: number      // Abspielzeit vor letztem Play
├── videoUrl: string
├── workouts
│   ├── tabs: Array<{ id: string, title: string, content: string }>
│   └── activeTab: number
└── updatedAt: number
```

### Firebase Security Rules (Grundgerüst)

```json
{
  "rules": {
    "sessions": {
      "$sessionId": {
        ".read": true,
        ".write": true,
        ".validate": "newData.hasChildren(['timer','workouts','videoUrl','updatedAt'])"
      }
    }
  }
}
```

Cleanup-Funktion (Cloud Function oder geplanter Job): löscht Sessions, bei denen `updatedAt < now - 86400000`.

---

## 3. Timer-Sync-Strategie

Der laufende `elapsed`-Wert wird **nie** nach Firebase geschrieben. Stattdessen:

**Beim Start:**
```
Firebase ← { isRunning: true, startedAt: Date.now(), accumulatedMs: <bisheriges elapsed> }
```

**Beim Pause/Reset:**
```
Firebase ← { isRunning: false, startedAt: null, accumulatedMs: <aktuelles elapsed> }
```

**Jeder Client berechnet lokal:**
```ts
elapsed = accumulatedMs + (isRunning ? Date.now() - startedAt : 0)
```

Das eliminiert Netzwerk-Jitter vollständig. Voraussetzung: Systemuhren der Geräte sind annähernd synchron (bei modernen Geräten gegeben via NTP).

Der bestehende `timerStore` wird um `startedAt` und `accumulatedMs` ergänzt. Die interne `_tick()`-Funktion bleibt für das lokale Rendering erhalten — sie schreibt weiterhin `elapsed` in den Store, damit die UI reaktiv bleibt.

**Wichtig: Phasenübergänge** (`_nextPhase()`) setzen `elapsed` auf 0 und vergeben eine neue `startTime`. Daher wird Firebase bei jedem Phasenübergang mit dem neuen `startedAt`, `accumulatedMs: 0`, `phase` und `currentRound` aktualisiert — nicht nur bei Start/Pause. Alle Clients laufen lokal mit `_tick()`, aber Firebase ist Source of Truth: eingehende Phase-Updates überschreiben den lokalen State.

---

## 4. Video-Sync-Strategie

Gleiche Timestamp-Methode wie beim Timer.

**Play:**
```
Firebase ← { isPlaying: true, startedAt: Date.now(), accumulatedSeconds: <aktuelle Position> }
```

**Pause:**
```
Firebase ← { isPlaying: false, startedAt: null, accumulatedSeconds: <aktuelle Position> }
```

**Remote-Client beim Empfang:**
```ts
const position = accumulatedSeconds + (isPlaying ? (Date.now() - startedAt) / 1000 : 0)
player.seekTo(position, true)
if (isPlaying) player.playVideo() else player.pauseVideo()
```

`VideoPlayer.vue` wird von einem `<iframe src="...">` auf die **YouTube IFrame Player API** (`YT.Player`) umgebaut. Der `onStateChange`-Callback der API wird genutzt, um lokale User-Interaktionen mit den nativen YT-Controls zu erkennen und an Firebase zu schreiben.

---

## 5. Sync-Schicht: `useSession`

Neues Composable `src/composables/useSession.ts` — zentrale Brücke zwischen Firebase, Pinia-Store und YouTube Player.

### API

```ts
const { isConnected, sessionId, createSession, joinSession } = useSession()
```

### Verantwortlichkeiten

- Firebase-Verbindung aufbauen und halten
- **Incoming (Firebase → lokal):**
  - Timer-State in Pinia-Store patchen (ohne `_tick` zu unterbrechen)
  - Video-State an YouTube Player übergeben (seekTo + play/pause)
  - Workout-Tabs und aktiven Tab aktualisieren
- **Outgoing (lokal → Firebase):**
  - Timer-State-Transitions (start/pause/reset/setMode/applyPreset) sofort schreiben
  - Video-Events (play/pause/seek) sofort schreiben
  - Workout-Text debounced (500 ms) schreiben
- **Feedback-Loop verhindern:** `isSyncing`-Flag (boolean) blockiert den Outgoing-Watcher, während ein Incoming-Update angewendet wird

### Ablauf eines Timer-Events (Beispiel: Start)

1. User drückt Start → `timerStore.start()` setzt `startedAt`, `accumulatedMs`, `isRunning: true`
2. Watcher in `useSession` erkennt Änderung → schreibt zu Firebase
3. Firebase pusht Update an alle anderen Clients
4. `useSession` remote empfängt Snapshot → setzt `isSyncing = true`, patcht Store
5. Store-Watcher feuert, wird durch `isSyncing` unterdrückt → kein Loop
6. `isSyncing = false`

---

## 6. UI-Änderungen

### `TimerBar.vue`

Rechts neben dem Gear-Icon werden zwei Elemente ergänzt:

- **Verbindungsindikator (Dot):**
  - Grau = kein aktiver Session-Hash
  - Grün = Firebase verbunden
  - Rot = Firebase-Fehler / Verbindungsverlust

- **`ShareButton.vue` (neu):**
  - Kein Session-Hash → Teilen-Icon: erstellt Session, kopiert Link
  - Session-Hash aktiv → Kopieren-Icon: kopiert Link direkt

### `VideoPlayer.vue`

Umbau auf `YT.Player` (JavaScript-API statt reines `<iframe>`):
- `YT.Player`-Instanz wird im Composable `useVideoEmbed` gehalten
- Native YT-Controls bleiben sichtbar
- `onStateChange`-Callback fängt User-Interaktionen ab und triggert Firebase-Write
- `seekTo()` und `playVideo()`/`pauseVideo()` werden für Remote-Sync genutzt

---

## 7. Dateiübersicht

```
src/
  composables/
    useSession.ts        ← neu
    useVideoEmbed.ts     ← Umbau auf YT IFrame Player API
  stores/
    timerStore.ts        ← startedAt + accumulatedMs ergänzen
  components/
    ShareButton.vue      ← neu
    TimerBar.vue         ← ShareButton + Dot integrieren
    VideoPlayer.vue      ← YT Player API, Sync-Callbacks
```

---

## 8. Offene Punkte / Nicht im Scope

- **Authentifizierung:** keine — Sessions sind öffentlich über den Link erreichbar
- **Workout-Text kollaborativ (Zeichen für Zeichen):** nicht im Scope, debounced reicht
- **Clock-Modus-Sync:** Systemuhr jedes Geräts läuft eigenständig — `clock12h`-Einstellung wird synchronisiert, die Uhrzeit selbst nicht
- **Firebase SDK Setup:** `firebase` npm-Paket, Projekt-Config via Vite-Env-Variablen (`VITE_FIREBASE_*`)
