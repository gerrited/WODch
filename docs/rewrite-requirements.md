# WODch — Anforderungen für einen Rewrite

**Datum:** 2026-07-04
**Quelle:** Extrahiert aus Code (`src/`), Design-Specs (`docs/superpowers/specs/`), Tests (`tests/`) und Infrastruktur (Dockerfile, nginx.conf, k8s/, GitHub Actions). Stack-agnostisch formuliert als Grundlage für einen Rewrite mit anderem Tech-Stack und anderer Infrastruktur.

---

## 1. Produktüberblick

Web-App für Gym-Trainings: kombiniert einen vollwertigen Trainings-Timer, einen Multi-Tab-Workout-Editor und einen YouTube-Player in einem frei anpassbaren Split-Layout. Zusätzlich: Echtzeit-Session-Sharing per Link, bei dem alle verbundenen Geräte Timer, Workouts und Video synchron sehen und gleichberechtigt steuern.

## 2. Layout

- Zwei Zeilen, Höhe per Drag anpassbar: **Zeile 1** Timer-Leiste (Standard 15 %, Minimum 5 % bzw. ~40 px), **Zeile 2** Hauptbereich (85 %).
- Zeile 2 besteht aus zwei horizontal nebeneinanderliegenden Panes (Standard 50/50): links Workout-Editor, rechts Video-Player. Alle Trennlinien sind drag-resizable.
- Timer-Text skaliert mit der Leistenhöhe (aktuell via CSS Container Queries: Zeit ~60 % der Leistenhöhe, Rundenanzeige ~25 %).

## 3. Timer

### 3.1 Modi

| Modus | Verhalten |
|---|---|
| Uhrzeit (Default) | Systemzeit, 12h (mit AM/PM) oder 24h umschaltbar; Aktualisierung 1×/Sekunde; startet automatisch beim App-Load |
| Stoppuhr | Hochzählen ab 0, Anzeige `MM:SS.cc` (Hundertstel) |
| Count-Down | Runterzählen von konfigurierbarer Zielzeit (Min/Sek); stoppt bei 0 automatisch und geht auf idle |
| Count-Up | Hochzählen ab konfigurierbarer Startzeit |
| Intervall | Work/Rest-Zyklen mit Presets, optionalem Warmup und Rundenzähler |

### 3.2 Zeitformatierung

- Countdown/Intervall: aufgerundete Sekunden (`Math.ceil`), Format `MM:SS`, bei ≥1 h `H:MM:SS`; nie negativ (Clamp auf 0).
- Stoppuhr: abgerundete Sekunden plus Hundertstel.

### 3.3 Intervall-Presets

| Preset | Parameter |
|---|---|
| Tabata | 20 s Work / 10 s Rest × 8 Runden |
| Fight Gone Bad 1 | 5 × (5 min Work + 1 min Rest) |
| Fight Gone Bad 2 | 3 × (5 min Work + 1 min Rest) |
| EMOM | Intervall frei (Min/Sek), Runden 1–99, kein Rest (Rest = 0 ⇒ direkter Work→Work-Übergang) |
| Custom 1–10 | 10 benannte Slots: Name (max. 20 Zeichen), Runden 1–99, Work- und Rest-Dauer; Rest = 0 erlaubt |

- Custom-Programme werden **lokal persistiert** (aktuell `localStorage`, Key `wodch-custom-intervals`) — die einzigen lokal persistierten Daten der App. Korrupte Daten werden still ignoriert.
- Preset-Labels zeigen den gespeicherten Custom-Namen, sonst „Custom N".

### 3.4 Ablauflogik Intervall

- Optionales **Warmup** (Toggle + Dauer): Start beginnt in Phase `warmup`, danach `work` mit Runde 1. Ohne Warmup direkt `work`/Runde 1.
- Phasenfolge: `work` → `rest` → nächste Runde `work`; bei Rest = 0 direkt `work` → `work`. Nach der letzten Runde: Stop, Phase `idle`, Runde 0.
- Rundenanzeige `aktuell / gesamt` nur im Intervall-Modus während `work`/`rest` (nicht bei idle/warmup, nicht bei 0 Gesamtrunden).
- Phasenübergänge setzen die Phasen-Zeit auf 0 zurück (jede Phase läuft von ihrer eigenen Startzeit).

### 3.5 Genauigkeit (harte Anforderung)

- Tick-Rate 10 ms, aber **delta-basiert**: `elapsed = accumulatedMs + (now − startedAt)`. Die Genauigkeit darf nicht von der Timer-/Event-Loop-Frequenz abhängen.
- Zustandsmodell mit `startedAt` (absoluter Timestamp) + `accumulatedMs` (angesammelte Zeit vor letztem Start) — dieses Modell ist zugleich die Grundlage des Session-Sync (siehe Kap. 6).

### 3.6 Steuerung

- Klick auf die Timer-Leiste: im Clock-Modus oder im Idle-Zustand → Einstellungs-Modal öffnen; sonst → Start/Pause-Toggle.
- ⚙-Icon (rechts in der Leiste): Modal jederzeit öffnen.
- Tastaturkürzel (unterdrückt, wenn Fokus in Input/Textarea/contenteditable): `Space` Start/Pause, `R` Reset, `M` Modal auf/zu.
- Reset: zurück auf Ausgangsposition ohne Moduswechsel. Moduswechsel setzt den Timer vollständig zurück.

### 3.7 Einstellungs-Modal

- Modus-Auswahl (Radio); kontextabhängige Konfiguration: Countdown-Zielzeit, Count-Up-Startzeit, Uhrformat, Intervall-Preset-Auswahl, EMOM-Felder, Custom-Felder (Name/Runden/Work/Rest), Warmup-Toggle + Dauer.
- Buttons: Start / Pause (nur aktiv wenn laufend) / Reset.
- „Start" übernimmt die Konfiguration (speichert Custom-Slot), resettet, startet und **schließt das Modal automatisch**. Schließen per ✕, Klick auf Overlay oder `M`.

## 4. Workout-Editor

- Mehrere Tabs: hinzufügen (+, neuer Tab „Workout N" wird aktiv), schließen (✕ nur sichtbar wenn >1 Tab; `activeTab` wird geklemmt), umbenennen (Doppelklick → Inline-Input; Enter/Blur committet, Escape bricht ab; leere/Whitespace-Titel werden verworfen), **Drag-&-Drop-Reihenfolge** (verschobener Tab wird aktiv).
- Editorfläche: frei editierbarer Text (aktuell `contenteditable`), horizontal + vertikal zentriert, Monospace ~32 px, Placeholder „Workout eingeben...".
- **Kein lokales Speichern** — Inhalt ist nach Reload leer (by design). Persistenz nur über geteilte Sessions.

## 5. Video-Player

- URL-Eingabezeile oben (Paste ersetzt den gesamten Inhalt), Player füllt den Rest.
- Unterstützte URLs: `youtube.com/watch?v=ID` (auch mit weiteren Query-Params) und `youtu.be/ID`. Ungültige URL → Fehlermeldung „Keine gültige YouTube URL."; leere URL → Platzhalter.
- Player über die **YouTube IFrame Player API** (`YT.Player`, programmatisch steuerbar: play/pause/seekTo/getCurrentTime, `onStateChange`-Events), native YT-Controls sichtbar, `rel=0`. Eine Singleton-Player-Instanz pro App.
- **∞-Loop-Toggle**: bei Videoende Video neu laden. Loop-Zustand ist **lokal, wird nicht synchronisiert**.
- ⚠️ Die ursprüngliche Design-Spec nennt Instagram-Reels-Support — **nicht implementiert**; für den Rewrite als „out of scope / optional" behandeln.

## 6. Session-Sharing (Echtzeit-Sync)

### 6.1 Modell

- Session-ID: 6-stellige nanoid; URL-Schema `…/#session=<id>`.
- **Teilen-Button** in der Timer-Leiste: ohne aktive Session → Session anlegen (initialen State schreiben), URL-Hash setzen, Link in Clipboard (Clipboard-Fehler still ignorieren); mit aktiver Session → Link erneut kopieren. Icon wechselt entsprechend (📤/🔗).
- **Beitreten:** App liest beim Laden und bei `hashchange` den Hash und subscribed automatisch.
- **Kein Host-Konzept:** alle Geräte lesen/schreiben gleichberechtigt, Konfliktauflösung last-write-wins. Keine Authentifizierung — wer den Link hat, hat Vollzugriff.
- **Verbindungsindikator** (Dot links in der Leiste): grau = keine Session, grün = verbunden, rot = Fehler/Verbindungsverlust.
- **Ablauf:** Sessions werden 24 h nach letztem `updatedAt` serverseitig gelöscht (Cleanup-Job).

### 6.2 Synchronisierte Daten (Session-Dokument)

```
session
├── timer: kompletter Timer-State inkl. mode, preset, phase, isRunning,
│          startedAt, accumulatedMs, alle Dauern/Runden, clock12h,
│          customIntervals  (elapsed wird NIE übertragen)
├── video: { isPlaying, startedAt, accumulatedSeconds }
├── videoUrl: string
├── workouts: { tabs: [{id, title, content}], activeTab }
└── updatedAt: number (ms)
```

### 6.3 Sync-Strategie (harte Anforderung)

- **Timestamp-basiert statt Streaming:** Nur State-Übergänge werden geschrieben (Start: `startedAt = now`, Pause/Reset: `startedAt = null, accumulatedMs = elapsed`). Jeder Client rechnet `elapsed` lokal. Eliminiert Netzwerk-Jitter; setzt NTP-synchrone Geräteuhren voraus.
- **Jeder Phasenübergang** schreibt `startedAt`, `accumulatedMs: 0`, `phase`, `currentRound` — das Backend ist Source of Truth, eingehende Updates überschreiben den lokalen State (inkl. Neustart/Stopp des lokalen Ticks).
- **Video-Sync** nach demselben Prinzip: Play/Pause/Ended aus den nativen Player-Controls werden als `{isPlaying, startedAt, accumulatedSeconds}` geschrieben; Empfänger berechnet Position, macht `seekTo` + play/pause. Ist der Player noch nicht bereit, wird der Sync gepuffert und bei `onReady` angewendet. URL-Wechsel resettet den Video-Sync-State.
- **Schreibverhalten:** Timer-Übergänge und Video-URL sofort; Workout-Änderungen **debounced 500 ms** (keine zeichenweise Kollaboration nötig); jede Schreiboperation aktualisiert `updatedAt`.
- **Echo-Loop-Verhinderung:** eingehende Updates setzen ein Sperr-Flag, das ausgehende Writes unterdrückt (Freigabe erst nach UI-Flush); Player-Events werden 1 s nach einem Remote-Sync ignoriert.
- Clock-Modus: nur die 12h/24h-Einstellung wird synchronisiert, die Uhrzeit selbst nicht.

### 6.4 Backend-Anforderungen (abstrakt, aktuell Firebase Realtime Database)

Der Ersatz-Backend-Dienst muss bieten:

- Echtzeit-Push an alle Subscriber einer Session
- Schreibzugriff auf Teilpfade des Session-Dokuments (`timer`, `video`, `videoUrl`, `workouts`, `updatedAt` einzeln)
- Last-write-wins-Semantik
- Öffentlicher Lese-/Schreibzugriff pro Session-ID (Security by unguessable ID)
- TTL-/Cleanup-Mechanismus (24 h nach letztem Update)
- Betreibbar im Free Tier bzw. mit vernachlässigbaren Kosten
- Konfiguration via Umgebungsvariablen (aktuell `VITE_FIREBASE_*`, siehe `.env.example`)

## 7. Visuelles Design

- Durchgehend dunkel: Hintergrund `#000`/`#111`, weiße Primärschrift, Grautöne `#888`/`#666`/`#444` für Sekundäres; Monospace-Schrift app-weit.
- Akzente: Work/Fehler-Rot `#e63946`, Rest/Verbunden-Grün (`#2dc653`/`#4caf50`).
- Keine abgerundeten Ecken im Hauptlayout (kantige Gym-Ästhetik); Resize-Handles als schmale graue Linien mit Hover-Aufhellung.
- UI-Texte auf Deutsch.

## 8. Infrastruktur & Deployment (Ist-Zustand, beim Rewrite zu ersetzen)

- **Auslieferung:** rein statisches SPA-Build, serviert von Nginx; SPA-Fallback (`try_files … /index.html`), gzip, Cache-Header: `/assets/` immutable 1 Jahr, Icons/Manifest 1 h.
- **Container:** Multi-Stage-Dockerfile (Node-Build → nginx:alpine), Port 80.
- **CI/CD (GitHub Actions):** bei Push auf `main` und Tags `v*`: erst Test-Job (`npm ci && npm test`, **Gate vor dem Build**), dann Multi-Arch-Build (amd64 + arm64) und Push nach `ghcr.io/gerrited/wodch` mit Build-Cache; Tagging: `main` → `latest`, Git-Tag `vX.Y.Z` → `X.Y.Z`. Auth über `GITHUB_TOKEN`, kein externer Registry-Account. Tags werden manuell gesetzt.
- **Kubernetes:** Deployment (1 Replica, requests 50m/64Mi, limits 200m/128Mi, `imagePullSecret ghcr-secret`), Service, Nginx-Ingress mit Host `wodch.g11s.cc`.
- ⚠️ **Rewrite-Hinweis:** Die Backend-Credentials werden aktuell zur **Build-Zeit** ins Bundle eingebacken (Vite-Env). Beim Stack-Wechsel entscheiden, ob Runtime-Konfiguration (z. B. injizierte `config.js` / API-Proxy) gewünscht ist — das aktuelle Docker-Image enthält nur den Build ohne Secrets.

## 9. Qualitätsanforderungen

- **Unit-Tests als Verhaltensspezifikation** (aktuell ~50 Tests): komplette Timer-Logik aller Modi/Presets/Phasenübergänge, Formatierung, Sync-Felder (`startedAt`/`accumulatedMs`), `syncFromRemote` (Tick-Start/-Stopp), URL-Parsing (Video + Session-ID), Workout-Tab-Operationen, Session-Erstellung. Der Rewrite muss eine äquivalente Testabdeckung mitbringen; Tests laufen als CI-Gate vor dem Deploy-Artefakt.
- Keine Nutzerkonten, kein Tracking, keine personenbezogenen Daten außer frei geteilten Session-Inhalten.

## 10. Bekannte Abweichungen Doku ↔ Code (für den Rewrite klären)

1. **README ist veraltet:** erwähnt weder Firebase/Session-Sharing noch die YT-Player-API; beschreibt den Editor ohne Sync.
2. **Instagram-Embed** steht in der ursprünglichen Design-Spec, ist aber nie implementiert worden.
3. Die Design-Spec nennt 16 px Editor-Schrift, implementiert sind 32 px zentriert.
4. Die Security-Rules-Skizze (public read/write mit Kind-Validierung) passt nicht ganz zu den tatsächlichen Teilpfad-Writes (`…/timer`, `…/updatedAt` einzeln) — beim neuen Backend das Berechtigungs-/Validierungsmodell auf Teilpfad-Updates auslegen.
