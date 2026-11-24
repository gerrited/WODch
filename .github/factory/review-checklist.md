# Review-Checkliste der Software Factory

Der Review-Agent prüft jeden Agent-PR gegen diese Liste. Sie ist aus den
Fallstricken in [AGENTS.md](../../AGENTS.md) abgeleitet — wer dort etwas
ergänzt, sollte es hier nachziehen.

## Blocker (→ `CHANGES`)

1. **Sync-Feld an allen vier Stellen:** Neues oder geändertes Feld im
   Session-Doc → `server/src/types.ts`, `frontend/src/lib/types.ts`,
   `applyPatch` in `server/src/store.ts`, `applyPatch` in
   `frontend/src/lib/sync/session.svelte.ts`, dazu Store-Callback und Tests.
   Fehlt eine Stelle, bricht die Synchronisation stumm.
2. **`applyingRemote`-Vertrag:** Store-Callbacks (`onDocChange`,
   `onTabField`, …) feuern nur bei lokalen Aktionen, nie in `applyRemote*()`.
3. **Server-Validierung mitgezogen:** `parseClientMsg`, `validateSessionDoc`
   und die Typ-Guards in `store.ts applyPatch` decken neue Formate ab.
4. **Keine Tick-Streams:** Timer/Video werden abgeleitet; übertragen werden
   nur Zustandsübergänge (`startedAt`, `accumulatedMs`).
5. **Tests vorhanden und am richtigen Ort:** Frontend neben dem Code
   (`foo.test.ts`), Server in `server/test/`. Neue Logik ohne Test = Blocker.
6. **Gate grün:** `npm test` und `npm run build` in `frontend/` **und**
   `server/` (Frontend-Build enthält `svelte-check`).
7. **Keine Architektur-Drift:** kein Router, keine UI-Library, keine DB, kein
   Auth, kein `writable()`, kein ESLint/Prettier, Backend bleibt eine Replica.
8. **Nginx:** Neue `add_header` in einem `location`-Block wiederholen die
   Security-Header (siehe `frontend/nginx.conf`).
9. **Sicherheit:** keine Secrets im Code, keine neuen ungeprüften Eingaben,
   Rate-Limits nicht aufgeweicht.

## Hinweise (kein Blocker, aber kommentieren)

- Kommentare, UI-Texte, Fehlermeldungen und KI-Prompts auf **Deutsch**;
  Kommentare erklären *warum*, nicht *was*.
- `.svelte.ts` nur für reaktiven Code, reine Logik frei von Svelte.
- README/ONBOARDING angepasst, wenn sich Verhalten oder Wire-Format ändert.
- Rollout-Reihenfolge (Backend vor Frontend) im PR erwähnt, wenn das
  Wire-Format sich ändert.
- Scope: Der PR löst das Issue und nicht mehr.
