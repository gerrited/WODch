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
| 1 | **Kritisch** | DoS / Input-Validierung | Unvalidierte WebSocket-`patch`/`seed`-Nachrichten lösen unabgefangene Exceptions aus → **gesamter Backend-Prozess stürzt ab** (alle Sessions gleichzeitig) | [server/src/index.ts:169-179](server/src/index.ts#L169-L179), [server/src/store.ts:33-70](server/src/store.ts#L33-L70) |
| 2 | **Hoch** | Rate-Limiting / Kosten-DoS | Rate-Limit-Schlüssel basiert auf **fälschbarem** `X-Forwarded-For` → unbegrenzte, kostenpflichtige Anthropic-API-Aufrufe | [server/src/index.ts:47-49](server/src/index.ts#L47-L49), [server/src/index.ts:87-89](server/src/index.ts#L87-L89) |
| 3 | **Hoch** | Autorisierung / IDOR | Keinerlei Auth auf Sessions; kurze, aufzählbare IDs; **kein Rate-Limit auf WebSocket** → Session-Enumeration, fremde Sessions lesen **und** überschreiben | [server/src/index.ts:151-179](server/src/index.ts#L151-L179), [frontend/src/lib/sync/session.svelte.ts:147](frontend/src/lib/sync/session.svelte.ts#L147) |
| 4 | **Mittel** | DoS / Ressourcen | Kein `maxPayload` am WebSocket, `seed`-Dokument ohne Größenlimit, In-Memory-Store ohne Obergrenze → Speichererschöpfung | [server/src/index.ts:130](server/src/index.ts#L130), [server/src/index.ts:161-168](server/src/index.ts#L161-L168) |
| 5 | **Mittel** | Client-DoS | Ungetypte Casts in `applyPatch` propagieren beliebige Strukturen an Mitnutzer → Absturz anderer Clients derselben Session | [server/src/store.ts:40-66](server/src/store.ts#L40-L66), [frontend/src/lib/sync/session.svelte.ts:110-133](frontend/src/lib/sync/session.svelte.ts#L110-L133) |
| 6 | **Mittel** | Transport / Header | Kein TLS/HSTS in K8s-Ingress, keine Security-Header (CSP, X-Frame-Options, X-Content-Type-Options) in Nginx | [k8s/deployment.yaml:107-165](k8s/deployment.yaml#L107-L165), [frontend/nginx.conf](frontend/nginx.conf) |
| 7 | **Niedrig** | WebSocket / CSWSH | Kein Origin-Check bei `WebSocketServer` (Impact begrenzt, da keine Cookie-Auth) | [server/src/index.ts:130](server/src/index.ts#L130) |
| 8 | **Niedrig** | Container-Hardening | Beide Container laufen als `root` (kein `USER`) | [server/Dockerfile](server/Dockerfile), [frontend/Dockerfile](frontend/Dockerfile) |
| 9 | **Niedrig** | Information Disclosure | `join` unterscheidet `missing`/`doc` → Existenz-Orakel für Session-IDs | [server/src/index.ts:153-160](server/src/index.ts#L153-L160) |

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

Jeder WebSocket-Client kann per `{ t: 'join', session: <id> }` ([index.ts:151-160](server/src/index.ts#L151-L160)) **jede beliebige** existierende Session betreten, das komplette Dokument empfangen und anschließend per `patch` **verändern** ([index.ts:169-179](server/src/index.ts#L169-L179)). Es gibt keine Prüfung, ob der Client zu dieser Session berechtigt ist — klassisches IDOR, hier by-design als „kein Host-Konzept, volle Kontrolle für alle mit Link".

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

#### Befund 1 (Kritisch) — Unabgefangene Exceptions crashen den gesamten Server

Der Nachrichten-Handler parst JSON in einem `try/catch` ([index.ts:142-146](server/src/index.ts#L142-L146)), castet danach aber blind auf `ClientMsg` und ruft `store.applyPatch(joined, msg.path, msg.value)` **außerhalb jeder Fehlerbehandlung** auf ([index.ts:169-179](server/src/index.ts#L169-L179)). Es gibt weder Feld-Validierung noch einen globalen `process.on('uncaughtException', …)`.

In [store.ts](server/src/store.ts) wird `path` als String vorausgesetzt und `doc.workouts.tabs.find(...)` aufgerufen ([store.ts:60-62](server/src/store.ts#L60-L62)). Mehrere trivial erreichbare Absturzpfade:

- **Nicht-String-`path`:** `{ t: 'patch', path: 123 }` → `path.split('/')` wirft `TypeError` ([store.ts:37](server/src/store.ts#L37)).
- **Typ-Verwirrung im Dokument:** Erst `{ t: 'patch', path: 'workouts', value: null }` setzt `doc.workouts = null` ([store.ts:53-55](server/src/store.ts#L53-L55)), dann `{ t: 'patch', path: 'workouts/activeTab', value: 0 }` → `doc.workouts.activeTab = …` wirft auf `null` ([store.ts:58](server/src/store.ts#L58)). Analog für `tab/<id>/content` gegen ein `workouts` ohne `.tabs`.

Ein `patch` erfordert vorher ein gesetztes `joined`. Das liefert `seed` bedingungslos ([index.ts:161-168](server/src/index.ts#L161-L168)): der Angreifer erzeugt eine eigene Session und sendet dann die zwei Crash-Patches. Eine geworfene Exception in einem `'message'`-Listener wird zu `uncaughtException` → **der Node-Prozess beendet sich**. Wegen `replicas: 1` und `strategy: Recreate` ([k8s/deployment.yaml:48-50](k8s/deployment.yaml#L48-L50)) reißt **ein einzelner unauthentifizierter Client alle laufenden Sessions gleichzeitig ab** und kann das in Schleife wiederholen.

**Impact:** Vollständiger, wiederholbarer Denial-of-Service des Backends durch eine Handvoll Bytes. Höchste Priorität.

**Empfehlung (nicht implementiert):**
- Eingehende Nachrichten schema-validieren (`t` prüfen, `path` muss String sein, `value` gegen erwarteten Typ des Zielpfads validieren) **bevor** `applyPatch` aufgerufen wird.
- `applyPatch` defensiv machen: `typeof value` je Pfad prüfen; `doc.workouts?.tabs` mit Guards; bei ungültigen Werten `return false`.
- Den gesamten `ws.on('message')`-Body in `try/catch` kapseln und Fehler pro Verbindung isolieren (Verbindung ggf. schließen, Prozess nie).
- Als Sicherheitsnetz zusätzlich `process.on('uncaughtException')`/`unhandledRejection` (loggen, nicht crashen) — aber **nicht** als Ersatz für die Validierung.

#### Befund 5 (Mittel) — Ungetypte Patch-Werte crashen Mitnutzer (Client-DoS)

Selbst mit server-seitigem Fix propagiert der Server valide-aussehende, aber strukturell falsche Werte an andere Clients. Beispiel: `applyPatch` akzeptiert `doc.timer = value as TimerDoc` ohne Feldprüfung ([store.ts:41-43](server/src/store.ts#L41-L43)); der empfangende Client ruft `applyRemote(value as TimerDoc)` ([session.svelte.ts:114-116](frontend/src/lib/sync/session.svelte.ts#L114-L116)). Ein Angreifer in derselben Session kann so gezielt fehlerhafte Timer-/Workout-Strukturen senden und die App der anderen Teilnehmer zum Absturz bringen.

**Empfehlung:** Server validiert Struktur pro Pfad (single source of truth), Clients behandeln Remote-Werte defensiv.

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

**Sensible Daten:** Es werden keine Passwörter/Tokens verarbeitet oder geloggt (kein `console.log` von Nutzerdaten im Server; einziges Log ist die Startmeldung, [index.ts:210](server/src/index.ts#L210)). Positiv.

**Empfehlung (nicht implementiert):**
- Ingress um `tls:` (cert-manager) erweitern und HTTP→HTTPS-Redirect erzwingen.
- Nginx-Security-Header ergänzen: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` bzw. eine CSP mit `frame-ancestors 'none'`, `script-src 'self' https://www.youtube.com`, `frame-src https://www.youtube.com` (der YouTube-IFrame-API-Loader in [youtube.ts:96-108](frontend/src/lib/video/youtube.ts#L96-L108) muss erlaubt bleiben).

---

### 6. Fehlerbehandlung & Information Disclosure

- HTTP-Fehler geben generische deutsche Meldungen zurück, **keine Stacktraces** ([generate.ts:80-82](server/src/generate.ts#L80-L82), [estimate.ts:76-78](server/src/estimate.ts#L76-L78)). Gut.

#### Befund 9 (Niedrig) — Session-Existenz-Orakel

`join` antwortet mit `{ t: 'doc' }` bei existierender und `{ t: 'missing' }` bei nicht existierender Session ([index.ts:153-160](server/src/index.ts#L153-L160)). In Kombination mit fehlendem WS-Rate-Limit (Befund 3) erlaubt das effiziente Aufzählung gültiger Session-IDs. Für die Funktion (Re-Seed) notwendig, aber ohne Rate-Limit missbrauchbar. Mitigierung = Rate-Limit + längere IDs aus Befund 3.

---

### 7. Weitere Angriffsflächen

#### Befund 2 (Hoch) — Rate-Limit-Bypass via `X-Forwarded-For` → Kosten-DoS auf die KI-API

Der Rate-Limiter (10 Anfragen / 60 s) wird nach IP geschlüsselt, wobei die IP aus dem **client-kontrollierten** `X-Forwarded-For` gewonnen wird — genommen wird das **linkeste** Element ([index.ts:47-49](server/src/index.ts#L47-L49) für `/generate`, identisch [index.ts:87-89](server/src/index.ts#L87-L89) für `/estimate`). Ein Angreifer sendet je Request ein zufälliges `X-Forwarded-For: <random>` und landet jedes Mal in einem frischen Bucket → **das Limit ist wirkungslos**.

Da `/generate` und `/estimate` die **kostenpflichtige** Anthropic-API aufrufen ([generate.ts:90-103](server/src/generate.ts#L90-L103), [estimate.ts:114-127](server/src/estimate.ts#L114-L127)), bedeutet das unbegrenzte Kosten auf Kosten des Betreibers (das 500-/2000-Zeichen-Cap begrenzt nur die Kosten *pro* Aufruf, nicht die Aufrufzahl). Zusätzlich Body-Limit-Prüfung vorhanden ([index.ts:56-59](server/src/index.ts#L56-L59)), aber das adressiert nur Größe, nicht Frequenz.

**Empfehlung (nicht implementiert):**
- Hinter dem Ingress der **rechtesten vertrauenswürdigen** XFF-Position vertrauen oder eine bekannte Anzahl Proxies überspringen — nicht `[0]`. Besser: am Ingress `X-Forwarded-For` normalisieren/überschreiben und serverseitig nur die vom Ingress gesetzte, vertrauenswürdige Client-IP verwenden.
- Zusätzlich globales Gesamt-Rate-Limit/Budget für die KI-Endpunkte (Circuit Breaker), unabhängig von der IP.

#### Befund 4 (Mittel) — Speichererschöpfung (Payload/Seed/Store unbegrenzt)

- `new WebSocketServer({ server: http, path: '/ws' })` setzt **kein `maxPayload`** ([index.ts:130](server/src/index.ts#L130)) → Default 100 MiB pro Frame.
- `seed` übernimmt das gelieferte Dokument ungeprüft in den Store ([index.ts:161-168](server/src/index.ts#L161-L168), [store.ts:25-31](server/src/store.ts#L25-L31)); Größe/Anzahl Tabs unbegrenzt.
- Der In-Memory-Store hat kein Gesamt-Limit; der TTL-Sweep greift nur bei `clients.size === 0` ([store.ts:72-81](server/src/store.ts#L72-L81)) — ein Angreifer, der Verbindungen offen hält, verhindert die Bereinigung.

**Impact:** Ein Client kann durch große/viele Seeds und offen gehaltene Verbindungen den Server-Speicher füllen (Limit 64 Mi im Deployment, [k8s/deployment.yaml:93-94](k8s/deployment.yaml#L93-L94)) → OOM-Kill.

**Empfehlung (nicht implementiert):** `maxPayload` klein setzen (z. B. 64 KiB), Seed-Dokument gegen ein Größen-/Feldlimit validieren, maximale Session-Anzahl + Per-Session-Byte-Cap einführen.

#### Befund 7 (Niedrig) — Kein Origin-Check am WebSocket (CSWSH)

Der `WebSocketServer` akzeptiert Verbindungen von jedem Origin ([index.ts:130](server/src/index.ts#L130)). Cross-Site-WebSocket-Hijacking ist theoretisch möglich, praktisch aber **kaum ausnutzbar**, weil es keine Cookie-/Ambient-Auth gibt — die Session-ID ist ein Bearer-Token in der URL, das eine fremde Seite nicht kennt. Trotzdem sinnvoll: Origin-Allowlist (`verifyClient`/`handleUpgrade`) als Defense-in-Depth.

**CSRF:** Klassischer CSRF-Schutz ist nicht nötig, da keine Cookie-Sessions existieren. `/generate` und `/estimate` verlangen `content-type: application/json` → Browser-Preflight, kein einfacher Cross-Origin-Missbrauch aus dem Browser (direkte HTTP-Clients umgehen das ohnehin — siehe Befund 2).

**File-Uploads:** Keine vorhanden — keine Angriffsfläche.

#### Befund 8 (Niedrig) — Container laufen als root

Weder [server/Dockerfile](server/Dockerfile) noch [frontend/Dockerfile](frontend/Dockerfile) enthalten eine `USER`-Direktive; die Prozesse laufen als `root`. **Empfehlung:** `USER node` (Server) bzw. unprivilegierten Nginx-User verwenden und `readOnlyRootFilesystem`/`runAsNonRoot` im K8s-`securityContext` setzen.

---

## Konkrete Fix-Reihenfolge (Empfehlung)

1. **Befund 1** — WebSocket-Nachrichten validieren + `applyPatch` defensiv machen + Handler in `try/catch`. (Kritisch, kleiner Aufwand, verhindert Totalausfall.)
2. **Befund 2** — XFF-Vertrauen korrigieren + Budget-Limit für KI-Endpunkte. (Direkter finanzieller Schaden.)
3. **Befund 3/4** — WS-Rate-Limit, längere IDs, `maxPayload`, Seed-/Store-Limits.
4. **Befund 6/8** — TLS/HSTS + Security-Header + Container-Hardening.

*Hinweis: Alle Empfehlungen sind bewusst nicht implementiert, sondern nur dokumentiert.*
