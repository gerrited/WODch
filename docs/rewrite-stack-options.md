# WODch Rewrite — Alternative Tech-Stacks & Infrastruktur

**Datum:** 2026-07-04
**Basis:** [rewrite-requirements.md](./rewrite-requirements.md)
**Ist-Stack:** Vue 3 + Vite + Pinia + splitpanes | Firebase Realtime Database | Nginx-Container auf eigenem k8s-Cluster, GitHub Actions → ghcr.io

---

## 1. Bewertungskriterien

Die App ist klein (5 Komponenten, 3 Stores), aber mit zwei anspruchsvollen Kernen:

1. **Timer-Genauigkeit** — 10-ms-Ticks, delta-basierte Zeitrechnung; das UI muss hochfrequente Updates performant rendern.
2. **Echtzeit-Sync** — Pub/Sub pro Session, Teilpfad-Writes, last-write-wins, 24-h-TTL, ohne Auth, quasi kostenlos.

Weitere Kriterien: Bundle-Größe (Gym-Tablet/altes Handy als Zielgerät), Betriebsaufwand (Hobby-Projekt, 1 Person), Unabhängigkeit von Vendor-Lock-in (Firebase-Ersatz ist ja gerade der Anlass), Wiederverwendbarkeit des vorhandenen k8s-Clusters (`wodch.g11s.cc`).

---

## 2. Frontend-Framework

| Option | Stärken für WODch | Schwächen | Einschätzung |
|---|---|---|---|
| **React 19 + Vite** | Größtes Ökosystem, `react-resizable-panels` als splitpanes-Ersatz, viele YT-Player-Wrapper | Re-Render-Modell braucht Disziplin bei 10-ms-Ticks (Selector-basierte Stores nötig) | Solide Standardwahl, wenn React-Kenntnisse das Ziel sind |
| **SvelteKit (Svelte 5, Runes)** | Kompilierte Reaktivität = sehr effiziente Hochfrequenz-Updates, kleinstes Bundle, Stores eingebaut (kein Pinia-Äquivalent nötig) | Kleineres Ökosystem; Split-Pane-Komponente ggf. selbst bauen (~100 Zeilen) | **Beste technische Passung** für Timer-App dieser Größe |
| **SolidJS** | Fine-grained Signals, ideal für 100 Updates/s ohne Re-Render | Kleinstes Ökosystem der drei, weniger Lernressourcen | Technisch exzellent, aber Nische |
| **Angular 19+** | Batteries included, Signals inzwischen gut | Deutlich zu schwergewichtig für 5 Komponenten | Nicht empfohlen |
| **Vanilla TS + Signals (z. B. `@preact/signals-core`)** | Null Framework-Overhead, App ist klein genug | Tabs/Modal/Sync von Hand; Testbarkeit leidet | Nur wenn Minimalismus explizit Ziel ist |

**State-Management:** Bei React → Zustand (Store-Modell fast 1:1 von Pinia übertragbar, Selector-Subscriptions für den Tick). Bei Svelte/Solid → eingebaute Stores/Signals, keine Zusatzbibliothek.

**Unverändert sinnvoll:** TypeScript, Vitest (+ Playwright für E2E, falls gewünscht), YouTube IFrame Player API (dafür gibt es keinen Ersatz — Anforderung 5).

---

## 3. Realtime-Backend (Firebase-RTDB-Ersatz)

Das ist die wichtigste Entscheidung. Anforderungen: Pub/Sub pro Session, Teilpfad-Updates, last-write-wins, öffentliche Sessions per unguessable ID, 24-h-TTL, Free Tier.

| Option | Modell | Passung | Trade-offs |
|---|---|---|---|
| **Eigener WebSocket-Dienst** (Node/Bun + `ws`, oder Go) auf dem k8s-Cluster | Ein Prozess hält Sessions in Memory (Map pro Session-ID), broadcastet Patches, TTL per Timer | **Sehr hoch** — das Session-Modell ist trivial (ein JSON-Dokument, last-write-wins); kein externer Anbieter, volle Kontrolle, null Kosten | Selbst betreiben (aber: Cluster existiert schon); Persistenz bei Pod-Neustart geht verloren — bei 24-h-Wegwerf-Sessions akzeptabel, sonst Redis dahinter |
| **Cloudflare Durable Objects / PartyKit** | Ein Actor pro Session, WebSocket-Hibernation, Alarms für TTL | **Sehr hoch** — Session-per-Objekt ist genau das Actor-Modell; global niedrige Latenz | Vendor-Bindung an Cloudflare; Workers-Paid-Plan (~5 $/Monat) für Durable Objects |
| **Supabase Realtime** (Broadcast + Postgres) | Channels pro Session; State optional in Postgres-Tabelle mit `updated_at`, Cleanup per `pg_cron` | Hoch — Open Source, selbst hostbar (auch auf dem k8s-Cluster), Free Tier großzügig | Broadcast allein persistiert nicht (Late-Joiner braucht DB-Read); mehr bewegliche Teile als nötig |
| **Convex** | Reaktive Queries, Server-Functions, Scheduled Functions für TTL | Hoch — sehr gutes DX, Sync-Logik wird fast trivial | Proprietär gehostet; für „weg von Firebase-Lock-in" nur ein Anbieterwechsel |
| **Ably / Pusher / Liveblocks** | Managed Pub/Sub bzw. Presence/Storage | Mittel — Sync ja, aber Dokument-Storage + TTL erfordert Zusatzlogik oder teurere Pläne | Free-Tier-Limits (Verbindungen/Nachrichten) können bei Timer-Transitions reichen, sind aber ein Risiko |
| **Y.js (CRDT) + y-websocket** | CRDT-Dokument pro Session | Überdimensioniert — laut Spec ist zeichenweise Kollaboration explizit out of scope; last-write-wins reicht | Komplexität ohne Nutzen; nur relevant, falls kollaboratives Editing doch kommen soll |
| **Appwrite / PocketBase (self-hosted)** | Firebase-ähnliche Realtime-Subscriptions | Mittel–hoch — PocketBase ist eine einzige Go-Binary, läuft problemlos im Cluster | Realtime-Granularität gröber (Record-Level statt Teilpfad); TTL per Cron-Hook selbst bauen |

**Wichtig für alle Optionen:** Die Timestamp-Sync-Strategie (Anforderung 6.3) ist backend-agnostisch — sie verlangt nur „Patch schreiben, Patch empfangen". Der Wechsel des Backends ändert die Sync-Logik kaum, wenn man sie hinter einem schmalen Interface (`subscribe(id, cb)` / `patch(id, path, value)`) kapselt. **Diese Abstraktionsschicht sollte der Rewrite unabhängig von der Backend-Wahl einziehen.**

---

## 4. Hosting & Infrastruktur

| Option | Beschreibung | Passung |
|---|---|---|
| **Bestehender k8s-Cluster (Status quo modernisiert)** | Statisches Frontend + eigener Sync-Dienst als zweites Deployment; Ingress vorhanden; ghcr + Actions bleiben | **Hoch**, wenn Backend selbst gehostet wird — ein Ort für alles, keine neuen Accounts |
| **Cloudflare Pages + Workers/Durable Objects** | Frontend als statisches Asset am Edge, Sync im selben Ökosystem; CI via Actions → `wrangler deploy` | **Hoch**, wenn man k8s loswerden will — kein Container, kein Nginx, kein Registry mehr nötig |
| **Netlify / Vercel (nur Frontend)** | Statisches Hosting mit Preview-Deploys | Nur sinnvoll in Kombination mit externem Realtime-Backend (Supabase/Convex/Ably) |
| **Fly.io / Railway / Render** | Container-Hosting ohne eigenes k8s | Mittel — ersetzt k8s durch Managed-Container, aber der Cluster existiert ja bereits |
| **VPS + Docker Compose + Caddy** | Maximal simpel: ein Compose-File, Caddy mit Auto-TLS | Gut, falls der k8s-Cluster ohnehin abgeschafft werden soll |

**CI/CD:** GitHub Actions bleibt in allen Varianten die richtige Wahl (Repo liegt auf GitHub, `GITHUB_TOKEN`-Auth eingespielt). Beizubehaltende Muster: Test-Gate vor Build/Deploy, `main` → latest, `v*`-Tags → versionierte Releases. Bei Cloudflare/Netlify entfallen Docker-Build, Multi-Arch und Registry ersatzlos.

**Konfiguration:** Beim Selbst-Hosten des Sync-Backends verschwindet das Build-Time-Credentials-Problem (Anforderung 8) von allein — der Client braucht nur noch eine relative WebSocket-URL (`wss://wodch.g11s.cc/ws`), keine eingebackenen Keys.

---

## 5. Drei kohärente Gesamtpakete

### Paket A — „Alles im eigenen Cluster" *(Empfehlung)*

> SvelteKit (statisch, adapter-static) · eigener Sync-Dienst (Bun/Node + WebSocket, Sessions in Memory, 24-h-TTL) · beides als Container im bestehenden k8s-Cluster · GitHub Actions → ghcr wie bisher

- **Pro:** Kein Vendor-Lock-in mehr (Anlass des Rewrites), null laufende Kosten, Credentials-Problem entfällt, Infrastruktur-Know-how (k8s, Ingress, ghcr) wird weitergenutzt. Der Sync-Dienst ist bei diesem Datenmodell ~150–250 Zeilen.
- **Contra:** Man betreibt eine (kleine) Server-Komponente selbst; Sessions überleben keinen Pod-Neustart (akzeptabel bei 24-h-Wegwerf-Sessions, sonst + Redis).

### Paket B — „Serverless am Edge"

> React 19 + Vite + Zustand · Cloudflare Pages (Frontend) + Durable Objects (ein Objekt pro Session, Alarm = TTL) · CI via Actions + wrangler

- **Pro:** Kein eigener Betrieb mehr, k8s/Nginx/Docker/Registry entfallen komplett, global niedrige Latenz, Actor-pro-Session passt perfekt.
- **Contra:** Neuer Vendor-Lock-in (Cloudflare), Durable Objects erfordern den Paid-Plan, lokales Dev-Setup (`wrangler dev`) ist ein eigenes Ökosystem.

### Paket C — „Managed Backend, minimaler Eigenbau"

> SolidJS oder React · Supabase (Realtime Broadcast + Postgres-Tabelle `sessions`, Cleanup via `pg_cron`) · Frontend statisch auf Netlify/Cloudflare Pages oder weiter im k8s-Cluster

- **Pro:** Kein eigener Server-Code, SQL statt NoSQL-Baum, Supabase ist Open Source und notfalls self-hostbar (Exit-Strategie).
- **Contra:** Firebase-artige Abhängigkeit bleibt strukturell bestehen (nur netter), Late-Joiner-Logik (DB-Read + Broadcast kombinieren) ist fummeliger als bei A/B.

---

## 6. Empfehlung & Migrationshinweise

**Empfehlung: Paket A.** Begründung: Der Rewrite-Anlass ist der Firebase-Ersatz; das Session-Datenmodell (ein kleines JSON-Dokument, last-write-wins, 24-h-TTL, keine Auth) ist der einfachste denkbare Realtime-Anwendungsfall — dafür einen weiteren Cloud-Anbieter zu binden lohnt nicht, wenn bereits ein Cluster mit Ingress und CI-Pipeline existiert. SvelteKit passt zur Hochfrequenz-Timer-UI und hält das Bundle klein; wer lieber beim größten Ökosystem bleibt, tauscht es gegen React + Zustand, ohne dass sich am Rest des Pakets etwas ändert.

Unabhängig vom gewählten Paket:

### 6.1 Nebenläufigkeit (mehrere Personen am selben Link)

Die last-write-wins-Semantik steckt im Sync-Modell, nicht im Backend — Paket A verhält sich hier zunächst identisch zum Firebase-Design. Die drei Fälle im Detail:

- **Timer:** Zustandsübergänge werden als komplettes `timer`-Objekt geschrieben; konkurrierende Aktionen (A pausiert, B resettet) lösen sich sauber auf — der letzte Schreiber gewinnt, danach sind alle konsistent. **Zu beheben aus dem Alt-Design:** Heute erkennt jeder Client Phasenübergänge lokal und schreibt sie; bei N Geräten entstehen N nahezu gleichzeitige Writes mit leicht unterschiedlichem `startedAt` (Jitter). Lösung im Rewrite: Phase und Runde **nicht mehr schreiben**, sondern deterministisch aus `startedAt` + Konfiguration ableiten — beim laufenden Timer gibt es dann gar keine konkurrierenden Writes mehr.
- **Video (z. B. 10 s zurückspulen):** Konkurrierende Seeks/Pausen konvergieren per last-write-wins problemlos. Einschränkung unabhängig vom Backend: Die YouTube IFrame API hat **kein Seek-Event** (Seek im Pause-Zustand feuert nicht zuverlässig). Robuste Lösung: eigene ±10s-Buttons in der UI, die explizit einen Sync-Write auslösen, statt sich allein auf `onStateChange` der nativen Controls zu verlassen.
- **Workout-Editor — der echte Konfliktfall:** Wird das `workouts`-Objekt als Ganzes (debounced) geschrieben, überschreiben sich zwei gleichzeitig tippende Personen gegenseitig — sogar in verschiedenen Tabs. Maßnahmen:
  1. **Pfad-Granularität:** pro Feld patchen (`workouts/tabs/<id>/content`, `…/title`, `activeTab`), Tabs über `id` statt Array-Index adressieren. Der Sync-Server (eigener Code!) wendet Patches pro Session seriell an und merged — verschiedene Tabs, Umbenennen und Tab-Wechsel sind damit konfliktfrei.
  2. **Fokus-Schutz:** eingehende Remote-Updates nicht in ein gerade fokussiertes Editorfeld schreiben (puffern), sonst Cursorsprünge/Textverlust.
  3. Echtes zeichenweises Co-Editing bleibt out of scope (lt. Spec); erst wenn sich das ändert, wäre ein CRDT (z. B. Y.js nur für Tab-Inhalte) gerechtfertigt.

### 6.2 State-Haltung im Cluster (Paket A)

Der Session-State lebt im **Arbeitsspeicher des Sync-Dienstes** — das funktioniert nur mit genau einer Instanz. Konsequenzen:

- **Frontend und Sync-Dienst als getrennte Deployments:** Die statischen Assets sind zustandslos und beliebig skalierbar; das Replica-Thema betrifft nur den WebSocket-Dienst.
- **Start-Setup: `replicas: 1` + Client-Re-Seed.** Die Last ist trivial (Handvoll Sessions à wenige KB; ein Prozess hält tausende WebSocket-Verbindungen). Jeder Client hält das komplette Session-Dokument lokal — stellt er beim Reconnect fest, dass die Session serverseitig fehlt (Pod-Neustart, Deploy), schreibt er seinen Stand neu (Re-Seed). Für 24-h-Wegwerf-Sessions selbstheilend. Deployment-Strategie: `Recreate` (kurze Unterbrechung beim Deploy ist akzeptabel).
- **Ausbaupfade bei Bedarf an mehreren Replicas:**
  1. *Session-Affinität:* ingress-nginx `upstream-hash-by` auf die Session-ID pinnt alle Verbindungen einer Session auf denselben Pod — löst das Broadcast-Problem, nicht die Persistenz (Neustart/Rehashing verliert Sessions).
  2. *Redis als Backing Store (Standard-Upgrade):* Session-Dokumente in Redis (`EXPIRE 86400` erledigt die 24-h-TTL nebenbei), Broadcasts über Redis Pub/Sub → beliebig viele Replicas, verlustfreie Deploys; Preis: ein zusätzliches kleines Redis-Deployment.
- **Voraussetzung dafür:** Der Sync-Dienst kapselt seine Storage-Schicht hinter einem Interface (In-Memory-Map und Redis austauschbar) — dann ist der spätere Wechsel eine Implementierungsstunde, keine Architekturänderung.

1. **Sync-Interface zuerst:** `subscribe(sessionId, onPatch)` / `patch(sessionId, path, value)` als schmale Schicht definieren — Timer-, Video- und Workout-Sync (Anforderungen 6.3) docken daran an, das Backend bleibt austauschbar.
2. **Timer-Logik als reines TS-Modul** (kein Framework-Code) portieren — die bestehenden ~50 Vitest-Tests lassen sich dann nahezu unverändert übernehmen und sichern die Verhaltensgleichheit des Rewrites ab.
3. **YouTube IFrame API kapseln** wie bisher (Singleton + Echo-Unterdrückung) — dieser Teil ist stack-unabhängig und kann fast 1:1 übernommen werden.
4. **Reihenfolge:** Timer-Kern (Tests grün) → UI-Schale → Video → Sync-Backend → Session-Sharing. So ist die App nach jedem Schritt lauffähig.
