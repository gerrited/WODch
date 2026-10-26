# Security Review — WODch

**Datum:** 2026-07-14 · **Nachtrag:** 2026-10-26 (Audit, Quellstand `5ec6ae2`)
**Umfang:** Gesamtes Repository (Svelte-Frontend, Node-Sync-Server, Docker/K8s-Deployment)
**Methodik:** Statische Code-Analyse der tatsächlichen Quelltexte, keine dynamischen Tests / kein Live-Deployment.

> **Hinweis zum Nachtrag:** Der Abschnitt [Audit 2026-10-26](#audit-2026-10-26--neue-befunde)
> ergänzt die Befunde F1–F9 sowie offene Validierungsfragen V1–V5. Er korrigiert außerdem
> mehrere Angaben dieses Dokuments, die sich bei der Nachprüfung als falsch oder nicht
> repo-belegbar erwiesen haben (jeweils inline markiert). Der Lauf ist **partiell**: keine
> dynamische Verifikation, keine Live-Deployment-Fakten, keine Audit-Artefakte.

## Architektur in einem Satz

Ein statisches Svelte-SPA hinter Nginx plus ein Node-`ws`-Sync-Server, der Sessions **rein im Arbeitsspeicher** hält. Es gibt **keine Nutzerkonten, keine Authentifizierung und keine Datenbank** — eine Session-ID (`nanoid(16)`, zuvor `nanoid(6)`) im URL-Pfad ist die einzige Zugriffskontrolle (Bearer-Capability). Zusätzlich drei HTTP-Endpunkte (`/generate`, `/estimate`, `/timerize`), die die kostenpflichtige Anthropic-API aufrufen. `/timerize` (nachträglich ergänzt) nutzt dasselbe Pro-IP-Limit und dasselbe globale KI-Budget, deckelt Body (8 KiB) und Workout-Text (2000 Zeichen) und validiert die Modell-Ausgabe streng auf die Grenzen des Timer-Modals ([timerize.ts](server/src/timerize.ts)).

Weil es keine Nutzerdaten/PII, keine Passwörter und keine Persistenz gibt, verschiebt sich das Risikoprofil weg von klassischem Datendiebstahl hin zu **Verfügbarkeit (DoS)**, **Kostenmissbrauch der KI-API** und **Session-Kaperung**.

---

## Zusammenfassung & Priorisierung

| # | Schweregrad | Kategorie | Kurzbeschreibung | Ort |
|---|-------------|-----------|------------------|-----|
| 1 | ~~**Kritisch**~~ ✅ behoben | DoS / Input-Validierung | Unvalidierte WebSocket-`patch`/`seed`-Nachrichten lösen unabgefangene Exceptions aus → **gesamter Backend-Prozess stürzt ab** (alle Sessions gleichzeitig) | [server/src/index.ts:236-247](server/src/index.ts#L236-L247), [server/src/store.ts:131-176](server/src/store.ts#L131-L176) |
| 2 | ~~**Hoch**~~ ✅ behoben | Rate-Limiting / Kosten-DoS | Rate-Limit-Schlüssel basiert auf **fälschbarem** `X-Forwarded-For` → unbegrenzte, kostenpflichtige Anthropic-API-Aufrufe | [server/src/index.ts:63-70](server/src/index.ts#L63-L70), [k8s/deployment.yaml:115-120](k8s/deployment.yaml#L115-L120) |
| 3 | ~~**Hoch**~~ ✅ behoben (Editor-Token optional offen) | Autorisierung / IDOR | Keinerlei Auth auf Sessions; kurze, aufzählbare IDs; **kein Rate-Limit auf WebSocket** → Session-Enumeration, fremde Sessions lesen **und** überschreiben | [server/src/index.ts:212-235](server/src/index.ts#L212-L235), [frontend/src/lib/sync/session.svelte.ts:147](frontend/src/lib/sync/session.svelte.ts#L147) |
| 4 | ~~**Mittel**~~ ✅ behoben | DoS / Ressourcen | Kein `maxPayload` am WebSocket, `seed`-Dokument ohne Größenlimit, In-Memory-Store ohne Obergrenze → Speichererschöpfung | [server/src/index.ts:180](server/src/index.ts#L180), [server/src/store.ts:5-19](server/src/store.ts#L5-L19) |
| 5 | **Mittel** — im Audit 2026-10-26 erneut offen (F2), behoben durch [#10](https://github.com/gerrited/WODch/pull/10) | Client-DoS | Ungetypte Casts in `applyPatch` propagieren beliebige Strukturen an Mitnutzer → Absturz anderer Clients derselben Session. **Korrektur 2026-10-26:** Die Behauptung „serverseitig geschlossen" war falsch — `isWorkoutsDoc` ließ leere Tab-Listen, doppelte IDs und `activeTab` außerhalb des Bereichs durch (siehe F2) | [server/src/store.ts:131-176](server/src/store.ts#L131-L176), [frontend/src/lib/sync/session.svelte.ts:110-133](frontend/src/lib/sync/session.svelte.ts#L110-L133) |
| 6 | ~~**Mittel**~~ ✅ Security-Header behoben · **TLS/HSTS nicht im Repo belegbar** (V2) | Transport / Header | Kein TLS/HSTS in K8s-Ingress, keine Security-Header (CSP, X-Frame-Options, X-Content-Type-Options) in Nginx | [frontend/nginx.conf](frontend/nginx.conf) (Security-Header); TLS/HSTS laut Doku extern via Cloudflare Tunnel — **im Repo existiert weder ein `tls:`-Block noch ein HSTS-Header**, siehe V2 |
| 7 | **Niedrig** | WebSocket / CSWSH | Kein Origin-Check bei `WebSocketServer` (Impact begrenzt, da keine Cookie-Auth) | [server/src/index.ts:180](server/src/index.ts#L180) |
| 8 | ~~**Niedrig**~~ ✅ behoben | Container-Hardening | Beide Container laufen als `root` (kein `USER`) | [server/Dockerfile](server/Dockerfile), [frontend/Dockerfile](frontend/Dockerfile) |
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

**Verbleibendes Restrisiko:** Clients behandeln Remote-Werte nicht defensiv — der empfangende Client ruft `applyRemote(value as TimerDoc)` ohne Feldprüfung auf ([session.svelte.ts:114-116](frontend/src/lib/sync/session.svelte.ts#L114-L116)).

**Korrektur 2026-10-26 (F2):** Die Aussage „kein realistischer Weg über das öffentliche Protokoll mehr bekannt" war **falsch**. `isWorkoutsDoc` prüfte nur Typen und Längen: ein Mitglied konnte `{ tabs: [], activeTab: 0 }`, doppelte Tab-IDs oder `activeTab: 999` broadcasten. Der erste Fall bricht `setContent()`, der zweite lässt Svelte `each_key_duplicate` werfen (auch im Production-Build), der dritte ersetzt getippten Text durch `''`. Behoben durch [#10](https://github.com/gerrited/WODch/pull/10) (server-seitige Invarianten). Die defensive Behandlung im Client bleibt empfehlenswert.

**Empfehlung (offen, niedrig priorisiert):** Clients behandeln Remote-Werte defensiv (z. B. Guards im `applyPatch` von [session.svelte.ts](frontend/src/lib/sync/session.svelte.ts), `activeTab` klemmen).

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
- **Security-Header in `frontend/nginx.conf`**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, CSP mit `default-src 'self'; script-src 'self' https://www.youtube.com; frame-src https://www.youtube-nocookie.com https://www.youtube.com; frame-ancestors 'none'` (Player-IFrames laufen auf der nocookie-Domain, das `iframe_api`-Skript liegt nur auf `www.youtube.com`). Aufgrund der nginx-`add_header`-Erasure-Regel in allen drei Location-Blöcken wiederholt ([nginx.conf](frontend/nginx.conf)).
- **TLS/HSTS extern:** HTTPS-Terminierung und HSTS werden über **Cloudflare Tunnel** abgedeckt — kein Zertifikats-Management im Cluster nötig. In der Cloudflare-Dashboard-Konfiguration sollte HSTS aktiviert sein („HTTP Strict Transport Security“ unter SSL/TLS → Edge Certificates).
  **Korrektur 2026-10-26 (V1/V2):** Das ist eine *externe Annahme*, kein Repo-Beleg. `k8s/deployment.yaml` enthält weder `spec.tls` noch eine cert-manager-Annotation noch `force-ssl-redirect`; `frontend/nginx.conf` sendet kein HSTS. Zugleich setzt die XFF-Normalisierung im Ingress ausdrücklich „kein CDN/LB vor dem Ingress" voraus — beides zusammen ist widersprüchlich. Wenn der Tunnel umgangen wird, laufen Session-Token und Doc-Inhalte im Klartext. Siehe V1/V2.

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
  **Korrektur 2026-10-26 (V1):** Diese Voraussetzung widerspricht der Doku an anderer Stelle, die den Cloudflare Tunnel *vor* dem Ingress beschreibt. Liegt tatsächlich ein Tunnel davor, ist `$remote_addr` für alle Clients derselben Tunnel-Pod-IP — die Pro-IP-Limits werden dann zu einem einzigen globalen Bucket, und ~2–3 gleichzeitig Tippende sprengen das `patch`-Limit. Die Frage ist ohne Live-Zugriff nicht entscheidbar; siehe V1.
- **Globales Budget:** Zusätzlich zum Pro-IP-Limit (10/60 s) deckelt ein über beide KI-Routen geteiltes Gesamtbudget (30/60 s) die Anthropic-Kosten als Circuit Breaker ([index.ts:16-20](server/src/index.ts#L16-L20), [index.ts:87-92](server/src/index.ts#L87-L92)). Geprüft **nach** dem Pro-IP-Limit, damit eine per-IP abgewiesene Flut kein Globalkontingent verbraucht ([generate.ts:71-78](server/src/generate.ts#L71-L78), [estimate.ts:72-79](server/src/estimate.ts#L72-L79)).
- **Tests:** HTTP-Regressionstests gegen den Bypass ([generateHttp.test.ts](server/test/generateHttp.test.ts), [estimateHttp.test.ts](server/test/estimateHttp.test.ts)) sowie Unit-Tests für Budget-Deckel und Prüfreihenfolge ([generate.test.ts](server/test/generate.test.ts), [estimate.test.ts](server/test/estimate.test.ts)).

#### Befund 4 (Mittel) — Speichererschöpfung (Payload/Seed/Store unbegrenzt) — ✅ behoben (2026-07-20)

*Ursprünglicher Befund:* Kein `maxPayload` am `WebSocketServer` (Default 100 MiB pro Frame), `seed` übernahm Dokumente ohne Größen-/Feldprüfung, der In-Memory-Store hatte kein Gesamt-Limit und der TTL-Sweep griff nur bei `clients.size === 0`. Ein Client konnte den Server-Speicher (64 Mi im Deployment) bis zum OOM-Kill füllen.

**Umsetzung (implementiert):**
- **`maxPayload: 64 KiB`** am `WebSocketServer` ([index.ts:26-29](server/src/index.ts#L26-L29), [index.ts:180](server/src/index.ts#L180)) — die `ws`-Library terminiert übergroße Frames selbst (1009); der neue `error`-Listener verhindert, dass das verbindungslokale Fehler-Event als Exception hochgeht ([index.ts:253-255](server/src/index.ts#L253-L255)).
- **Seed-Dokumente werden vollständig gegen das `SessionDoc`-Schema validiert** inkl. Feldlimits (`validateSessionDoc`, [store.ts:67-98](server/src/store.ts#L67-L98), Aufruf [index.ts:225-226](server/src/index.ts#L225-L226)): max. 20 Tabs, Titel ≤ 200, Inhalt ≤ 10 000 Zeichen, `videoUrl` ≤ 500 ([store.ts:7-12](server/src/store.ts#L7-L12)). Dieselben Limits erzwingt `applyPatch` auch auf Patch-Ebene ([store.ts:149](server/src/store.ts#L149), [store.ts:166-171](server/src/store.ts#L166-L171)).
- **Session-Obergrenze** `MAX_SESSIONS = 200` im Store ([store.ts:14-19](server/src/store.ts#L14-L19), [store.ts:120-129](server/src/store.ts#L120-L129)); Seeds oberhalb der Grenze werden verweigert. Damit ist der Gesamtspeicher unabhängig vom Sweep-Verhalten gedeckelt.
  **Korrektur 2026-10-26 (F1/F9):** Die im Code-Kommentar genannte Rechnung „≈ 41 MB < 64 Mi" ist **zu optimistisch**: sie setzt das 64-KiB-Seed-Frame als Doc-Größe an, obwohl Patches ein Doc bis 20 × 10 200 Zeichen wachsen lassen (≈ 205–410 KB je nach Zeichenbreite), und sie ignoriert Node-Basis-RSS, Session-ID-Strings (bis ~64 KiB je Key, unbelegt durch den Validator) und unbekannte Seed-Properties (der Validator ignoriert Extra-Felder). Die harte Verweigerung bei vollem Store blockierte zudem jede neue Session für die ganze TTL — ein Angreifer konnte das mit 200 Seeds (~7 min) auslösen, mit `updatedAt: 1e308` dauerhaft. Beides ist in [#10](https://github.com/gerrited/WODch/pull/10) adressiert (serverseitige Zeit, Verdrängung der ältesten verwaisten Session, Fehler-Frame); die Memory-Bemessung selbst bleibt offen (F9/V5).
- **Tests:** Store-Cap, Feldlimits und `validateSessionDoc` in [store.test.ts](server/test/store.test.ts); 1009-Terminierung in [ws.test.ts](server/test/ws.test.ts).

#### Befund 7 (Niedrig) — Kein Origin-Check am WebSocket (CSWSH)

Der `WebSocketServer` akzeptiert Verbindungen von jedem Origin ([index.ts:180](server/src/index.ts#L180)). Cross-Site-WebSocket-Hijacking ist theoretisch möglich, praktisch aber **kaum ausnutzbar**, weil es keine Cookie-/Ambient-Auth gibt — die Session-ID ist ein Bearer-Token in der URL, das eine fremde Seite nicht kennt. Trotzdem sinnvoll: Origin-Allowlist (`verifyClient`/`handleUpgrade`) als Defense-in-Depth.

**CSRF:** Klassischer CSRF-Schutz ist nicht nötig, da keine Cookie-Sessions existieren. **Korrektur 2026-10-26 (F4):** Die frühere Aussage, `/generate` und `/estimate` verlangten `content-type: application/json` und erzwingen damit einen Preflight, war **falsch** — eine solche Prüfung existiert im Code nicht (`readJsonBody` parst beliebige Bytes). Jede fremde Webseite kann daher per `text/plain`-POST (CORS-simple, kein Preflight) die Browser ihrer Besucher auf die bezahlten Endpunkte schicken. Siehe F4.

**File-Uploads:** Keine vorhanden — keine Angriffsfläche.

#### Befund 8 (Niedrig) — Container laufen als root — ✅ behoben (2026-07-20)

*Ursprünglicher Befund:* Weder [server/Dockerfile](server/Dockerfile) noch [frontend/Dockerfile](frontend/Dockerfile) enthalten eine `USER`-Direktive; die Prozesse laufen als `root`.

*Umgesetzt:*
- **Server:** `USER 1000` (numerische UID — nicht `USER node`; nur so ist `runAsNonRoot` für Kubernetes verifizierbar) in [server/Dockerfile](server/Dockerfile).
- **Frontend:** Base-Image auf `nginxinc/nginx-unprivileged:alpine` (UID 101, lauscht auf 8080, pid-File in `/tmp`) in [frontend/Dockerfile](frontend/Dockerfile); `listen 8080` in [frontend/nginx.conf](frontend/nginx.conf).
- **K8s** ([k8s/deployment.yaml](k8s/deployment.yaml)): beide Deployments mit `runAsNonRoot: true`, `seccompProfile: RuntimeDefault`, `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true` und `capabilities.drop: [ALL]`. Beschreibbare `emptyDir`-Mounts nur für die zwingend nötigen Pfade (`/tmp`; beim Frontend zusätzlich `/var/cache/nginx`). Frontend-Service `targetPort` auf 8080 nachgezogen.

*Verifiziert:* Beide Images gebaut und mit `--read-only --tmpfs /tmp` (Frontend zusätzlich `--tmpfs /var/cache/nginx`) als non-root gestartet — Backend `/healthz` und Frontend `/` liefern HTTP 200, Security-Header bleiben intakt.
**Einschränkung 2026-10-26:** Das war eine manuelle Prüfung zum damaligen Zeitpunkt. Im Repo und in der CI ist sie **nicht reproduzierbar** — es gibt keinen Container-Test und keinen Header-Test; die CI führt nur `npm test`/`npm run build` aus. Die Aussage ist damit von außen nicht falsifizierbar.

---

## Konkrete Fix-Reihenfolge (Empfehlung)

1. ~~**Befund 1** — WebSocket-Nachrichten validieren + `applyPatch` defensiv machen + Handler in `try/catch`.~~ ✅ **Implementiert** (2026-07-20): Schema-Validierung, defensive `applyPatch`, Handler-`try/catch`, Prozess-Sicherheitsnetz, Regressionstests.
2. ~~**Befund 2** — XFF-Vertrauen korrigieren + Budget-Limit für KI-Endpunkte.~~ ✅ **Implementiert** (2026-07-20): rechtestes XFF-Element, Ingress-Normalisierung, globales Budget 30/60 s.
3. ~~**Befund 3/4** — WS-Rate-Limit, längere IDs, `maxPayload`, Seed-/Store-Limits.~~ ✅ **Implementiert** (2026-07-20): `nanoid(16)`, Pro-IP-Limits auf `join`/`seed`/`patch`, `maxPayload` 64 KiB, Seed-Schema + Feldlimits, `MAX_SESSIONS`. (Offen: optionales Editor-Token aus Befund 3.)
4. ~~**Befund 6/8** — TLS/HSTS + Security-Header + Container-Hardening.~~ ✅ **Implementiert** (2026-07-20): Security-Header in nginx (Befund 6, TLS/HSTS extern via Cloudflare — **im Repo nicht belegbar**, siehe V2), `USER 1000` + `nginx-unprivileged` + K8s-`securityContext` mit `readOnlyRootFilesystem`/`runAsNonRoot`/`drop ALL` (Befund 8).

*Hinweis: Empfehlungen sind bewusst zunächst nur dokumentiert gewesen; der Umsetzungsstand ist oben je Befund markiert.*

---

## Audit 2026-10-26 — neue Befunde

**Profil:** `standard` · **Quellstand:** `main` @ `5ec6ae2` (Worktree clean) · **Ausführung:** rein lesend (Quelltext, Lockfiles, gebautes Bundle) — keine Builds, keine Serverstarts, keine Netz-/Provider-Calls, keine Live-Tests.

**Status: partieller Durchlauf.** Alle Befunde sind am Quelltext belegt; dynamische Verifikation (Browser, RSS-Messung, Lasttests) und Live-Deployment-Fakten fehlen. Es wurden **keine** Audit-Artefakte (`findings.json`, `coverage-ledger.json`) erzeugt und keine Validatoren ausgeführt. Die Fixes zu F1/F2/F7 liegen in [#10](https://github.com/gerrited/WODch/pull/10).

### Übersicht

| # | Schwere | Befund | Betroffene Grenze | Status |
|---|---------|--------|-------------------|--------|
| **F1** | **Hoch** | Session-Slots per Seed erschöpfbar, Sessions unsterblich, Ausfall still | Store-Kapazität aller Nutzer | ✅ behoben in #10 |
| **F2** | **Mittel** | Workouts-Invarianten fehlen → fremde Clients brechen, Eingaben gehen verloren | Mitglied → alle Mitglieder | ✅ behoben in #10 |
| **F3** | **Mittel** | KI-Budget durch *ungültige* Requests ausgehungert | Globaler KI-Circuit-Breaker | offen |
| **F4** | **Mittel** | KI-Kosten nur ratenbegrenzt, keine Quote, kein Origin/Content-Type-Gate | Betreiber-Rechnung/Quota | offen |
| **F5** | **Mittel** | Kein Verbindungslimit, kein Heartbeat, kein Outbound-Backpressure | Prozessspeicher (1 Replica) | offen |
| **F6** | **Mittel** | Pre-Join-`patch` und `ping` laufen an jedem Limit vorbei | CPU/Egress | offen |
| **F7** | **Mittel** | Stille Fehlschläge: Client meldet „connected" vor dem Seed-Ack | Sync-Integrität | 🟡 teilweise behoben in #10 |
| **F8** | **Niedrig** | Timer-Semantik ungeprüft → Beep-/Vibrations-Sturm, Fake-Warmup | Mitglied → Mitglied (Audio/UI) | offen |
| **F9** | **Niedrig** | Limiter-Keys ohne Eviction; Session-ID/Seed ohne Format-/Größenprüfung | Prozessspeicher | offen |

### F1 — Session-Slots erschöpfbar, Sessions unsterblich (Hoch) — ✅ behoben in #10

**Prinzipal:** beliebiger anonymer WebSocket-Client · **Eingabe:** `{ t: 'seed', session: <frei>, doc: { …, updatedAt: 1e308 } }`

**Versagende Kontrolle:** `MAX_SESSIONS = 200` + 24-h-TTL-Sweep — [store.ts:20](server/src/store.ts#L20), [store.ts:131-140](server/src/store.ts#L131-L140), [store.ts:197-206](server/src/store.ts#L197-L206).

**Ablauf:**
1. `validateSessionDoc` prüfte `updatedAt` nur auf `isFiniteNumber` ([store.ts:107](server/src/store.ts#L107)) — auch `1e308` wurde übernommen.
2. Der Sweep löschte nur bei `clients.size === 0` **und** `doc.updatedAt < now - 24 h` ([store.ts:200](server/src/store.ts#L200)). Ein Zukunfts-Zeitstempel wird nie alt.
3. Bei vollem Store lieferte `create()` `null`, der Server verwarf den Seed **ohne Antwort** ([index.ts:244-248](server/src/index.ts#L244-L248), Stand `5ec6ae2`).
4. Der Client setzte `connected` bereits **vor** dem Ack ([client.ts:73-77](frontend/src/lib/sync/client.ts#L73-L77)); danach griff `if (!joined) return` ([index.ts:256](server/src/index.ts#L256)) — jede Eingabe wurde geparst und verworfen.

**Ergebnis:** 200 Seeds (≈ 7 min bei 30 Seeds/min/IP) → kein Nutzer konnte mehr eine Session anlegen; mit Zukunfts-`updatedAt` dauerhaft bis zum Pod-Neustart. Bestehende Sessions liefen weiter, der Ausfall war also partiell und für den Nutzer unsichtbar.

**Fix (#10):** `create()` setzt `updatedAt` serverseitig; bei vollem Store wird die älteste verwaiste Session (kein Client, älter als 60 s) verdrängt; verweigerte Seeds antworten mit `{ t: 'error', reason: 'invalid_seed' | 'store_full' }`, der Client setzt `status = 'error'`.

### F2 — Workouts-Invarianten fehlen (Mittel) — ✅ behoben in #10

**Prinzipal:** Session-Mitglied (Link-Inhaber) · **Eingabe:** `{ t: 'patch', path: 'workouts', value: { tabs: […] } }` oder `path: 'workouts/activeTab'`

`isWorkoutsDoc` prüfte Länge/Typen, aber **nicht** Eindeutigkeit der IDs, nicht `tabs.length >= 1`, und `activeTab` nur auf `isFiniteNumber` ([store.ts:72-88](server/src/store.ts#L72-L88), [store.ts:173-178](server/src/store.ts#L173-L178), Stand `5ec6ae2`). Der Test [store.test.ts:158](server/test/store.test.ts#L158) schrieb `{ tabs: [], activeTab: 0 }` ausdrücklich als gültig fest.

| Eingabe | Ergebnis beim Empfänger |
|---|---|
| doppelte `tab.id` | Svelte wirft `each_key_duplicate` **auch im Production-Build** (`svelte/src/internal/client/dom/blocks/each.js`, keyed `{#each}` in [WorkoutEditor.svelte:199](frontend/src/lib/components/WorkoutEditor.svelte#L199)) |
| `tabs: []` oder `activeTab: 999/1.5/-1` | `workouts.setContent(i)` greift auf `tabs[i].content` zu → `TypeError` ([workouts.svelte.ts:40-43](frontend/src/lib/stores/workouts.svelte.ts#L40-L43)); der Tipp-Text erreicht den Store nie und wird beim Blur durch `''` ersetzt ([WorkoutEditor.svelte:128-142](frontend/src/lib/components/WorkoutEditor.svelte#L128-L142)) |

Beides war persistent: der vergiftete Stand blieb im Store, wurde re-broadcastet und beim Reload erneut geladen.

**Fix (#10):** `tabs.length >= 1`, nicht-leere und eindeutige IDs, `Number.isInteger(activeTab) && 0 <= activeTab < tabs.length` — im Doc-Validator und im `workouts/activeTab`-Guard. Client-seitiges Klemmen in `applyRemote*` bleibt als Defense-in-Depth offen.

### F3 — Ungültige KI-Requests verbrauchen das globale Budget (Mittel)

`handleGenerate` prüft **erst** Limits, **dann** die Eingabe ([generate.ts:71-82](server/src/generate.ts#L71-L82)); identisch in [estimate.ts:72-84](server/src/estimate.ts#L72-L84) und [timerize.ts:55-65](server/src/timerize.ts#L55-L65). Ein `400` hat damit bereits ein Pro-IP- **und** ein Global-Token verbraucht.

30 Requests/min mit leerem Body (oder 501 Zeichen) halten das globale 30/min-Budget dauerhaft bei null — **ohne einen einzigen bezahlten API-Call**. Alle echten Nutzer erhalten `429`. Mit einem einzigen IP-Schlüssel (V1) reicht ein Client.

**Fix:** Feldvalidierung **vor** `rateLimiter.allow()` / `globalBudget.allow()`; nur Requests zählen, die den bezahlten Call erreichen.

### F4 — KI-Kosten: Rate statt Quote, kein Origin/Content-Type-Gate (Mittel)

- **Keine Quote:** ausschließlich gleitende 60-s-Fenster ([rateLimit.ts](server/src/rateLimit.ts), [index.ts:19-21](server/src/index.ts#L19-L21)); kein Tages-/Kostenzähler, keine Persistenz. Sustained: **43 200 Calls/Tag** × 1500 `max_tokens` ≈ **65 Mio. Output-Tokens/Tag**, unbegrenzt lange. (Der Geldbetrag hängt am aktuellen Token-Preis — extern, nicht quellgestützt: `needs-validation` für den $-Wert, nicht für die Tokensumme.)
- **Kein Gate:** kein Auth (by design), aber auch **kein** `Origin`/`Referer`- und **kein** `Content-Type`-Check ([index.ts:143-178](server/src/index.ts#L143-L178), `readJsonBody` [index.ts:81-110](server/src/index.ts#L81-L110) parst beliebige Bytes). Jede fremde Webseite kann per `text/plain`-POST (CORS-simple, kein Preflight) die Browser ihrer Besucher auf `/generate` schicken — verteilt über Besucher-IPs, also am Pro-IP-Limit vorbei.
- **Beobachtbarkeit:** kein Request-/Kosten-Logging, keine 429-Metrik.

**Fix:** Tagesquote/Cost-Cap (prozesslokal mit Reset genügt) + `Content-Type`- und `Origin`-Prüfung vor dem Body-Lesen + Logging von 429/Token-Verbrauch.

### F5 — Kein Verbindungslimit, kein Heartbeat, kein Backpressure (Mittel)

`new WebSocketServer({ server, path, maxPayload })` — **kein** `maxConnections`, kein Pro-IP-Zähler, kein `ws.ping()`/`isAlive`-Loop ([index.ts:183](server/src/index.ts#L183); einziger `setInterval` ist der Sweeper [index.ts:279](server/src/index.ts#L279)).

- Unbegrenzte Sockets × 64-Mi-Limit: OOM/EMFILE der einzigen Replica → **alle Sessions verloren** (Schwelle nicht gemessen → `needs-validation`; die fehlende Grenze ist quellklar).
- Idle-Sockets halten Sessions **ewig**: der Sweep überspringt `clients.size > 0`.
- **Backpressure fehlt:** Broadcast prüft nur `readyState`, nie `bufferedAmount` ([index.ts:261-265](server/src/index.ts#L261-L265)). Ein Mitglied mit zweiter, nicht lesender Verbindung lässt Node puffern: 300 Patches/min × ≤64 KiB ≈ **19 MB/min pro stillem Socket**.

**Fix:** Pro-IP- und Gesamt-Connection-Cap, Heartbeat/Idle-Timeout, `bufferedAmount`-Grenze (Client überspringen/schließen).

### F6 — Pre-Join-`patch` und `ping` umgehen jedes Limit (Mittel)

`if (!joined) return` steht **vor** dem Patch-Limiter ([index.ts:255-257](server/src/index.ts#L255-L257)), und `ping` wird vor allen Limitern beantwortet ([index.ts:226-228](server/src/index.ts#L226-L228)). Ein nicht beigetretener Client darf damit unbegrenzt 64-KiB-Frames `JSON.parse`en lassen (CPU) und Pings/Pongs erzeugen (Egress). Bei 100 m CPU-Limit reicht eine Verbindung.

**Fix:** Frame-Ratenlimit vor dem Dispatch (oder `ping` mitzählen, `patch` ohne `joined` ebenfalls limitieren).

### F7 — Stille Fehlschläge, „connected" ohne Ack (Mittel) — 🟡 teilweise behoben in #10

Der Client setzt `connected`, bevor der Server den Seed bestätigt ([client.ts:73-77](frontend/src/lib/sync/client.ts#L73-L77)). Jede Verweigerung — voller Store (F1), ungültiges Doc, **zu großer lokaler Text** — führte zu einer Geister-Session: UI gesund, jede Änderung verworfen, `presence` bleibt 0.

Der nicht-angreiferische Auslöser ist real: Editor und Umbenennen-Feld haben **kein** `maxlength` ([WorkoutEditor.svelte:226-240](frontend/src/lib/components/WorkoutEditor.svelte#L226-L240), [:310-321](frontend/src/lib/components/WorkoutEditor.svelte#L310-L321)), der Store klemmt nicht ([workouts.svelte.ts:33-43](frontend/src/lib/stores/workouts.svelte.ts#L33-L43)). >10 000 Zeichen Content oder >200 Zeichen Titel → Patch wird serverseitig abgewiesen ([store.ts:179-191](server/src/store.ts#L179-L191)) und das Doc ist danach **nicht mehr seedbar** (`validateSessionDoc`) → nach einem Neustart stiller Totalverlust der Session.

**Stand #10:** Der Server meldet Verweigerungen jetzt explizit (`{ t: 'error' }`), der Client setzt daraufhin `status = 'error'`. **Offen:** Der Client setzt `connected` weiterhin optimistisch vor dem Ack; ein echtes `ack`/`nack` für akzeptierte Seeds und Patches sowie das Klemmen der Eingabe auf die Serverlimits fehlen.

### F8 — Timer-Semantik ungeprüft (Niedrig)

`isTimerDoc` prüft nur Typen und `isFiniteNumber` ([store.ts:36-61](server/src/store.ts#L36-L61)) — keine Unter-/Obergrenzen. Ein Mitglied kann `{ workDuration: 1, restDuration: 0, totalRounds: 1e9, isRunning: true }` setzen. Dann wechselt die Runde bei jedem 10-ms-Tick, `detectCue` liefert dauerhaft `'long'` ([cues.ts:43-53](frontend/src/lib/audio/cues.ts#L43-L53)), und [App.svelte:38-51](frontend/src/App.svelte#L38-L51) ruft `beepLong()` (700 ms, 880 Hz) + `buzz(500)` → Beep-/Vibrations-Sturm und Main-Thread-Last. Bedingung: Audio entsperrt und nicht stummgeschaltet (Standard: nicht stumm). Zusätzlich erzeugt ein `startedAt` in der Zukunft einen beliebig langen Fake-`WARMUP` ([engine.ts:15-31](frontend/src/lib/timer/engine.ts#L15-L31), [:78](frontend/src/lib/timer/engine.ts#L78)).

**Fix:** Semantische Grenzen in `isTimerDoc` (Dauern ≥ 0 und ≤ 24 h, `totalRounds` ≤ 1000) + `Math.max(0, …)` in `elapsedNow` + clientseitiges Cue-Rate-Limit.

### F9 — Limiter-Eviction, Session-ID- und Seed-Größe (Niedrig)

- `hits`-Map wird **nie** bereinigt ([rateLimit.ts:14-28](server/src/rateLimit.ts#L14-L28); kein `hits.delete`). Für sich harmlos, mit IP-Rotation (IPv6) unbegrenztes Wachstum.
- `session` wird nur auf `typeof === 'string'` geprüft ([index.ts:47-55](server/src/index.ts#L47-L55)) — kein Format, keine Länge. Die Kapazitätsrechnung im Code ([store.ts:15-20](server/src/store.ts#L15-L20)) ignoriert Keys (bis ~64 KiB × 200 ≈ 12,8 MiB), unbekannte Seed-Properties (der Validator ignoriert Extra-Felder) und Overhead. 20 Tabs × 10 200 Zeichen ≈ 205 KB/Doc (Latin1) bzw. ~410 KB (Umlaute/UTF-16) → 41–82 MB plus Node-Basis-RSS gegen ein 64-Mi-Limit.

**Fix:** `^[A-Za-z0-9_-]{6,32}$` für `session`, `hits.delete()` bei leerem Fenster + Key-Cap, unbekannte Doc-Properties verwerfen, Grenzen an das Memory-Limit koppeln.

### Needs validation (kein Schweregrad)

| # | Offene Frage | Quellbefund | Zu klären durch |
|---|---|---|---|
| **V1** | **XFF/Tunnel-Widerspruch:** [k8s/deployment.yaml:153-158](k8s/deployment.yaml#L153-L158) setzt „kein CDN/LB davor" voraus, [nginx.conf:12](frontend/nginx.conf#L12) und der Abschnitt zu Befund 6 oben beschreiben „Cloudflare Tunnel davor". Bei Tunnel ist `$remote_addr` für **alle** Clients gleich → Pro-IP-Limits werden zu **einem globalen** Bucket (KI 10/min, join 30/min, patch 300/min ⇒ ~2–3 gleichzeitig Tippende fliegen raus, Reconnect-Kaskade). Bei direktem Zugriff ist XFF fälschbar (Befund 2 kehrt zurück). | [index.ts:68-72](server/src/index.ts#L68-L72), [deployment.yaml:157-158](k8s/deployment.yaml#L157-L158), Abschnitt 5 (Befund 6) vs. Abschnitt 7 (Befund 2) in diesem Dokument | Betreiber: Ist cloudflared vor dem Ingress? Sind `allow-snippet-annotations` und `use-forwarded-headers` gesetzt? |
| **V2** | **Kein TLS/HSTS im Repo:** Ingress ohne `spec.tls`, ohne cert-manager, ohne `ssl-redirect`; nginx ohne HSTS. Wenn der Tunnel umgangen wird, laufen Session-Token und Doc-Inhalte im Klartext. | [deployment.yaml:145-236](k8s/deployment.yaml#L145-L236), [nginx.conf:13-15](frontend/nginx.conf#L13-L15) | Betreiber: Ist der Ingress ausschließlich über den Tunnel erreichbar? HSTS/Always-Use-HTTPS aktiv? |
| **V3** | **Cluster-interne Erreichbarkeit:** beide Services ClusterIP, **keine** NetworkPolicy → jeder Pod kann `wodch-backend:8787` direkt erreichen und pro Request beliebiges XFF senden (Limits wirkungslos). | [deployment.yaml:134-143](k8s/deployment.yaml#L134-L143), fehlende NetworkPolicy | Betreiber: existieren Policies außerhalb des Repos? |
| **V4** | **Token im URL-Pfad** landet in nginx-/Ingress-/Cloudflare-Logs (länger als die 24-h-TTL; das Token ist ein Vollzugriff-Credential). | [session.svelte.ts:158](frontend/src/lib/sync/session.svelte.ts#L158), [nginx.conf:50-52](frontend/nginx.conf#L50-L52) (kein `access_log`) | Betreiber: Log-Zugriff/Retention; Fix unabhängig davon: Token ins Fragment (`/#/l/<id>`) |
| **V5** | **Blast-Radius der Svelte-Throws** (bricht nur der Editor oder der Root-Effect) und **OOM-Schwelle** von F5/F9. | F2/F5/F9 | Browser-Test am gebauten Image bzw. RSS-Messung — nur mit Sandbox |

### Verworfene Behauptungen (bewusst festgehalten)

| Behauptung | Warum verworfen |
|---|---|
| „Die CSP blockiert die Inline-Styles, das Split-Layout bricht" | Im gebauten Bundle kompiliert Svelte die `style`-Templates zu `t.style.cssText = …`. CSSOM-Zuweisungen sind von `style-src` **nicht** betroffen. |
| „Der Session-Token leakt per `Referer` an YouTube" | Moderne Browser senden cross-origin nur den Origin (`strict-origin-when-cross-origin`). |
| „Pod-RCE erreicht die Kubernetes-API" | Ohne RBAC-Bindung hat die Default-SA keine Rechte; `automountServiceAccountToken: false` bleibt trotzdem sinnvolle Härtung. |
| „`.env`/`.git` landen im ausgelieferten Image" | Beide Dockerfiles sind multi-stage; die Final-Stage kopiert nur `node_modules`/`dist`/`package.json`. |

### Härtung (keine Befunde)

- **CSP:** `base-uri 'none'`, `object-src 'none'`, `form-action 'none'`, explizit `connect-src 'self'`; `script-src https://www.youtube.com` ist breit (der Origin ist ein User-Content-Host) — `script-src-elem https://www.youtube.com/iframe_api` wäre enger. Der Header wird 4× dupliziert ([nginx.conf:15](frontend/nginx.conf#L15), [:27](frontend/nginx.conf#L27), [:35](frontend/nginx.conf#L35), [:45](frontend/nginx.conf#L45)).
- **nginx:** `server_tokens off`, `Cache-Control: no-cache` für den SPA-Fallback und `Referrer-Policy: no-referrer`.
- **K8s:** `automountServiceAccountToken: false`, `emptyDir.sizeLimit`, `runAsUser: 101` beim Frontend, liveness ≠ readiness, `startupProbe`, `timeoutSeconds: 3`, PDB oder dokumentierter Ausfall bei `Recreate`.
- **CI:** Actions per 40-Zeichen-SHA pinnen, `permissions: contents: read` auf Workflow-Ebene (der **Test-Job** ist heute ungescoped und führt `npm ci` mit Lifecycle-Scripts aus), `npm audit --audit-level=high` als Gate, `concurrency`.
- **Artefakte:** Prod zieht `:latest` (mutabel, `imagePullPolicy` default `Always`) — Digest oder Semver pinnen. `docker/metadata-action` setzt `latest` per Default (`flavor: latest=auto`) auch bei Semver-Tags; die `is_default_branch`-Bedingung gilt nur für die `raw`-Regel.
- **Dependencies:** `npm audit` meldet `devalue 5.8.1` (high, transitiv via Svelte, SSR-/Build-Pfad), `nanoid 3.3.15` via postcss (Build-only), `@vitest/mocker` (moderate). Nicht auslieferungsrelevant, aber es gibt aktuell **kein** Gate, das neue CVEs meldet.
- **`/estimate`:** `title` ist ungeprüft (nur die Content-Summe ≤ 2000), der Prompt kann daher bis ~16 KiB groß werden (≈ 8× dokumentiertes Cap). `/generate`-Ausgabe ist ungekappt und kollidiert mit den Doc-Limits (Teil von F7).
- **SDK:** `AsyncAnthropic` läuft mit Defaults 600 s Timeout / 2 Retries (`@anthropic-ai/sdk/client.js`, `client.d.ts`); Ingress-Read-Timeout ist 3600 s für *alle* Pfade. Ein hängender Upstream hält 30 Sockets bis zu 30 min offen.
- **HTTP-Hygiene:** 404 statt 405, kein 413, `handle()` ohne `catch` (→ potenzieller Hang statt Antwort), `/healthz` akzeptiert jede Methode, `429` ohne `Retry-After`.

### Verifiziert solide

Eingangsvalidierung + `try/catch` pro Frame + `error`-Listener; `maxPayload` 64 KiB (perMessageDeflate aus); kein Cross-Session-Zugriff (`patch` nur nach `joined`); Seed überschreibt keine bestehende Session; **keine Prototype-Pollution** (nur `activeTab` und `tab['content'|'title']` werden dynamisch geschrieben); `applyPatch` lehnt Pfad-/Typ-/Längenverstöße ab und broadcastet sie nicht; `timerize`-Modellausgabe wird exakt auf die Modal-Grenzen geklemmt; KI-Fehler sind generisch (keine Stacktraces); kein XSS-Sink (`{@html}` nur mit datenfreiem `uqr`-SVG, `videoUrl` nur per YouTube-Regex); `applyingRemote`-Vertrag korrekt (keine Sync-Schleife); keine Secrets im Repo oder in den Images; `ws 8.21.0`/`@anthropic-ai/sdk 0.110`/`svelte 5.56.4` ohne bekannten offenen Runtime-CVE; Container-Härtung (non-root, read-only, `drop ALL`, seccomp) wirksam.

### Abdeckung

Abgedeckt: Sync-Protokoll/Store/Lifecycle, HTTP- und KI-Routen inkl. Limit-Reihenfolge, Client-Datenfluss bis zu jedem Render-/Storage-Sink, Service Worker, Deployment/CI/Supply-Chain, Dependencies. **Nicht** abgedeckt: dynamische Verifikation (kein Browser, kein Serverstart, keine RSS-Messung), Live-Deployment-Fakten (V1–V5), externe Preise/Provider-Verhalten. Die Aussage „der Rest ist sauber" ist damit **nicht** verbunden.

### Fix-Reihenfolge (aus diesem Audit)

1. ~~**F1** — serverseitige Seed-Zeit, Verdrängung, Fehler-Frame.~~ ✅ [#10](https://github.com/gerrited/WODch/pull/10)
2. ~~**F2** — Workouts-Invarianten im Store.~~ ✅ [#10](https://github.com/gerrited/WODch/pull/10)
3. **F3/F4** — Validierung vor dem Budget; Tagesquote + Origin/Content-Type-Gate. (F3 ist ein kleiner Umbau der drei Handler, F4 braucht eine Entscheidung zur Quote.)
4. **F5/F6** — Connection-Cap, Heartbeat, `bufferedAmount`; Frame-Ratenlimit vor dem Dispatch.
5. **F7** — Seed-/Patch-`ack`, Client-Limits klemmen. (Der Fehler-Frame aus #10 ist der erste Teil.)
6. **F8/F9** — Timer-Grenzen + Limiter-Eviction + Session-ID-Format.
