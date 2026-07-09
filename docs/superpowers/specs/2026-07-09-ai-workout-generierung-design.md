# AI-Workout-Generierung — Design

**Datum:** 2026-07-09
**Status:** Freigegeben (Design), Implementierungsplan folgt

## Ziel

Nutzer sollen per „Magic"-Button oben rechts im Workout-Fenster einen kleinen
Chat-Dialog öffnen, dort in Freitext einen Wunsch für ein Workout beschreiben und
dieses von einer AI generieren lassen. Nach Bestätigen schließt der Dialog, der
aktive Editor zeigt einen animierten Platzhalter (Claude-Code-Stil), und im
Hintergrund wird das Workout erzeugt und in den aktiven Tab geschrieben.

## Entscheidungen (aus dem Brainstorming)

- **Zielort:** Aktiver Tab — das Ergebnis füllt den gerade offenen Tab.
- **Service:** Anthropic Claude API, Modell `claude-haiku-4-5` (schnell, günstig
  für kurze Textgenerierung).
- **Backend:** Kein neuer Dienst. Der bestehende Sync-Server wird erweitert und
  von `wodch-sync` → **`wodch-backend`** umbenannt (er macht künftig mehr als
  Sync).
- **Kostenschutz:** Einfaches In-Memory-Rate-Limit pro IP + harte Caps auf
  Eingabelänge und `max_tokens`.
- **Anzeige während Generierung:** Kein Streaming. Lokaler animierter Platzhalter
  mit wechselnden Phrasen und laufenden Punkten; am Ende auf einen Schlag durch
  das fertige Workout ersetzt.

## Architektur & Datenfluss

### Backend (`wodch-backend`, vormals `wodch-sync`)

Neue Route im bestehenden HTTP-Handler in `server/src/index.ts` (der aktuell nur
`/healthz` und den WebSocket-Upgrade `/ws` bedient):

`POST /generate`

- **Request:** `{ prompt: string }` als JSON.
- **Serverseitig gekapselt:** API-Key (aus `ANTHROPIC_API_KEY`), System-Message,
  Modell, Parameter. Nichts davon erreicht das Frontend.
- **Aufruf:** Anthropic Messages API (`claude-haiku-4-5`) via `fetch`.
- **Response:** `{ workout: string }` — reiner, zentrierbarer Monospace-Text.

**System-Message (sinngemäß):** „Du bist ein CrossFit/Gym-Coach. Gib
ausschließlich das Workout als reinen, zentrierbaren Monospace-Text zurück —
keine Einleitung, keine Markdown-Formatierung, keine Erklärungen."

**Schutz / Caps:**

- In-Memory-Rate-Limit pro IP (Default 10 Anfragen/Minute) → `429`.
- Prompt-Länge > ~500 Zeichen → `400` (im UI gespiegelt).
- `max_tokens` gedeckelt (~800).
- Der Rate-Limiter ist eine isoliert testbare Einheit (eigenes Modul/Funktion).

**Fehler-/Degradationsverhalten:**

- Kein `ANTHROPIC_API_KEY` gesetzt → `503` + klare Meldung. Die App läuft
  ansonsten normal weiter (Feature degradiert sauber).
- Upstream-Fehler / Timeout → `500`.

### Datenfluss

```
Frontend (Magic-Button → Dialog → Bestätigen)
  → POST /generate  (gleicher Ingress-Host, Pfad /generate → wodch-backend)
    → Anthropic Messages API
    ← { workout }
  ← Frontend schreibt via workouts.setContent(activeTab, workout)
     → synchronisiert automatisch zu anderen Geräten (bestehender Sync-Weg)
```

Der Overlay-/Generierungs-State lebt **lokal** im Frontend und wird **nicht**
synchronisiert. Andere Geräte sehen nur das fertige Ergebnis über den normalen
Workout-Sync.

### Single-Replica

Der `/generate`-Endpunkt ist zustandslos (nur async Netzwerk-I/O). Er verschiebt
die Skalierungsgrenze nicht — die `replicas: 1`-Beschränkung besteht weiterhin
allein wegen der In-Memory-Sessions. Der Ausbaupfad (Redis) aus der README bleibt
unverändert. Die Rate-Limit-Zähler liegen bei einer Replica konsistent an einer
Stelle.

## Frontend & UI

### Magic-Button

- Position: oben rechts in der Tab-Leiste (`.tab-bar`), rechtsbündig neben dem
  `+`-Button in `WorkoutEditor.svelte`.
- Icon: „Magic" (✨ bzw. Zauberstab-SVG), Stil konsistent mit den vorhandenen
  Tab-Leisten-Buttons.
- `data-tour`-Anker, damit die Onboarding-Tour den Button später aufgreifen kann.

### Chat-Dialog

Kleiner modaler Dialog im Stil von `ConfirmDialog.svelte`:

- `<textarea>` für den Wunsch (Platzhalter-Beispiel, z. B. „20 Min AMRAP mit
  Kettlebells, Fokus Beine").
- Zeichenlimit im UI gespiegelt (~500).
- Buttons „Generieren" (Primär) und „Abbrechen".
- Tastatur: `Enter`/`Cmd+Enter` bestätigt, `Escape` schließt.

### Ablauf nach Bestätigen

1. Dialog schließt sofort.
2. Aktiver Editor zeigt einen **animierten Platzhalter-Overlay** (lokal, nicht im
   Tab-Inhalt): wechselnde Phrasen im Claude-Code-Stil („Heavy lifting…",
   „Running…", „Chalking up…", „Counting reps…") mit laufenden Punkten. Editor ist
   währenddessen nicht editierbar.
3. `POST /generate` läuft im Hintergrund.
4. **Erfolg** → Overlay entfernt, Text via `workouts.setContent(activeTab, …)`
   gesetzt (synchronisiert automatisch).
5. **Fehler** (Netzwerk / `429` / `500` / `503`) → Overlay entfernt, kurze
   Fehlermeldung; alter Tab-Inhalt bleibt unberührt.

Lokaler State im Frontend: `generating` (bool) und die aktuell angezeigte Phrase.

## Konfiguration

- `ANTHROPIC_API_KEY` als Env-Variable: lokal via Shell/`.env`, in Prod als
  k8s-Secret in die `wodch-backend`-Deployment-Env.
- Modell, System-Message und Caps als Konstanten im Server-Code; das Modell darf
  optional per Env überschrieben werden.
- Vite-Dev-Proxy: `/generate` wird (wie schon `/ws`) auf Backend-Port 8787
  geproxied (`frontend/vite.config.ts`).

## Rename `wodch-sync` → `wodch-backend`

Betroffene Stellen:

- `server/package.json` (`name`).
- `.github/workflows/docker.yml`: Image-Name → `ghcr.io/gerrited/wodch-backend`.
- `k8s/deployment.yaml`: Deployment-/Service-Namen, Labels, Ingress-Backend für
  `/ws` **und** neuer `/generate`-Verweis.
- `README.md`: Architektur-Tabelle, Dev-Anleitung, Deployment-Abschnitt.

Der Ordner `server/` bleibt bestehen (Verzeichnis-Rename wäre unnötiger Churn) —
nur Dienst-/Image-Name ändern sich.

## Tests

**Server** (gemockter Anthropic-`fetch`, kein Live-Call):

- Erfolgsfall: gültiger Prompt → `{ workout }`.
- Fehlender Key → `503`.
- Zu langer Prompt → `400`.
- Rate-Limit überschritten → `429`.
- Rate-Limiter als isolierte Einheit.

**Frontend** (gemockter `fetch`):

- Dialog öffnet/schließt (Button, Escape, Abbrechen).
- Bestätigen löst Generierung aus.
- Platzhalter-Phasen-Rotation.
- Erfolg schreibt in aktiven Tab.
- Fehler lässt Tab-Inhalt unberührt.

Der Anthropic-Call selbst wird nie live getestet.

## Bewusst nicht enthalten (YAGNI)

- Kein Live-Streaming der Antwort.
- Keine Nutzer-Anmeldung / Auth.
- Keine Persistenz von Prompts oder generierten Workouts über den Sync hinaus.
- Kein Multi-Replica-Ausbau (unverändert Redis-Pfad aus der README).
