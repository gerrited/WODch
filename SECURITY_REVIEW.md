# Security Review — WODch

**Datum:** 2026-07-14
**Umfang:** Gesamtes Repository (Svelte-Frontend, Node-Sync-Server, Docker/K8s-Deployment)
**Methodik:** Statische Code-Analyse der tatsächlichen Quelltexte, keine dynamischen Tests / kein Live-Deployment.

## Architektur in einem Satz

Ein statisches Svelte-SPA hinter Nginx plus ein Node-`ws`-Sync-Server, der Sessions **rein im Arbeitsspeicher** hält. Es gibt **keine Nutzerkonten, keine Authentifizierung und keine Datenbank** — eine Session-ID (`nanoid(16)`, zuvor `nanoid(6)`) im URL-Pfad ist die einzige Zugriffskontrolle (Bearer-Capability). Zusätzlich zwei HTTP-Endpunkte (`/generate`, `/estimate`), die die kostenpflichtige Anthropic-API aufrufen.

Weil es keine Nutzerdaten/PII, keine Passwörter und keine Persistenz gibt, verschiebt sich das Risikoprofil weg von klassischem Datendiebstahl hin zu **Verfügbarkeit (DoS)**, **Kostenmissbrauch der KI-API** und **Session-Kaperung**.

---

## Zusammenfassung & Priorisierung

| # | Schweregrad | Kategorie | Kurzbeschreibung | Ort |
|---|-------------|-----------|------------------|-----|
| 1 | ~~**Kritisch**~~ ✅ behoben | DoS / Input-Validierung | Unvalidierte WebSocket-`patch`/`seed`-Nachrichten lösen unabgefangene Exceptions aus → **gesamter Backend-Prozess stürzt ab** (alle Sessions gleichzeitig) | [server/src/index.ts:236-247](server/src/index.ts#L236-L247), [server/src/store.ts:131-176](server/src/store.ts#L131-L176) |
| 2 | ~~**Hoch**~~ ✅ behoben | Rate-Limiting / Kosten-DoS | Rate-Limit-Schlüssel basiert auf **fälschbarem** `X-Forwarded-For` → unbegrenzte, kostenpflichtige Anthropic-API-Aufrufe | [server/src/index.ts:63-70](server/src/index.ts#L63-L70), [k8s/deployment.yaml:115-120](k8s/deployment.yaml#L115-L120) |
| 3 | ~~**Hoch**~~ ✅ behoben (Editor-Token optional offen) | Autorisierung / IDOR | Keinerlei Auth auf Sessions; kurze, aufzählbare IDs; **kein Rate-Limit auf WebSocket** → Session-Enumeration, fremde Sessions lesen **und** überschreiben | [server/src/index.ts:212-235](server/src/index.ts#L212-L235), [frontend/src/lib/sync/session.svelte.ts:147](frontend/src/lib/sync/session.svelte.ts#L147) |
| 4 | ~~**Mittel**~~ ✅ behoben | DoS / Ressourcen | Kein `maxPayload` am WebSocket, `seed`-Dokument ohne Größenlimit, In-Memory-Store ohne Obergrenze → Speichererschöpfung | [server/src/index.ts:180](server/src/index.ts#L180), [server/src/store.ts:5-19](server/src/store.ts#L5-L19) |
| 5 | **Mittel** — serverseitig geschlossen, clientseitig offen | Client-DoS | Ungetypte Casts in `applyPatch` propagieren beliebige Strukturen an Mitnutzer → Absturz anderer Clients derselben Session | [server/src/store.ts:131-176](server/src/store.ts#L131-L176), [frontend/src/lib/sync/session.svelte.ts:110-133](frontend/src/lib/sync/session.svelte.ts#L110-L133) |
| 6 | ~~**Mittel**~~ ✅ behoben (Cloudflare Tunnel) | Transport / Header | Kein TLS/HSTS in K8s-Ingress, keine Security-Header (CSP, X-Frame-Options, X-Content-Type-Options) in Nginx | [frontend/nginx.conf](frontend/nginx.conf) (Security-Header); TLS/HSTS extern via Cloudflare Tunnel |
| 7 | **Niedrig** | WebSocket / CSWSH | Kein Origin-Check bei `WebSocketServer` (Impact begrenzt, da keine Cookie-Auth) | [server/src/index.ts:180](server/src/index.ts#L180) |
| 8 | **Niedrig** | Container-Hardening | Beide Container laufen als `root` (kein `USER`) | [server/Dockerfile](server/Dockerfile), [frontend/Dockerfile](frontend/Dockerfile) |
| 9 | ~~**Niedrig**~~ ✅ mitigiert | Information Disclosure | `join` unterscheidet `missing`/`doc` → Existenz-Orakel für Session-IDs | [server/src/index.ts:212-222](server/src/index.ts#L212-L222) |

### Was gut gelöst ist (bewusst festgehalten)

- **Keine hartkodierten Secrets.** `ANTHROPIC_API_KEY` kommt aus Env/K8s-Secret ([k8s/deployment.yaml:70-75](k8s/deployment.yaml#L70-L75)), `.env.local` ist in [.gitignore](.gitignore). `git grep` nach `sk-ant`/Passwörtern liefert nichts.
- **Keine SQL-/Command-/Path-Injection möglich** — es gibt keine DB, kein `child_process`, keine Dateizugriffe auf Nutzerpfade, keine Deserialisierung außer `JSON.parse`.
- **XSS weitgehend entschärft:** Svelte escaped standardmäßig. Das einzige `{@html}` in [ShareModal.svelte:27](frontend/src/lib/components/ShareModal.svelte#L27) rendert ein von `uqr` erzeugtes QR-SVG (rein `<rect>`-basiert, kein eingebetteter Text) über eine zeichensatz-beschränkte URL — **kein ausnutzbarer Vektor**, aber siehe Empfehlung unter #6.
- **Fehlermeldungen sind generisch** (keine Stacktraces an den Client), z. B. [generate.ts:80-82](server/src/generate.ts#L80-L82).
- **KI-Output wird als Text gerendert**, nicht als HTML; JSON aus dem Modell wird streng validiert ([estimate.ts:94-111](server/src/estimate.ts#L94-L111)).
- **Dependencies sind aktuell und lockfile-gepinnt** (`ws ^8.18`, jenseits der CVE-2024-37890-Grenze; `@anthropic-ai/sdk ^0.110`, `svelte ^5.28`, `nanoid ^5.1`).

---

## Details je Kategorie

### 1. Authentifizierung & Autorisierung

Es gibt **kein** Login/Session-Management im klassischen Sinn, kein JWT, keine Cookies, kein OAuth. Zugriff läuft ausschließlich über eine Session-ID im Pfad (`/<id>`), erzeugt via `nanoid(16)` in [session.svelte.ts:147](frontend/src/lib/sync/session.svelte.ts#L147).

#### Befund 3 (Hoch) — Fehlende Autorisierung + aufzählbare Session-IDs + kein WS-Rate-Limit — ✅ behoben (2026-07-20, Editor-Token optional offen)

*Ursprünglicher Befund:* Jeder WebSocket-Client konnte per `{ t: 'join', session: <id> }` jede beliebige Session betreten, lesen und per `patch` verändern (by design: kein Host-Konzept). Verschärfend kamen **6-stellige IDs** (Raum ~6,9·10¹⁰) und **fehlendes Rate-Limit auf dem WebSocket** hinzu — aktive Sessions ließen sich per `missing`/`doc` in hoher Frequenz aufzählen und kapern.

**Umsetzung (implementiert):**
- **Session-IDs auf 16 Zeichen erhöht** (`nanoid(16)`, [session.svelte.ts:147](frontend/src/lib/sync/session.svelte.ts#L147)) — Aufzählung ist damit praktisch ausgeschlossen. Bestehende 6-stellige Links funktionieren weiter (Re-Seed-Prinzip).
- **Pro-IP-Rate-Limits auf dem WebSocket:** `join`/`seed` strikt (30/60 s, gegen Enumeration) und `patch` großzügig (300/60 s, parallel Tippende hinter derselben NAT-IP), Schlüssel via `clientIp` ([index.ts:22-29](server/src/index.ts#L22-L29), [index.ts:91-92](server/src/index.ts#L91-L92), [index.ts:213](server/src/index.ts#L213), [index.ts:238](server/src/index.ts#L238)). Bei Überschreitung wird die Verbindung geschlossen (1008) — legitime Clients heilen über den vorhandenen Reconnect-Backoff.
- **Nicht umgesetzt (optional):** ein separates Schreib-Geheimnis (Editor-Token) neben dem Leselink — nur relevant, falls „nur ansehen" je ein Ziel wird. Das IDOR-Grundmodell (volle Kontrolle für Link-Inhaber) bleibt bewusst bestehen.
- **Tests:** Flood-/Close-Verhalten in [ws.test.ts](server/test/ws.test.ts) („Missbrauch-Limits"), ID-Länge in [session.test.ts](frontend/src/lib/sync/session.test.ts).

---

### 2. Input-Validierung & Injection-Risiken

Keine SQL-/Command-Injection möglich (siehe „gut gelöst"). Das zentrale Problem ist **fehlende Validierung der WebSocket-Nachrichten**.

#### Befund 1 (Kritisch) — Unabgefangene Exceptions crashen den gesamten Server — ✅ behoben (2026-07-20)

*Ursprünglicher Befund:* Der Nachrichten-Handler parste JSON in einem `try/catch`, castete danach aber blind auf `ClientMsg` und rief `store.applyPatch(joined, msg.path, msg.value)` außerhalb jeder Fehlerbehandlung auf. In [store.ts](server/src/store.ts) wurde `path` als String vorausgesetzt und `doc.workouts.tabs.find(...)` ohne Guards aufgerufen. Trivial erreichbare Absturzpfade:

- **Nicht-String-`path`:** `{ t: 'patch', path: 123 }` → `path.split('/')` wirft `TypeError`.
- **Typ-Verwirrung im Dokument:** Erst `{ t: 'patch', path: 'workouts', value: null }` setzt `doc.workouts = null`, dann `{ t: 'patch', path: 'workouts/activeTab', value: 0 }` → Schreibzugriff auf `null` wirft. Analog für `tab/<id>/content` gegen ein `workouts` ohne `.tabs`.

Ein `patch` erfordert ein gesetztes `joined`, das `seed` bedingungslos liefert: ein einzelner unauthentifizierter Client konnte den Prozess in Schleife zum Absturz bringen — bei `replicas: 1` und `strategy: Recreate` ([k8s/deployment.yaml:48-50](k8s/deployment.yaml#L48-L50)) ein wiederholbarer Totalausfall.

**Umsetzung (implementiert):**
- Eingehende Nachrichten werden schema-validiert, bevor irgendetwas sie anfasst: `parseClientMsg` prüft `t` und die Feld-Typen je Nachrichtentyp ([index.ts:36-60](server/src/index.ts#L36-L60), Aufruf [index.ts:202-203](server/src/index.ts#L202-L203)).
- `applyPatch` ist defensiv: `path` muss String sein; jeder Wert wird gegen die Struktur des Zielpfads validiert (`isTimerDoc`/`isVideoDoc`/`isWorkoutsDoc`, [store.ts:35-83](server/src/store.ts#L35-L83)); Zugriffe auf `doc.workouts`/`.tabs` laufen über Guards; ungültige Werte → `return false`, kein Broadcast ([store.ts:131-176](server/src/store.ts#L131-L176)).
- Der gesamte `ws.on('message')`-Body liegt in `try/catch` — eine Exception verwirft die Nachricht, Verbindung und Prozess laufen weiter ([index.ts:192-251](server/src/index.ts#L192-L251)).
- Sicherheitsnetz im Prozess-Einstieg: `process.on('uncaughtException')`/`unhandledRejection` loggen statt zu crashen ([index.ts:284-285](server/src/index.ts#L284-L285)).
- Regressionstests decken die ursprünglichen Absturzpfade ab: [ws.test.ts](server/test/ws.test.ts) („Eingangs-Validierung") und [store.test.ts](server/test/store.test.ts) (defensive `applyPatch`).

#### Befund 5 (Mittel) — Ungetypte Patch-Werte crashen Mitnutzer (Client-DoS) — serverseitig geschlossen, clientseitig offen

Der Server validiert die Struktur pro Pfad als single source of truth ([store.ts:131-176](server/src/store.ts#L131-L176)); falsch strukturierte Patch-Werte werden abgewiesen und **nicht** an andere Clients gebroadcastet. Auch `seed`-Dokumente werden seit dem Fix zu Befund 4 vollständig gegen das `SessionDoc`-Schema validiert ([store.ts:87-98](server/src/store.ts#L87-L98), [index.ts:225-226](server/src/index.ts#L225-L226)) — der Server reicht damit keine kaputten Strukturen mehr weiter.

**Verbleibendes Restrisiko:** Clients behandeln Remote-Werte nicht defensiv — der empfangende Client ruft `applyRemote(value as TimerDoc)` ohne Feldprüfung auf ([session.svelte.ts:114-116](frontend/src/lib/sync/session.svelte.ts#L114-L116)). Ausnutzbar nur, falls der Server selbst kompromittiert oder das Protokoll an ihm vorbei gesprochen wird (kein realistischer Weg über das öffentliche Protokoll mehr bekannt).

**Empfehlung (offen, niedrig priorisiert):** Clients behandeln Remote-Werte defensiv (z. B. Guards im `applyPatch` von [session.svelte.ts](frontend/src/lib/sync/session.svelte.ts)).

---

### 3. Secrets & Konfiguration

- **Keine hartkodierten Secrets** (verifiziert per `git grep`). `ANTHROPIC_API_KEY` ausschließlich über Env ([generate.ts:86](server/src/generate.ts#L86)) bzw. K8s-Secret mit `optional: true` ([k8s/deployment.yaml:70-75](k8s/deployment.yaml#L70-L75)); fehlt der Key, degradiert `/generate` sauber mit 503 ([generate.ts:67-69](server/src/generate.ts#L67-L69)).
- **Kein Debug-Modus** in Produktion aktiv; `NODE_ENV=production` im Server-Dockerfile ([server/Dockerfile:10](server/Dockerfile#L10)).
- `.env.local` korrekt in [.gitignore](.gitignore).

Keine Befunde in dieser Kategorie.

---

### 4. Abhängigkeiten

- Server: `@anthropic-ai/sdk ^0.110.0`, `ws ^8.18.0` — `ws` liegt oberhalb der von CVE-2024-37890 (DoS via viele Header) betroffenen Version 8.17.1. Kein bekannter offener CVE.
- Frontend: `svelte ^5.28`, `vite ^6.3.5`, `nanoid ^5.1.16`, `uqr ^0.1.3` — aktuell, keine bekannten kritischen CVEs.
- Versionen sind über `package-lock.json` gepinnt; Bezug aus npm-Registry.

**Empfehlung:** `npm audit` in CI ergänzen (aktuell werden nur Tests + Build ausgeführt, [.github/workflows/docker.yml:33-40](.github/workflows/docker.yml#L33-L40)), damit künftige CVEs auffallen. `uqr` ist mit `0.1.x` sehr jung — im Blick behalten.

---

### 5. Daten & Transport

#### Befund 6 (Mittel) — Kein erzwungenes TLS/HSTS, keine Security-Header — ✅ Security-Header behoben, TLS/HSTS extern via Cloudflare Tunnel (2026-07-20)

*Ursprünglicher Befund:* Der K8s-Ingress enthielt keinen `tls:`-Block und keine cert-manager-Annotation; Nginx setzte keine `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options` oder `X-Content-Type-Options`.

**Umsetzung (implementiert):**
- **Security-Header in `frontend/nginx.conf`**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, CSP mit `default-src 'self'; script-src 'self' https://www.youtube.com; frame-src https://www.youtube.com; frame-ancestors 'none'`. Aufgrund der nginx-`add_header`-Erasure-Regel in allen drei Location-Blöcken wiederholt ([nginx.conf](frontend/nginx.conf)).
- **TLS/HSTS extern:** HTTPS-Terminierung und HSTS werden über **Cloudflare Tunnel** abgedeckt — kein Zertifikats-Management im Cluster nötig. In der Cloudflare-Dashboard-Konfiguration sollte HSTS aktiviert sein („HTTP Strict Transport Security“ unter SSL/TLS → Edge Certificates).

---

### 6. Fehlerbehandlung & Information Disclosure

- HTTP-Fehler geben generische deutsche Meldungen zurück, **keine Stacktraces** ([generate.ts:80-82](server/src/generate.ts#L80-L82), [estimate.ts:76-78](server/src/estimate.ts#L76-L78)). Gut.

#### Befund 9 (Niedrig) — Session-Existenz-Orakel — ✅ mitigiert (2026-07-20)

`join` antwortet mit `{ t: 'doc' }` bei existierender und `{ t: 'missing' }` bei nicht existierender Session ([index.ts:212-222](server/src/index.ts#L212-L222)) — für das Re-Seed-Prinzip notwendig und bleibt bestehen. Die ehemalige Missbrauchsweise (effiziente Aufzählung gültiger IDs) ist durch das Pro-IP-Limit auf `join`/`seed` (30/60 s, Befund 3) und die 16-stelligen Session-IDs nicht mehr praktikabel.

---

### 7. Weitere Angriffsflächen

#### Befund 2 (Hoch) — Rate-Limit-Bypass via `X-Forwarded-For` → Kosten-DoS auf die KI-API — ✅ behoben (2026-07-20)

*Ursprünglicher Befund:* Der Rate-Limiter (10 Anfragen / 60 s) schlüsselte auf das **linkeste** `X-Forwarded-For`-Element — client-kontrolliert und frei fälschbar. Ein Angreifer sendete je Request ein zufälliges `X-Forwarded-For: <random>` und landete jedes Mal in einem frischen Bucket → **das Limit war wirkungslos**. Da `/generate` und `/estimate` die **kostenpflichtige** Anthropic-API aufrufen, bedeutete das unbegrenzte Kosten auf Betreiber-Rechnung (das 500-/2000-Zeichen-Cap begrenzt nur die Kosten *pro* Aufruf, nicht die Aufrufzahl).

**Umsetzung (implementiert):**
- **Server:** Der Rate-Limit-Schlüssel ist jetzt das **rechteste** XFF-Element (vom letzten Proxy gesetzt, nicht client-kontrolliert) mit Fallback auf die Socket-IP — zentrale Hilfsfunktion `clientIp` ([index.ts:63-70](server/src/index.ts#L63-L70)), genutzt von beiden Routen ([index.ts:103](server/src/index.ts#L103), [index.ts:140](server/src/index.ts#L140)).
- **Ingress:** `X-Forwarded-For` wird komplett überschrieben statt angehängt (`configuration-snippet`, [k8s/deployment.yaml:115-120](k8s/deployment.yaml#L115-L120)) — Clients können dem Header keine Einträge mehr voranstellen. Voraussetzung: kein weiterer Proxy/CDN vor dem Ingress (siehe Kommentar dort).
- **Globales Budget:** Zusätzlich zum Pro-IP-Limit (10/60 s) deckelt ein über beide KI-Routen geteiltes Gesamtbudget (30/60 s) die Anthropic-Kosten als Circuit Breaker ([index.ts:16-20](server/src/index.ts#L16-L20), [index.ts:87-92](server/src/index.ts#L87-L92)). Geprüft **nach** dem Pro-IP-Limit, damit eine per-IP abgewiesene Flut kein Globalkontingent verbraucht ([generate.ts:71-78](server/src/generate.ts#L71-L78), [estimate.ts:72-79](server/src/estimate.ts#L72-L79)).
- **Tests:** HTTP-Regressionstests gegen den Bypass ([generateHttp.test.ts](server/test/generateHttp.test.ts), [estimateHttp.test.ts](server/test/estimateHttp.test.ts)) sowie Unit-Tests für Budget-Deckel und Prüfreihenfolge ([generate.test.ts](server/test/generate.test.ts), [estimate.test.ts](server/test/estimate.test.ts)).

#### Befund 4 (Mittel) — Speichererschöpfung (Payload/Seed/Store unbegrenzt) — ✅ behoben (2026-07-20)

*Ursprünglicher Befund:* Kein `maxPayload` am `WebSocketServer` (Default 100 MiB pro Frame), `seed` übernahm Dokumente ohne Größen-/Feldprüfung, der In-Memory-Store hatte kein Gesamt-Limit und der TTL-Sweep griff nur bei `clients.size === 0`. Ein Client konnte den Server-Speicher (64 Mi im Deployment) bis zum OOM-Kill füllen.

**Umsetzung (implementiert):**
- **`maxPayload: 64 KiB`** am `WebSocketServer` ([index.ts:26-29](server/src/index.ts#L26-L29), [index.ts:180](server/src/index.ts#L180)) — die `ws`-Library terminiert übergroße Frames selbst (1009); der neue `error`-Listener verhindert, dass das verbindungslokale Fehler-Event als Exception hochgeht ([index.ts:253-255](server/src/index.ts#L253-L255)).
- **Seed-Dokumente werden vollständig gegen das `SessionDoc`-Schema validiert** inkl. Feldlimits (`validateSessionDoc`, [store.ts:67-98](server/src/store.ts#L67-L98), Aufruf [index.ts:225-226](server/src/index.ts#L225-L226)): max. 20 Tabs, Titel ≤ 200, Inhalt ≤ 10 000 Zeichen, `videoUrl` ≤ 500 ([store.ts:7-12](server/src/store.ts#L7-L12)). Dieselben Limits erzwingt `applyPatch` auch auf Patch-Ebene ([store.ts:149](server/src/store.ts#L149), [store.ts:166-171](server/src/store.ts#L166-L171)).
- **Session-Obergrenze** `MAX_SESSIONS = 200` im Store ([store.ts:14-19](server/src/store.ts#L14-L19), [store.ts:120-129](server/src/store.ts#L120-L129)); Seeds oberhalb der Grenze werden verweigert. Damit ist der Gesamtspeicher unabhängig vom Sweep-Verhalten gedeckelt (Worst case ≈ 41 MB < 64 Mi, Herleitung im Code-Kommentar) — der Sweep-Bypass über offen gehaltene Verbindungen verliert seine Schlagkraft.
- **Tests:** Store-Cap, Feldlimits und `validateSessionDoc` in [store.test.ts](server/test/store.test.ts); 1009-Terminierung in [ws.test.ts](server/test/ws.test.ts).

#### Befund 7 (Niedrig) — Kein Origin-Check am WebSocket (CSWSH)

Der `WebSocketServer` akzeptiert Verbindungen von jedem Origin ([index.ts:180](server/src/index.ts#L180)). Cross-Site-WebSocket-Hijacking ist theoretisch möglich, praktisch aber **kaum ausnutzbar**, weil es keine Cookie-/Ambient-Auth gibt — die Session-ID ist ein Bearer-Token in der URL, das eine fremde Seite nicht kennt. Trotzdem sinnvoll: Origin-Allowlist (`verifyClient`/`handleUpgrade`) als Defense-in-Depth.

**CSRF:** Klassischer CSRF-Schutz ist nicht nötig, da keine Cookie-Sessions existieren. `/generate` und `/estimate` verlangen `content-type: application/json` → Browser-Preflight, kein einfacher Cross-Origin-Missbrauch aus dem Browser (direkte HTTP-Clients umgehen das ohnehin — siehe Befund 2).

**File-Uploads:** Keine vorhanden — keine Angriffsfläche.

#### Befund 8 (Niedrig) — Container laufen als root

Weder [server/Dockerfile](server/Dockerfile) noch [frontend/Dockerfile](frontend/Dockerfile) enthalten eine `USER`-Direktive; die Prozesse laufen als `root`. **Empfehlung:** `USER node` (Server) bzw. unprivilegierten Nginx-User verwenden und `readOnlyRootFilesystem`/`runAsNonRoot` im K8s-`securityContext` setzen.

---

## Konkrete Fix-Reihenfolge (Empfehlung)

1. ~~**Befund 1** — WebSocket-Nachrichten validieren + `applyPatch` defensiv machen + Handler in `try/catch`.~~ ✅ **Implementiert** (2026-07-20): Schema-Validierung, defensive `applyPatch`, Handler-`try/catch`, Prozess-Sicherheitsnetz, Regressionstests.
2. ~~**Befund 2** — XFF-Vertrauen korrigieren + Budget-Limit für KI-Endpunkte.~~ ✅ **Implementiert** (2026-07-20): rechtestes XFF-Element, Ingress-Normalisierung, globales Budget 30/60 s.
3. ~~**Befund 3/4** — WS-Rate-Limit, längere IDs, `maxPayload`, Seed-/Store-Limits.~~ ✅ **Implementiert** (2026-07-20): `nanoid(16)`, Pro-IP-Limits auf `join`/`seed`/`patch`, `maxPayload` 64 KiB, Seed-Schema + Feldlimits, `MAX_SESSIONS`. (Offen: optionales Editor-Token aus Befund 3.)
4. **Befund 6/8** — TLS/HSTS + Security-Header + Container-Hardening.

*Hinweis: Empfehlungen sind bewusst zunächst nur dokumentiert gewesen; der Umsetzungsstand ist oben je Befund markiert.*
