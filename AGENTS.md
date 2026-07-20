# AGENTS.md — WODch

Gym-Training-Web-App: Svelte-5-SPA (`frontend/`) + Node-`ws`-Sync-Dienst (`server/`) mit Echtzeit-Session-Sharing, ohne DB/Auth. Tiefere Doku: [ONBOARDING.md](ONBOARDING.md) (Architektur, Sync-Modell, Eigenheiten), [SECURITY_REVIEW.md](SECURITY_REVIEW.md) (Befunde + Fix-Stand), [docs/](docs/) (Requirements/Stack). **Doku und Kommentare sind auf Deutsch — halte das so.**

## Paketstruktur & Befehle

**Zwei unabhängige npm-Pakete, kein Workspace-Tooling, keine Root-`package.json`.** Jeder Befehl läuft im jeweiligen Paketverzeichnis (`frontend/` bzw. `server/`) — `npm install` in beiden separat nötig.

```bash
# Dev (zwei Terminals)
cd server  && npm run dev   # tsx watch, Port 8787
cd frontend && npm run dev  # vite, Port 5173, proxied /ws, /generate, /estimate → 8787

# Tests (pro Paket!)
npm test                              # vitest run, komplett
npx vitest run src/lib/timer/engine.test.ts   # eine Datei
npx vitest run -t 'test-name'         # ein einzelner Test

# Builds
cd frontend && npm run build  # svelte-check LÄUFT ZUERST — Typfehler brechen den Build
cd server && npm run build    # tsc (kompiliert nur src/, Tests werden nicht typgeprüft)
```

- **CI-Gate** ([.github/workflows/docker.yml](.github/workflows/docker.yml)): `npm test` + `npm run build` in **beiden** Paketen muss grün sein, sonst kein Image-Build. Push auf `main` baut Images (`latest`), Tag `vX.Y.Z` baut Release-Images.
- **Kein ESLint/Prettier** konfiguriert — Stil an vorhandenem Code orientieren, nichts Neues einführen.
- `ANTHROPIC_API_KEY` ist optional: ohne Key liefern `/generate` und `/estimate` 503, der Rest läuft (KI-Features lokal testbar, indem Deps injiziert werden — `opts`-Parameter von `startServer`).

## Fallstricke (hier brechen Änderungen sonst still)

1. **Wire-Format ist doppelt gepflegt:** `server/src/types.ts` und `frontend/src/lib/types.ts` definieren dieselben `*Doc`-Formate **per Hand**, ohne geteiltes Paket. Ebenso ist die Patch-Pfad-DSL doppelt implementiert: `applyPatch` in `server/src/store.ts` ↔ `applyPatch` in `frontend/src/lib/sync/session.svelte.ts`. **Neues Sync-Feld → alle vier Stellen + Store-Callback + Tests**, sonst bricht die Synchronisation stumm (kein Compiler-Fehler).
2. **`applyingRemote`-Vertrag:** Stores feuern ihre Callbacks (`onDocChange`, `onTabField`, …) nur bei lokalen Aktionen, nie in `applyRemote*()`; der Session-Layer setzt beim Anwenden entfernter Patches `applyingRemote = true`. Wer das verletzt, baut eine Sync-Endlosschleife — die Nr.-1-Falle in diesem Repo.
3. **Server validiert alles Eingehende (single source of truth):** `parseClientMsg` (Protokoll), `validateSessionDoc` (Seeds), Typ-Guards in `store.ts applyPatch` (Patch-Werte). Bei Änderungen am Wire-Format diese Guards mitziehen — ungültige Frames/Patches werden verworfen, nicht gebroadcastet.
4. **Timer/Video werden abgeleitet, nicht gestreamt.** Übertragen werden nur `startedAt`/`accumulatedMs` (bzw. `accumulatedSeconds`); Phase/Runde/Position rechnet jeder Client lokal. Keine Tick-Streams einführen.
5. **Test-Layout unterscheidet sich pro Paket:** Frontend-Tests liegen neben dem Code (`foo.test.ts` neben `foo.ts`), Server-Tests in `server/test/` (dessen `tsconfig` umfasst nur `src/`).
6. **Rate-Limits in Tests beachten:** der Server limitiert `join`/`seed` (30/60 s) und `patch` (300/60 s) pro IP — alle Verbindungen eines Testlaufs teilen sich die Budgets einer Server-Instanz. Flood-/Missbrauchs-Tests brauchen eine **eigene** `startServer`-Instanz (Muster: `describe('Missbrauch-Limits')` in `server/test/ws.test.ts`).
7. **Backend ist bewusst eine Replica** (Sessions im RAM, `strategy: Recreate`). Nicht skalieren; Mehr-Replica braucht den Redis-Pfad aus [docs/rewrite-stack-options.md](docs/rewrite-stack-options.md) §6.2. Re-Seed (Clients seeden ihren Stand nach `missing` neu) ersetzt Persistenz — dafür müssen Clients immer vollständige, valide Docs senden.
8. **Nginx `add_header`-Erasure:** `add_header` in einem `location`-Block ersetzt *alle* vom Server-Block geerbten Header. Jeder Location-Block, der eigene `add_header` nutzt, muss Security-Header manuell wiederholen — siehe Kommentar in [frontend/nginx.conf](frontend/nginx.conf).

## Konventionen

- **Deutsch:** Code-Kommentare (erklären *warum*, nicht *was*), UI-Texte, Fehlermeldungen, KI-Prompts.
- **`.svelte.ts` = reaktiv** (Runes: `$state`/`$derived`/`$effect`), `.ts` = nicht reaktiv. Stores sind Klassen-Singletons mit Runes (`export const timer = new TimerStore()`) — **kein** `writable()`/State-Management-Library.
- Reine Logik (`timer/`, `video/`, `generate/`) bleibt frei von Svelte, damit isoliert testbar.
- Kein Router, keine UI-Library, keine DB, kein Auth — bewusst simpel; Architektur-Änderungen vorher gegen die Stack-Doku prüfen.

## Nicht-Produktivcode

- `docs/superpowers/` und `.superpowers/`: KI-Workflow-Artefakte (Task-Briefs, Pläne), kein Produktivcode.
- `.claude/worktrees/`: verwaiste Git-Worktrees (bereits gemergt).
- `server/Dockerfile` & `frontend/Dockerfile`: Deployment-Kontext ist jeweils das Paketverzeichnis.
