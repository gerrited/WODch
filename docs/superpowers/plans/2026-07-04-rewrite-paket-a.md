# WODch Rewrite „Paket A" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite von WODch als Svelte-5-SPA mit eigenem WebSocket-Sync-Dienst, deployt als zwei Container im bestehenden k8s-Cluster — Firebase entfällt vollständig.

**Architecture:** Monorepo mit `frontend/` (Vite + Svelte 5, statisches Build hinter Nginx) und `server/` (Node 22 + `ws`, Sessions in-Memory, `replicas: 1` + Client-Re-Seed). Timer-Phase/-Runde werden deterministisch aus `startedAt` + Konfiguration abgeleitet (keine Transition-Writes). Sync über Pfad-Patches mit last-write-wins, Workout-Patches pro Tab-Feld.

**Tech Stack:** TypeScript, Svelte 5 (Runes, ohne SvelteKit — kein Routing/SSR nötig), Vite, Vitest, `ws`, nanoid, YouTube IFrame Player API, Docker, k8s, GitHub Actions → ghcr.

**Spec:** `docs/rewrite-requirements.md` (Anforderungen), `docs/rewrite-stack-options.md` §6.1/§6.2 (Nebenläufigkeit, State-Haltung).

## Global Constraints

- Arbeitsbranch: `rewrite` (main bleibt unberührt; alte Vue-App bleibt bis Task 13 als Referenz im Baum).
- UI-Texte deutsch, Design gemäß Requirements §7 (Schwarz `#000`/`#111`, Rot `#e63946`, Grün `#4caf50`, Monospace, keine runden Ecken im Hauptlayout).
- localStorage-Key für Custom-Intervals bleibt `wodch-custom-intervals` (Datenübernahme für Bestandsnutzer).
- `customIntervals` werden **nicht mehr gesynct** (bewusste Abweichung von der Alt-Spec): Presets materialisieren beim Anwenden in `workDuration`/`restDuration`/`totalRounds` im Timer-Doc; die Slot-Liste ist reine Lokal-Konfiguration.
- Timer-Doc enthält **kein** `phase`/`currentRound`/`elapsed` — alles abgeleitet (Stack-Options §6.1).
- Session-TTL 24 h; Session-ID `nanoid(6)`; URL-Schema `#session=<id>` unverändert.
- Tests: Vitest; jede Verhaltensänderung mit Test; `npm test` in beiden Paketen grün vor jedem Commit.
- Node 22 überall; Sync-Dienst Port 8787, Pfad `/ws`, Healthcheck `GET /healthz`.

---

## Datenmodell & Protokoll (Referenz für alle Tasks)

`SessionDoc` (identisch in `server/src/types.ts` und `frontend/src/lib/types.ts` — bewusst dupliziert, kein Workspace-Tooling):

```ts
export type TimerMode = 'clock' | 'stopwatch' | 'countdown' | 'countup' | 'interval'
export type IntervalPreset = 'tabata' | 'fgb1' | 'fgb2' | 'emom' | `custom-${number}`

export interface CustomInterval { name: string; rounds: number; workDuration: number; restDuration: number }

export interface TimerDoc {
  mode: TimerMode
  preset: IntervalPreset | null
  isRunning: boolean
  startedAt: number | null      // ms-Timestamp des letzten Starts
  accumulatedMs: number         // elapsed vor dem letzten Start
  countdownTarget: number       // ms
  countupStart: number          // ms
  workDuration: number          // ms
  restDuration: number          // ms
  warmupDuration: number        // ms
  warmupEnabled: boolean
  emomInterval: number          // ms
  emomRounds: number
  totalRounds: number
  clock12h: boolean
}

export interface VideoDoc { isPlaying: boolean; startedAt: number | null; accumulatedSeconds: number }
export interface WorkoutTab { id: string; title: string; content: string }
export interface WorkoutsDoc { tabs: WorkoutTab[]; activeTab: number }

export interface SessionDoc {
  timer: TimerDoc
  video: VideoDoc
  videoUrl: string
  workouts: WorkoutsDoc
  updatedAt: number
}
```

Patch-Pfade (Server wendet an, bumpt `updatedAt`, broadcastet an alle anderen Clients):

| Pfad | Value | Auslöser |
|---|---|---|
| `timer` | `TimerDoc` (komplett) | jede Timer-Aktion (start/pause/reset/setMode/applyPreset/Config) |
| `video` | `VideoDoc` | Play/Pause/±10s |
| `videoUrl` | `string` | URL-Änderung (Client sendet zusätzlich `video`-Reset-Patch) |
| `workouts` | `WorkoutsDoc` (komplett) | strukturelle Tab-Ops: add/remove/reorder |
| `workouts/activeTab` | `number` | Tab-Wechsel |
| `tab/<id>/content` | `string` | Editor-Eingabe, debounced 500 ms |
| `tab/<id>/title` | `string` | Umbenennen |

WebSocket-Nachrichten (JSON, eine pro Frame):

```ts
// Client → Server
type ClientMsg =
  | { t: 'join'; session: string }
  | { t: 'seed'; session: string; doc: SessionDoc }   // create-only: existiert die Session, antwortet der Server mit doc
  | { t: 'patch'; path: string; value: unknown }       // nur nach join/seed gültig
// Server → Client
type ServerMsg =
  | { t: 'doc'; doc: SessionDoc }
  | { t: 'missing' }                                    // join auf unbekannte Session → Client seedet seinen lokalen Stand
  | { t: 'patch'; path: string; value: unknown }
```

Re-Seed-Regel (Stack-Options §6.2): erhält der Client auf `join` ein `missing` (Pod-Neustart, abgelaufene Session), sendet er `seed` mit seinem lokalen `SessionDoc`.

---

### Task 1: Branch + Monorepo-Gerüst

**Files:**
- Create: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/index.html`, `frontend/src/main.ts`, `frontend/src/App.svelte` (Platzhalter), `frontend/src/lib/types.ts`
- Create: `server/package.json`, `server/tsconfig.json`, `server/src/types.ts`

**Interfaces:** Produces: lauffähige Toolchains (`npm test`, `npm run build`) in beiden Paketen; `types.ts` exakt wie oben.

- [ ] Branch anlegen: `git checkout -b rewrite` (vorher `git add docs/ && git commit` für die drei Rewrite-Dokumente auf main? Nein — Dokumente mit auf den Branch nehmen: erst Branch, dann alles committen).
- [ ] `frontend/`: Vite + Svelte 5 manuell scaffolden. Dependencies: `svelte@^5`, devDeps: `@sveltejs/vite-plugin-svelte@^5`, `vite@^6`, `typescript@~5.7`, `vitest@^3`, `jsdom@^26`, `svelte-check@^4`, `nanoid@^5` (dep). Scripts: `dev`, `build` (`svelte-check --tsconfig ./tsconfig.json && vite build`), `test` (`vitest run`), `test:watch`. `vite.config.ts` mit svelte-Plugin, Vitest-Config (`environment: 'jsdom'`), Dev-Proxy `/ws` → `ws://localhost:8787` (`ws: true`).
- [ ] `server/`: devDeps `typescript`, `vitest`, `@types/node`, `@types/ws`; dep `ws@^8`. Scripts: `build` (`tsc`), `test` (`vitest run`), `dev` (`node --watch --experimental-strip-types src/index.ts` oder `tsx`; nimm `tsx` als devDep). tsconfig: `module: nodenext`, `outDir: dist`, `strict: true`.
- [ ] `types.ts` in beide Pakete (Inhalt siehe oben), plus `defaultTimerDoc()`/`defaultSessionDoc()`-Factories im Frontend (Defaults aus Requirements §3: mode `clock`, countdownTarget 3 min, work 20 s, rest 10 s, warmup 10 s, emom 60 s × 10, totalRounds 8).
- [ ] Smoke: `npm install` + `npm test` in beiden Paketen (je 1 Dummy-Test, wird in Task 2/3 ersetzt), `npm run build` im Frontend.
- [ ] Commit: `chore: monorepo scaffold for rewrite (frontend + server)`

### Task 2: Server — Session-Store & Patch-Anwendung (TDD)

**Files:**
- Create: `server/src/store.ts`, Test: `server/test/store.test.ts`

**Interfaces:** Produces:
```ts
export interface Session { doc: SessionDoc; clients: Set<unknown> }
export function createStore(): {
  get(id: string): Session | undefined
  create(id: string, doc: SessionDoc): Session          // create-only, gibt bestehende zurück falls vorhanden
  applyPatch(id: string, path: string, value: unknown, now?: number): boolean  // false wenn Session/Pfad unbekannt
  sweep(now?: number): string[]                          // löscht Sessions mit updatedAt < now-24h UND clients.size === 0
}
```

- [ ] Failing Tests: `applyPatch` für alle 7 Pfadformen (inkl. `tab/<id>/content` findet Tab per id; unbekannte Tab-id → `false`, Doc unverändert; jeder erfolgreiche Patch bumpt `updatedAt`); `create` ist create-only; `sweep` löscht nur stale+verwaiste Sessions.
- [ ] Implementierung: `Map<string, Session>`; Pfad-Parsing per `split('/')`, Whitelist der Pfade (kein generischer Deep-Setter — kein Prototype-Pollution-Risiko).
- [ ] Tests grün, Commit: `feat(server): session store with path patches and ttl sweep`

### Task 3: Server — WebSocket-Dienst

**Files:**
- Create: `server/src/index.ts` (HTTP `/healthz` + `ws`-Upgrade auf `/ws`), Test: `server/test/ws.test.ts` (Integrationstest mit echten Sockets auf ephemerem Port)

**Interfaces:** Consumes `createStore` aus Task 2. Produces: Protokoll exakt wie im Referenzteil; `startServer(port): Promise<{ close(): Promise<void>, port: number }>` für Tests; Sweep-Intervall alle 10 min; `PORT` aus env (Default 8787).

- [ ] Failing Tests: (1) join auf unbekannte Session → `missing`; (2) seed → zweiter Client joint und erhält `doc`; (3) patch von Client A erreicht B, nicht A; (4) patch vor join wird ignoriert; (5) ungültiges JSON schließt nicht die Verbindung; (6) disconnect entfernt Client aus `session.clients`; (7) `/healthz` → 200.
- [ ] Implementierung: pro Verbindung `joinedSession: string | null`; Broadcast über `session.clients` (Set der WebSocket-Objekte) minus Absender.
- [ ] Tests grün, Commit: `feat(server): websocket sync protocol (join/seed/patch/broadcast)`

### Task 4: Frontend — Timer-Engine (pure TS, TDD)

**Files:**
- Create: `frontend/src/lib/timer/engine.ts`, `frontend/src/lib/timer/format.ts`, Tests: `frontend/src/lib/timer/engine.test.ts`, `format.test.ts`

**Interfaces:** Produces:
```ts
// format.ts
export function formatMs(ms: number, centiseconds?: boolean): string  // ceil-Sekunden MM:SS bzw. H:MM:SS; centiseconds: floor + .cc; nie negativ
export function formatClock(date: Date, is12h: boolean): string
// engine.ts
export function elapsedNow(t: Pick<TimerDoc,'isRunning'|'startedAt'|'accumulatedMs'>, now: number): number
export type Derived =
  | { phase: 'idle' }
  | { phase: 'warmup' | 'work' | 'rest'; round: number; remaining: number }
  | { phase: 'done' }
export function deriveInterval(cfg: Pick<TimerDoc,'warmupEnabled'|'warmupDuration'|'workDuration'|'restDuration'|'totalRounds'>, elapsed: number, started: boolean): Derived
export function displayTime(doc: TimerDoc, elapsed: number, now: Date): string
export function displayRound(doc: TimerDoc, elapsed: number): string | null
```
Ableitungslogik (deterministisch, Stack-Options §6.1):
```ts
const warmup = cfg.warmupEnabled ? cfg.warmupDuration : 0
if (!started) return { phase: 'idle' }
if (elapsed < warmup) return { phase: 'warmup', round: 0, remaining: warmup - elapsed }
const t = elapsed - warmup
const cycle = cfg.workDuration + cfg.restDuration
if (cycle <= 0 || cfg.totalRounds <= 0) return { phase: 'done' }
const idx = Math.floor(t / cycle)
if (idx >= cfg.totalRounds) return { phase: 'done' }
const tIn = t - idx * cycle
if (tIn < cfg.workDuration) return { phase: 'work', round: idx + 1, remaining: cfg.workDuration - tIn }
return { phase: 'rest', round: idx + 1, remaining: cycle - tIn }
```

- [ ] Failing Tests — portiere die Verhaltensfälle der Alt-Tests (`tests/timerStore.test.ts` auf main) auf die Engine: Formatierung (24h/12h, Centisekunden, ceil, Stunden, Clamp 0), Tabata-Ablauf (work→rest→Runde 2 … done nach 8), FGB1/FGB2-Parameter, EMOM ohne Rest (work→work), Warmup-Übergang, Countdown „stoppt" bei 0 (`displayTime` = `00:00` für elapsed ≥ target), `displayRound` nur bei work/rest, Rest=0.
- [ ] Implementierung, Tests grün.
- [ ] Commit: `feat(frontend): deterministic timer engine + formatting`

### Task 5: Frontend — Stores (Svelte 5 Runes)

**Files:**
- Create: `frontend/src/lib/stores/timer.svelte.ts`, `workouts.svelte.ts`, `video.svelte.ts`, Tests: `frontend/src/lib/stores/timer.test.ts`, `workouts.test.ts`

**Interfaces:** Produces:
```ts
// timer.svelte.ts — Singleton `timer`
class TimerStore {
  doc: TimerDoc                 // $state, wird bei jeder Aktion IMMUTABLE ersetzt
  now: number                   // $state, globaler 10-ms-Ticker (läuft immer)
  customIntervals: CustomInterval[]  // $state, localStorage 'wodch-custom-intervals'
  elapsed: number               // $derived elapsedNow(doc, now)
  derived: Derived              // $derived deriveInterval(...) für mode 'interval'
  displayTime: string; displayRound: string | null   // $derived
  onDocChange?: (doc: TimerDoc) => void   // von Session-Layer gesetzt; am Ende jeder mutierenden Aktion aufgerufen
  start(); pause(); toggle(); reset(); setMode(m); applyPreset(p); setConfig(partial); saveCustomInterval(slot, ci); applyRemote(doc: TimerDoc)  // ruft onDocChange NICHT auf
}
// workouts.svelte.ts — Singleton `workouts`
class WorkoutStore {
  tabs: WorkoutTab[]; activeTab: number   // $state; Start: 1 Tab 'Workout 1', id nanoid(6)
  onStructure?: (w: WorkoutsDoc) => void; onActiveTab?: (i: number) => void
  onTabField?: (id: string, field: 'content' | 'title', value: string) => void
  addTab(); removeTab(i); renameTab(i, title); setContent(i, content); switchTab(i); reorderTabs(from, to); applyRemote(w); applyRemoteTabField(id, field, value)
}
// video.svelte.ts — Singleton `video`: rawUrl, loop ($state), onUrlChange?
```
Semantik wie Alt-App (Requirements §3/§4): `pause()` schreibt `accumulatedMs = elapsed, startedAt = null`; `reset()` nullt beides; `setMode` resettet komplett; `applyPreset` materialisiert Preset-Werte ins Doc (custom-Slot aus `customIntervals[slot]`); renameTab trimmt/verwirft leer; removeTab klemmt activeTab; reorderTabs aktiviert verschobenen Tab. `start()` bei interval aus idle: `accumulatedMs = 0, startedAt = now`.

- [ ] Failing Tests (jsdom): Start/Pause/Resume/Reset-Feldsemantik, applyPreset für alle Presets, localStorage-Roundtrip (korrupte Daten ignoriert), applyRemote ruft `onDocChange` nicht auf, Workout-Tab-Ops (alle Fälle der Alt-Tests), `onTabField` feuert bei setContent/renameTab, `onStructure` bei add/remove/reorder.
- [ ] Implementierung; Ticker als `setInterval(10)` im Modul (bei `import.meta.env.TEST` nicht automatisch starten — Tests setzen `now` manuell).
- [ ] Tests grün, Commit: `feat(frontend): runes stores for timer/workouts/video`

### Task 6: Frontend — Sync-Client

**Files:**
- Create: `frontend/src/lib/sync/client.ts`, Test: `frontend/src/lib/sync/client.test.ts` (Mock-WebSocket via injizierbarer Factory)

**Interfaces:** Produces:
```ts
export type SyncStatus = 'off' | 'connecting' | 'connected' | 'error'
export interface SyncClient {
  status: () => SyncStatus
  onStatus(cb: (s: SyncStatus) => void): void
  onDoc(cb: (doc: SessionDoc) => void): void
  onPatch(cb: (path: string, value: unknown) => void): void
  connect(sessionId: string, localDoc: () => SessionDoc): void  // join; bei 'missing' → seed(localDoc())
  send(path: string, value: unknown): void                      // no-op wenn nicht verbunden
  close(): void
}
export function createSyncClient(wsUrl: string, wsFactory?: (url: string) => WebSocket): SyncClient
```
Reconnect: bei `close`/`error` Backoff 1 s → 2 s → 5 s → 10 s (cap), dann erneut `join` (Re-Seed-Regel greift). URL: `(https ? 'wss' : 'ws') + '://' + location.host + '/ws'`.

- [ ] Failing Tests: join→doc ruft onDoc; join→missing sendet seed mit localDoc; patch in beide Richtungen; send vor connect ist no-op; Reconnect nach close sendet erneut join; Status-Übergänge off→connecting→connected→error.
- [ ] Implementierung (Timer via `setTimeout`, in Tests mit `vi.useFakeTimers()`).
- [ ] Tests grün, Commit: `feat(frontend): websocket sync client with reconnect + re-seed`

### Task 7: Frontend — Session-Orchestrierung

**Files:**
- Create: `frontend/src/lib/sync/session.svelte.ts`, Test: `frontend/src/lib/sync/session.test.ts`

**Interfaces:** Consumes Stores (Task 5), SyncClient (Task 6), Video-Modul-API (Task 10: `applyRemoteVideo`, `captureVideoDoc`). Produces Singleton `session`:
```ts
class SessionState {
  id: string | null; status: SyncStatus        // $state
  create(): Promise<void>    // nanoid(6), seed via connect, hash setzen, Link in Clipboard (Fehler still)
  joinFromHash(): void       // liest #session=<id> (Regex /[#&]?session=([A-Za-z0-9_-]+)/), connect
  buildDoc(): SessionDoc     // aktueller Gesamtzustand für seed/re-seed
}
export function extractSessionId(hash: string): string | null
```
Verdrahtung (Echo-Schutz: Flag `applyingRemote`, gesetzt während onDoc/onPatch-Anwendung; alle Outgoing-Hooks prüfen es):
- `timer.onDocChange` → `send('timer', doc)`
- `workouts.onStructure` → `send('workouts', w)`; `onActiveTab` → `send('workouts/activeTab', i)`; `onTabField` → debounced 500 ms pro `<id>/<field>` → `send('tab/<id>/<field>', value)`
- `video.onUrlChange` → `send('videoUrl', url)` + `send('video', {isPlaying:false,startedAt:null,accumulatedSeconds:0})`
- Incoming `doc` → alles per `applyRemote*`; Incoming `patch` → per Pfad dispatchen (Fokus-Schutz für Tab-Content liegt im Editor, Task 9).

- [ ] Failing Tests: extractSessionId (3 Fälle der Alt-Tests); Outgoing-Patches bei Store-Aktionen; kein Outgoing während applyRemote; Debounce pro Tab-Feld; create seedet vollständiges Doc.
- [ ] Implementierung, Tests grün, Commit: `feat(frontend): session orchestration (patch routing, debounce, echo guard)`

### Task 8: Frontend — Layout: SplitPane + App-Gerüst + TimerBar

**Files:**
- Create: `frontend/src/lib/components/SplitPane.svelte`, `TimerBar.svelte`, `ShareButton.svelte`; Modify: `frontend/src/App.svelte`, `frontend/src/app.css`

**Interfaces:** Consumes `timer`, `session`. Produces: `SplitPane` mit Props `orientation: 'horizontal' | 'vertical'`, `initial: number` (%, erster Bereich), `min: number` (%), Snippets `a`/`b`; Divider 4 px (`#333`, Hover `#555`) horizontal bzw. 12 px vertikal, Drag via Pointer Events + `setPointerCapture`.

Verhalten (Requirements §2, §3.6, §6.1): Layout 15/85 (min 5 %), innen 50/50. TimerBar: Runde+Zeit zentriert (`clamp()`-Font via Container Query wie Alt-App), Klick → Modal wenn `mode==='clock'` oder `derived.phase` idle/done, sonst `timer.toggle()`; ⚙ rechts → Modal-Event; Connection-Dot links (grau `#333` off / grün `#4caf50` connected / rot `#e63946` error); ShareButton (📤 erstellt Session + kopiert, 🔗 kopiert). Globale Shortcuts in App.svelte: Space/R/M, unterdrückt bei INPUT/TEXTAREA/contenteditable. `joinFromHash()` bei Mount + `hashchange`. CSS-Werte 1:1 aus `src/App.vue`, `src/components/TimerBar.vue`, `ShareButton.vue` (bleiben bis Task 13 im Baum).

- [ ] SplitPane implementieren + Komponententest (Vitest + jsdom: Render, Drag-Simulation via PointerEvents ändert Flex-Basis, min wird geklemmt).
- [ ] TimerBar/ShareButton/App implementieren; Klicklogik-Test (Modal-Event vs. toggle je Zustand).
- [ ] `npm run dev` Smoke (Uhr läuft, Panes resizen), Commit: `feat(frontend): split layout, timer bar, share button`

### Task 9: Frontend — TimerModal + WorkoutEditor

**Files:**
- Create: `frontend/src/lib/components/TimerModal.svelte`, `WorkoutEditor.svelte`; Modify: `App.svelte`

**Interfaces:** Consumes `timer`, `workouts`. Verhalten exakt Requirements §3.7 und §4; Vorlage für Markup/CSS: `src/components/TimerModal.vue`, `WorkoutEditor.vue`.

Zusätzlich neu (Stack-Options §6.1 Fokus-Schutz): WorkoutEditor hält `focused: boolean`; eingehende Remote-Updates für den aktiven Tab-Content werden bei Fokus gepuffert (`pendingRemote`) und bei `blur`/Tab-Wechsel angewendet. Remote-Updates für nicht-aktive Tabs gehen direkt in den Store.

- [ ] TimerModal: Modus-Radios, Countdown/Countup-Zeitfelder (Min max 99/Sek max 59), Uhrformat, Preset-Radios (Custom-Labels aus `customIntervals`), EMOM-/Custom-Felder, Warmup-Toggle+Dauer, Start/Pause/Reset; Start übernimmt Konfiguration (`setConfig`/`saveCustomInterval`/`applyPreset`), reset+start, schließt. Test: Start mit Countdown-Eingabe schreibt `countdownTarget` und startet.
- [ ] WorkoutEditor: Tab-Leiste (add/close ✕ nur bei >1/dblclick-Rename mit Enter/Escape/Blur/Drag-Reorder), contenteditable zentriert 32 px Monospace, Placeholder „Workout eingeben...", Fokus-Schutz. Test: Fokus-Schutz puffert Remote-Content und wendet ihn bei blur an.
- [ ] Tests grün, Commit: `feat(frontend): timer modal + workout editor with focus guard`

### Task 10: Frontend — VideoPlayer (YT IFrame API, ±10s)

**Files:**
- Create: `frontend/src/lib/video/youtube.ts` (Port von `src/composables/useVideoEmbed.ts`: Singleton-Player, API-Loader, Loop bei ended, 1-s-Echo-Fenster nach Remote-Sync, pendingVideoSync vor onReady), `frontend/src/lib/components/VideoPlayer.svelte`; Test: `frontend/src/lib/video/youtube.test.ts` (extractVideoId-Fälle der Alt-Tests)

**Interfaces:** Produces für Session-Layer (Task 7 verdrahtet danach nach):
```ts
export function extractVideoId(url: string): string | null
export function applyRemoteVideo(v: VideoDoc): void          // markRemoteSync + seek/play/pause bzw. pending
export function captureVideoDoc(playing: boolean): VideoDoc  // { isPlaying, startedAt: playing ? Date.now() : null, accumulatedSeconds: getCurrentTime() }
export function setOnLocalStateChange(cb: (v: VideoDoc) => void): void  // YT onStateChange (PLAYING/PAUSED/ENDED) außerhalb Echo-Fenster
export function seekRelative(deltaSeconds: number): void     // clamp ≥ 0; ruft danach cb mit captureVideoDoc(aktueller Playstate)
```
UI: URL-Zeile (Paste ersetzt), Fehlertext „Keine gültige YouTube URL.", Platzhalter, ∞-Toggle (lokal), **neue Buttons `« 10s` / `10s »`** neben dem ∞-Toggle → `seekRelative(±10)` (expliziter Sync-Write, da YT kein Seek-Event liefert).

- [ ] youtube.ts portieren + extractVideoId-Tests grün.
- [ ] VideoPlayer.svelte + Session-Verdrahtung in Task-7-Modul ergänzen (`setOnLocalStateChange` → `send('video', v)`).
- [ ] Manueller Smoke im Dev-Server (Video laden, Play/Pause, ±10s), Commit: `feat(frontend): youtube player with explicit seek sync`

### Task 11: End-to-End-Verifikation Sync (lokal)

**Files:** keine neuen — Verifikationstask.

- [ ] `server: npm run dev` + `frontend: npm run dev`; zwei Browser-Fenster: Session erstellen, Link in Fenster 2 öffnen.
- [ ] Prüfen: Timer start/pause/reset synchron (Tabata läuft phasengleich ohne Writes während des Laufens — Netzwerk-Tab!), Workout-Tippen erscheint ≤ 1 s später, gleichzeitiges Tippen in zwei verschiedenen Tabs verliert nichts, Video-URL + Play/Pause + ±10s synchron, Server-Neustart → Dot rot → reconnect → Re-Seed (State bleibt).
- [ ] Gefundene Bugs fixen (mit Test), Commit: `fix: findings from local e2e sync verification`

### Task 12: Infrastruktur — Docker, k8s, CI

**Files:**
- Create: `frontend/Dockerfile`, `frontend/nginx.conf` (Basis: altes `nginx.conf`), `server/Dockerfile`
- Modify: `k8s/deployment.yaml`, `.github/workflows/docker.yml`

Inhalte:
- `frontend/Dockerfile`: wie altes Multi-Stage (node:22-alpine build → nginx:alpine, dist → `/usr/share/nginx/html`).
- `server/Dockerfile`: node:22-alpine; `npm ci && npm run build && npm prune --omit=dev`; `CMD ["node","dist/index.js"]`; `EXPOSE 8787`.
- k8s: Deployment `wodch-frontend` (Image `ghcr.io/gerrited/wodch-frontend:latest`, Ressourcen wie bisher) + Service; Deployment `wodch-sync` (`replicas: 1`, `strategy: {type: Recreate}`, liveness+readiness `GET /healthz` Port 8787, requests 25m/32Mi limits 100m/64Mi) + Service; Ingress `wodch.g11s.cc`: Pfad `/ws` → `wodch-sync:8787` (Annotations `nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"`, `proxy-send-timeout: "3600"`), Pfad `/` → `wodch-frontend:80`; **kein** `rewrite-target` mehr.
- CI: Test-Job als Matrix (`frontend`, `server`): `npm ci && npm test` im jeweiligen Verzeichnis; Build-Job als Matrix mit `context: ./frontend` → Image `wodch-frontend`, `context: ./server` → `wodch-sync`; Tagging-Regeln (latest/semver) unverändert.

- [ ] Dateien schreiben; lokal `docker build` für beide Images (falls Docker verfügbar, sonst als offener Punkt notieren).
- [ ] Commit: `feat(infra): two-image build, k8s manifests for frontend + sync service`

### Task 13: Alt-App entfernen + README

**Files:**
- Delete: `src/`, `tests/`, `index.html`, `vite.config.ts`, `tsconfig*.json`, `package.json`, `package-lock.json`, `nginx.conf`, `Dockerfile`, `.env.example`, `.env.local` (Firebase obsolet)
- Modify: `README.md` (neuer Stack, Monorepo-Layout, Dev-Anleitung beide Pakete, Sync-Architektur inkl. Re-Seed, Deployment), `.dockerignore`/`.gitignore` anpassen

- [ ] Löschen, README neu schreiben, beide Test-Suiten + Builds final grün.
- [ ] Commit: `chore: remove legacy vue app, rewrite README`

## Self-Review (durchgeführt)

- Spec-Abdeckung: §2 Layout→T8, §3 Timer→T4/5/9, §4 Editor→T9, §5 Video→T10, §6 Sync→T2/3/6/7/11, §7 Design→T8–10 (CSS-Übernahme), §8 Infra→T12, §9 Tests→alle Tasks TDD, §10.2 Instagram bleibt out of scope. Stack-Options §6.1/§6.2 → deterministische Ableitung (T4), Pfad-Patches (T2/7), Fokus-Schutz (T9), ±10s (T10), replicas:1+Re-Seed (T3/6/12).
- Typkonsistenz: `TimerDoc`/`SessionDoc`/Patch-Pfade/`SyncClient`-API in T2–T7 gegeneinander geprüft.
- Keine Platzhalter; Alt-Dateien als Markup/CSS-Referenz sind bis T13 real im Baum vorhanden.
