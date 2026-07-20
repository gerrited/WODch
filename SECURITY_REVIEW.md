# Security Review — WODch

**Datum:** 2026-07-14
**Umfang:** Gesamtes Repository (Svelte-Frontend, Node-Sync-Server, Docker/K8s-Deployment)
**Methodik:** Statische Code-Analyse der tatsächlichen Quelltexte, keine dynamischen Tests / kein Live-Deployment.

## Architektur in einem Satz

Ein statisches Svelte-SPA hinter Nginx plus ein Node-`ws`-Sync-Server, der Sessions **rein im Arbeitsspeicher** hält. Es gibt **keine Nutzerkonten, keine Authentifizierung und keine Datenbank** — eine Session-ID (`nanoid(6)`) im URL-Pfad ist die einzige Zugriffskontrolle (Bearer-Capability). Zusätzlich zwei HTTP-Endpunkte (`/generate`, `/estimate`), die die kostenpflichtige Anthropic-API aufrufen.

Weil es keine Nutzerdaten/PII, keine Passwörter und keine Persistenz gibt, verschiebt sich das Risikoprofil weg von klassischem Datendiebstahl hin zu **Verfügbarkeit (DoS)**, **Kostenmissbrauch der KI-API** und **Session-Kaperung**.

---

## Zusammenfassung & Priorisierung

| # | Schweregrad | Kategorie | Kurzbeschreibung | Ort |
|---|-------------|-----------|------------------|-----|
| 1 | ~~**Kritisch**~~ ✅ behoben | DoS / Input-Validierung | Unvalidierte WebSocket-`patch`/`seed`-Nachrichten lösen unabgefangene Exceptions aus → **gesamter Backend-Prozess stürzt ab** (alle Sessions gleichzeitig) | [server/src/index.ts:213-223](server/src/index.ts#L213-L223), [server/src/store.ts:94-140](server/src/store.ts#L94-L140) |
| 2 | ~~**Hoch**~~ ✅ behoben | Rate-Limiting / Kosten-DoS | Rate-Limit-Schlüssel basiert auf **fälschbarem** `X-Forwarded-For` → unbegrenzte, kostenpflichtige Anthropic-API-Aufrufe | [server/src/index.ts:53-61](server/src/index.ts#L53-L61), [k8s/deployment.yaml:115-120](k8s/deployment.yaml#L115-L120) |
| 3 | **Hoch** | Autorisierung / IDOR | Keinerlei Auth auf Sessions; kurze, aufzählbare IDs; **kein Rate-Limit auf WebSocket** → Session-Enumeration, fremde Sessions lesen **und** überschreiben | [server/src/index.ts:195-223](server/src/index.ts#L195-L223), [frontend/src/lib/sync/session.svelte.ts:147](frontend/src/lib/sync/session.svelte.ts#L147) |
| 4 | **Mittel** | DoS / Ressourcen | Kein `maxPayload` am WebSocket, `seed`-Dokument ohne Größenlimit, In-Memory-Store ohne Obergrenze → Speichererschöpfung | [server/src/index.ts:169](server/src/index.ts#L169), [server/src/index.ts:205-212](server/src/index.ts#L205-L212) |
| 5 | **Mittel** — serverseitig entschärft | Client-DoS | Ungetypte Casts in `applyPatch` propagieren beliebige Strukturen an Mitnutzer → Absturz anderer Clients derselben Session | [server/src/store.ts:94-140](server/src/store.ts#L94-L140), [frontend/src/lib/sync/session.svelte.ts:110-133](frontend/src/lib/sync/session.svelte.ts#L110-L133) |
| 6 | **Mittel** | Transport / Header | Kein TLS/HSTS in K8s-Ingress, keine Security-Header (CSP, X-Frame-Options, X-Content-Type-Options) in Nginx | [k8s/deployment.yaml:107-165](k8s/deployment.yaml#L107-L165), [frontend/nginx.conf](frontend/nginx.conf) |
| 7 | **Niedrig** | WebSocket / CSWSH | Kein Origin-Check bei `WebSocketServer` (Impact begrenzt, da keine Cookie-Auth) | [server/src/index.ts:169](server/src/index.ts#L169) |
| 8 | **Niedrig** | Container-Hardening | Beide Container laufen als `root` (kein `USER`) | [server/Dockerfile](server/Dockerfile), [frontend/Dockerfile](frontend/Dockerfile) |
| 9 | **Niedrig** | Information Disclosure | `join` unterscheidet `missing`/`doc` → Existenz-Orakel für Session-IDs | [server/src/index.ts:195-204](server/src/index.ts#L195-L204) |

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

Es gibt **kein** Login/Session-Management im klassischen Sinn, kein JWT, keine Cookies, kein OAuth. Zugriff läuft ausschließlich über eine Session-ID im Pfad (`/<id>`), erzeugt via `nanoid(6)` in [session.svelte.ts:147](frontend/src/lib/sync/session.svelte.ts#L147).

#### Befund 3 (Hoch) — Fehlende Autorisierung + aufzählbare Session-IDs + kein WS-Rate-Limit

Jeder WebSocket-Client kann per `{ t: 'join', session: <id> }` ([index.ts:195-204](server/src/index.ts#L195-L204)) **jede beliebige** existierende Session betreten, das komplette Dokument empfangen und anschließend per `patch` **verändern** ([index.ts:213-223](server/src/index.ts#L213-L223)). Es gibt keine Prüfung, ob der Client zu dieser Session berechtigt ist — klassisches IDOR, hier by-design als „kein Host-Konzept, volle Kontrolle für alle mit Link".

Verschärfend:
- Die ID-Länge ist nur **6 Zeichen** (Alphabet 64) → Raum ~6,9·10¹⁰. Für Bearer-Tokens grenzwertig, aber vor allem:
- **Auf dem WebSocket gibt es kein Rate-Limiting** (der Limiter in [rateLimit.ts](server/src/rateLimit.ts) schützt nur `/generate` und `/estimate`). Ein Angreifer kann also `join` in hoher Frequenz durchprobieren und aktive Sessions aufzählen ( `missing` vs. `doc`, siehe Befund 9), sie mitlesen und Timer/Workouts/Video fremder Nutzer manipulieren.

**Impact:** Fremde Trainings-Sessions kapern (Timer stoppen, Workout-Text/Video austauschen). Kein PII-Leak, daher „Hoch" statt „Kritisch".

**Empfehlung (nicht implementiert):**
- Session-ID auf mind. 12–16 Zeichen erhöhen (`nanoid(16)`).
- Pro-IP-Rate-Limit auch auf WebSocket-Nachrichten (`join`/`seed`/`patch`) anwenden.
- Optional: ein separates Schreib-Geheimnis (Editor-Token) vom rein lesenden Link trennen, falls „nur ansehen" ein Ziel ist.

---

### 2. Input-Validierung & Injection-Risiken

Keine SQL-/Command-Injection möglich (siehe „gut gelöst"). Das zentrale Problem ist **fehlende Validierung der WebSocket-Nachrichten**.

#### Befund 1 (Kritisch) — Unabgefangene Exceptions crashen den gesamten Server — ✅ behoben (2026-07-20)

*Ursprünglicher Befund:* Der Nachrichten-Handler parste JSON in einem `try/catch`, castete danach aber blind auf `ClientMsg` und rief `store.applyPatch(joined, msg.path, msg.value)` außerhalb jeder Fehlerbehandlung auf. In [store.ts](server/src/store.ts) wurde `path` als String vorausgesetzt und `doc.workouts.tabs.find(...)` ohne Guards aufgerufen. Trivial erreichbare Absturzpfade:

- **Nicht-String-`path`:** `{ t: 'patch', path: 123 }` → `path.split('/')` wirft `TypeError`.
- **Typ-Verwirrung im Dokument:** Erst `{ t: 'patch', path: 'workouts', value: null }` setzt `doc.workouts = null`, dann `{ t: 'patch', path: 'workouts/activeTab', value: 0 }` → Schreibzugriff auf `null` wirft. Analog für `tab/<id>/content` gegen ein `workouts` ohne `.tabs`.

Ein `patch` erfordert ein gesetztes `joined`, das `seed` bedingungslos liefert: ein einzelner unauthentifizierter Client konnte den Prozess in Schleife zum Absturz bringen — bei `replicas: 1` und `strategy: Recreate` ([k8s/deployment.yaml:48-50](k8s/deployment.yaml#L48-L50)) ein wiederholbarer Totalausfall.

**Umsetzung (implementiert):**
- Eingehende Nachrichten werden schema-validiert, bevor irgendetwas sie anfasst: `parseClientMsg` prüft `t` und die Feld-Typen je Nachrichtentyp ([index.ts:28-51](server/src/index.ts#L28-L51), Aufruf [index.ts:189-190](server/src/index.ts#L189-L190)).
- `applyPatch` ist defensiv: `path` muss String sein; jeder Wert wird gegen die Struktur des Zielpfads validiert (`isTimerDoc`/`isVideoDoc`/`isWorkoutsDoc`, [store.ts:7-64](server/src/store.ts#L7-L64)); Zugriffe auf `doc.workouts`/`.tabs` laufen über Guards; ungültige Werte → `return false`, kein Broadcast ([store.ts:94-140](server/src/store.ts#L94-L140)).
- Der gesamte `ws.on('message')`-Body liegt in `try/catch` — eine Exception verwirft die Nachricht, Verbindung und Prozess laufen weiter ([index.ts:179-227](server/src/index.ts#L179-L227)).
- Sicherheitsnetz im Prozess-Einstieg: `process.on('uncaughtException')`/`unhandledRejection` loggen statt zu crashen ([index.ts:256-257](server/src/index.ts#L256-L257)).
- Regressionstests decken die ursprünglichen Absturzpfade ab: [ws.test.ts](server/test/ws.test.ts) („Eingangs-Validierung") und [store.test.ts](server/test/store.test.ts) (defensive `applyPatch`).

#### Befund 5 (Mittel) — Ungetypte Patch-Werte crashen Mitnutzer (Client-DoS) — serverseitig entschärft

Der Server validiert seit dem Fix zu Befund 1 die Struktur pro Pfad als single source of truth ([store.ts:7-64](server/src/store.ts#L7-L64)); falsch strukturierte Patch-Werte werden abgewiesen und **nicht** mehr an andere Clients gebroadcastet. Zwei Restrisiken bleiben:

- Das `seed`-Dokument wird nur flach validiert (muss Objekt sein, [index.ts:39-45](server/src/index.ts#L39-L45)) — ein Angreifer kann beim Erstellen einer Session ein strukturell kaputtes Dokument hinterlegen, das später beitretende Clients empfangen.
- Clients behandeln Remote-Werte weiterhin nicht defensiv: der empfangende Client ruft `applyRemote(value as TimerDoc)` ohne Feldprüfung auf ([session.svelte.ts:114-116](frontend/src/lib/sync/session.svelte.ts#L114-L116)).

**Empfehlung (teilweise offen):** `seed`-Dokumente gegen das `SessionDoc`-Schema validieren; Clients behandeln Remote-Werte defensiv.

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

#### Befund 6 (Mittel) — Kein erzwungenes TLS/HSTS, keine Security-Header

- Der K8s-Ingress ([k8s/deployment.yaml:107-165](k8s/deployment.yaml#L107-L165)) enthält **keinen `tls:`-Block** und keine cert-manager-Annotation. Sofern TLS nicht an einer vorgelagerten LB terminiert (nicht im Repo ersichtlich), laufen HTTP und `ws://` im Klartext — inkl. Workout-Inhalten und Video-URLs.
- Nginx ([frontend/nginx.conf](frontend/nginx.conf)) setzt **keine** `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors` oder `X-Content-Type-Options`. Ohne `X-Frame-Options`/CSP ist Clickjacking möglich; ohne CSP fehlt die Defense-in-Depth gegen das `{@html}` in [ShareModal.svelte:27](frontend/src/lib/components/ShareModal.svelte#L27).

**Sensible Daten:** Es werden keine Passwörter/Tokens verarbeitet oder geloggt (kein `console.log` von Nutzerdaten im Server; einziges Log ist die Startmeldung, [index.ts:260](server/src/index.ts#L260)). Positiv.

**Empfehlung (nicht implementiert):**
- Ingress um `tls:` (cert-manager) erweitern und HTTP→HTTPS-Redirect erzwingen.
- Nginx-Security-Header ergänzen: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` bzw. eine CSP mit `frame-ancestors 'none'`, `script-src 'self' https://www.youtube.com`, `frame-src https://www.youtube.com` (der YouTube-IFrame-API-Loader in [youtube.ts:96-108](frontend/src/lib/video/youtube.ts#L96-L108) muss erlaubt bleiben).

---

### 6. Fehlerbehandlung & Information Disclosure

- HTTP-Fehler geben generische deutsche Meldungen zurück, **keine Stacktraces** ([generate.ts:80-82](server/src/generate.ts#L80-L82), [estimate.ts:76-78](server/src/estimate.ts#L76-L78)). Gut.

#### Befund 9 (Niedrig) — Session-Existenz-Orakel

`join` antwortet mit `{ t: 'doc' }` bei existierender und `{ t: 'missing' }` bei nicht existierender Session ([index.ts:195-204](server/src/index.ts#L195-L204)). In Kombination mit fehlendem WS-Rate-Limit (Befund 3) erlaubt das effiziente Aufzählung gültiger Session-IDs. Für die Funktion (Re-Seed) notwendig, aber ohne Rate-Limit missbrauchbar. Mitigierung = Rate-Limit + längere IDs aus Befund 3.

---

### 7. Weitere Angriffsflächen

#### Befund 2 (Hoch) — Rate-Limit-Bypass via `X-Forwarded-For` → Kosten-DoS auf die KI-API — ✅ behoben (2026-07-20)

*Ursprünglicher Befund:* Der Rate-Limiter (10 Anfragen / 60 s) schlüsselte auf das **linkeste** `X-Forwarded-For`-Element — client-kontrolliert und frei fälschbar. Ein Angreifer sendete je Request ein zufälliges `X-Forwarded-For: <random>` und landete jedes Mal in einem frischen Bucket → **das Limit war wirkungslos**. Da `/generate` und `/estimate` die **kostenpflichtige** Anthropic-API aufrufen, bedeutete das unbegrenzte Kosten auf Betreiber-Rechnung (das 500-/2000-Zeichen-Cap begrenzt nur die Kosten *pro* Aufruf, nicht die Aufrufzahl).

**Umsetzung (implementiert):**
- **Server:** Der Rate-Limit-Schlüssel ist jetzt das **rechteste** XFF-Element (vom letzten Proxy gesetzt, nicht client-kontrolliert) mit Fallback auf die Socket-IP — zentrale Hilfsfunktion `clientIp` ([index.ts:53-61](server/src/index.ts#L53-L61)), genutzt von beiden Routen ([index.ts:92](server/src/index.ts#L92), [index.ts:129](server/src/index.ts#L129)).
- **Ingress:** `X-Forwarded-For` wird komplett überschrieben statt angehängt (`configuration-snippet`, [k8s/deployment.yaml:115-120](k8s/deployment.yaml#L115-L120)) — Clients können dem Header keine Einträge mehr voranstellen. Voraussetzung: kein weiterer Proxy/CDN vor dem Ingress (siehe Kommentar dort).
- **Globales Budget:** Zusätzlich zum Pro-IP-Limit (10/60 s) deckelt ein über beide KI-Routen geteiltes Gesamtbudget (30/60 s) die Anthropic-Kosten als Circuit Breaker ([index.ts:16-20](server/src/index.ts#L16-L20), [index.ts:78-81](server/src/index.ts#L78-L81)). Geprüft **nach** dem Pro-IP-Limit, damit eine per-IP abgewiesene Flut kein Globalkontingent verbraucht ([generate.ts:71-78](server/src/generate.ts#L71-L78), [estimate.ts:72-79](server/src/estimate.ts#L72-L79)).
- **Tests:** HTTP-Regressionstests gegen den Bypass ([generateHttp.test.ts](server/test/generateHttp.test.ts), [estimateHttp.test.ts](server/test/estimateHttp.test.ts)) sowie Unit-Tests für Budget-Deckel und Prüfreihenfolge ([generate.test.ts](server/test/generate.test.ts), [estimate.test.ts](server/test/estimate.test.ts)).

#### Befund 4 (Mittel) — Speichererschöpfung (Payload/Seed/Store unbegrenzt)

- `new WebSocketServer({ server: http, path: '/ws' })` setzt **kein `maxPayload`** ([index.ts:169](server/src/index.ts#L169)) → Default 100 MiB pro Frame.
- `seed` übernimmt das gelieferte Dokument abgesehen von der Objekt-Prüfung unvalidiert in den Store ([index.ts:205-212](server/src/index.ts#L205-L212), [store.ts:86-92](server/src/store.ts#L86-L92)); Größe/Anzahl Tabs unbegrenzt.
- Der In-Memory-Store hat kein Gesamt-Limit; der TTL-Sweep greift nur bei `clients.size === 0` ([store.ts:142-151](server/src/store.ts#L142-L151)) — ein Angreifer, der Verbindungen offen hält, verhindert die Bereinigung.

**Impact:** Ein Client kann durch große/viele Seeds und offen gehaltene Verbindungen den Server-Speicher füllen (Limit 64 Mi im Deployment, [k8s/deployment.yaml:93-94](k8s/deployment.yaml#L93-L94)) → OOM-Kill.

**Empfehlung (nicht implementiert):** `maxPayload` klein setzen (z. B. 64 KiB), Seed-Dokument gegen ein Größen-/Feldlimit validieren, maximale Session-Anzahl + Per-Session-Byte-Cap einführen.

#### Befund 7 (Niedrig) — Kein Origin-Check am WebSocket (CSWSH)

Der `WebSocketServer` akzeptiert Verbindungen von jedem Origin ([index.ts:169](server/src/index.ts#L169)). Cross-Site-WebSocket-Hijacking ist theoretisch möglich, praktisch aber **kaum ausnutzbar**, weil es keine Cookie-/Ambient-Auth gibt — die Session-ID ist ein Bearer-Token in der URL, das eine fremde Seite nicht kennt. Trotzdem sinnvoll: Origin-Allowlist (`verifyClient`/`handleUpgrade`) als Defense-in-Depth.

**CSRF:** Klassischer CSRF-Schutz ist nicht nötig, da keine Cookie-Sessions existieren. `/generate` und `/estimate` verlangen `content-type: application/json` → Browser-Preflight, kein einfacher Cross-Origin-Missbrauch aus dem Browser (direkte HTTP-Clients umgehen das ohnehin — siehe Befund 2).

**File-Uploads:** Keine vorhanden — keine Angriffsfläche.

#### Befund 8 (Niedrig) — Container laufen als root

Weder [server/Dockerfile](server/Dockerfile) noch [frontend/Dockerfile](frontend/Dockerfile) enthalten eine `USER`-Direktive; die Prozesse laufen als `root`. **Empfehlung:** `USER node` (Server) bzw. unprivilegierten Nginx-User verwenden und `readOnlyRootFilesystem`/`runAsNonRoot` im K8s-`securityContext` setzen.

---

## Konkrete Fix-Reihenfolge (Empfehlung)

1. ~~**Befund 1** — WebSocket-Nachrichten validieren + `applyPatch` defensiv machen + Handler in `try/catch`.~~ ✅ **Implementiert** (2026-07-20): Schema-Validierung, defensive `applyPatch`, Handler-`try/catch`, Prozess-Sicherheitsnetz, Regressionstests.
2. ~~**Befund 2** — XFF-Vertrauen korrigieren + Budget-Limit für KI-Endpunkte.~~ ✅ **Implementiert** (2026-07-20): rechtestes XFF-Element, Ingress-Normalisierung, globales Budget 30/60 s.
3. **Befund 3/4** — WS-Rate-Limit, längere IDs, `maxPayload`, Seed-/Store-Limits.
4. **Befund 6/8** — TLS/HSTS + Security-Header + Container-Hardening.

*Hinweis: Empfehlungen sind bewusst zunächst nur dokumentiert gewesen; der Umsetzungsstand ist oben je Befund markiert.*
