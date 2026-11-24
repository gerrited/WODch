# WODch Redesign — Übergabe an Claude Code

> Ziel: Das bestehende Frontend (`frontend/`, Svelte 5) bekommt einen neuen visuellen Auftritt.
> **Nur Präsentationsschicht.** Sync-Modell, Stores, Wire-Format, Server und Timer-Logik bleiben unverändert.

## 1. Paketinhalt

| Pfad | Zweck |
|---|---|
| `HANDOFF.md` | Dieses Briefing: Entscheidungen, Umsetzungsplan pro Komponente, Abnahmekriterien |
| `tokens.css` | Neue Design-Tokens — ersetzt den `:root`-Block in `frontend/src/app.css` |
| `copy.md` | Alle finalen UI-Texte (Deutsch) |
| `screenshots/*.png` | Referenzbilder: Landing (Desktop/Mobil), App (Desktop/Mobil), Handy-Fernbedienung |
| `mockups/Main.html`, `App.html`, `Remote.html` | Klickbare Referenz-Mockups. Im Browser öffnen (`preview-runtime.js` daneben). Alle Masse, Farben und Abstände stehen als Inline-Styles im Markup — **das ist die Quelle der Wahrheit für Details**. |

Die Mockups sind kein Produktivcode: kein Svelte, Inline-Styles, eigene Mini-Runtime. Übernimm Werte und Struktur, nicht das Markup 1:1. Im Projekt gilt weiter: scoped `<style>`-Blöcke in den `.svelte`-Dateien, CSS-Variablen aus `app.css`.

## 2. Design-Richtung in einem Satz

**„Anzeigetafel in der Box“:** fast schwarzer Grund, grosse Timer-Ziffern in JetBrains Mono, Überschriften in Barlow Condensed (immer *italic 900, uppercase* — greift das kursive W**ch**-Logo auf), Fliesstext in Inter. Lime `#a8d129` heisst **Arbeit/Aktion**, Orange `#ff9f43` heisst **Pause/pausiert**. Keine Verläufe, keine Schatten ausser der Bühne, keine Emojis — Icons sind Inline-SVGs mit `stroke="currentColor"`, Strichstärke 2.

## 3. Feste Entscheidungen

1. **Schriften selbst hosten.** Die CSP in `frontend/nginx.conf` (`default-src 'self'`) blockiert Google Fonts, und ein Fremd-CDN passt nicht zum „Privat by Design“-Versprechen. Also:
   `npm install @fontsource/barlow-condensed @fontsource/inter @fontsource/jetbrains-mono` und in `main.ts` nur die genutzten Schnitte importieren:
   - Barlow Condensed: `800-italic`, `900-italic`
   - Inter: `400`, `500`, `600`
   - JetBrains Mono: `500`, `700`, `800`
   CSP nicht anfassen. Vite legt die Font-Dateien unter `/assets/` ab, und `public/sw.js` cacht `/assets/` bereits cache-first. Prüfen, dass die Fonts nach dem ersten Laden offline verfügbar sind (und nicht durch `MAX_ASSETS` sofort wieder herausfallen).
2. **Logo:** `Logo.svelte` behält Form und Farben (weisses W, Lime „ch“), nutzt aber `font-family: var(--font-display)` statt `inherit`.
3. **Hero-Bühne ohne Autoload-Video.** Die Bühne zeigt standardmässig eine *Live-Demo* in Svelte (siehe §5.1), kein IFrame. Pro Tab gibt es einen Button `▶ Video ansehen`, der *dann* das bisherige Demo-Video (`youtube-nocookie`) in der Bühne lädt. Regel bleibt: nie mehr als ein IFrame gleichzeitig. Die drei Video-URLs aus `LandingPage.svelte` bleiben erhalten.
4. **Die Landing-Demo nutzt NICHT die echten Stores** (`timer`, `session`, `counter`). Sie tickt lokal mit eigenem `setInterval` (in `$effect` mit Cleanup), damit auf `/` keine Session- oder Sync-Seiteneffekte entstehen. Bei `prefers-reduced-motion: reduce` steht die Demo still (statische Zeit `00:15`).
5. **Handy-Fernbedienung = neuer Inhalt des Mobile-Tabs „Timer“** in `MobileTabs.svelte`. Sie nutzt ausschliesslich vorhandene APIs: `timer.toggle()`, `timer.reset()`, `timer.applyPreset()` / `timer.setMode()`, `counter`, `session.peers`. **Keine neuen Sync-Felder** — siehe AGENTS.md, Fallstrick 1.
6. **Texte** kommen aus `copy.md`. Sprache Deutsch, Schweizer Schreibweise „ss“ wie im Mockup ist **nicht** Pflicht — das Repo nutzt „ß“ (z. B. „großes Video“ in den Tests). **Bleib bei der Schreibweise des Repos (ß)** und passe Texte aus `copy.md` entsprechend an („großen Screen“, „Größe“).

## 4. Reihenfolge (je Schritt: `npm test` + `npm run build` in `frontend/` grün)

1. **Fundament:** `tokens.css` → `app.css`; Fonts installieren und importieren; Basis-Typo (`body` = `--font-ui`; Mono nur dort, wo heute bewusst Mono ist: Timer, Editor-Text, Labels/Eyebrows).
2. **Landing-Page** (`LandingPage.svelte`) neu aufbauen — §5.1.
3. **Timer-Leiste** (`TimerBar.svelte`) — §5.2.
4. **Editor & Video** (`WorkoutEditor.svelte`, `VideoPlayer.svelte`, `SplitPane.svelte`) — §5.3.
5. **Mobile:** `MobileTabs.svelte` + neue Fernbedienung — §5.4.
6. **Dialoge angleichen:** `TimerModal`, `ShareModal`, `GenerateDialog`, `ConfirmDialog`, `LegalModal`, `Tour` — nur Tokens/Typo/Buttons übernehmen (§5.5), kein Umbau der Logik.
7. **Tests nachziehen** (§6), danach Sichtprüfung gegen `screenshots/`.

## 5. Umsetzung pro Bereich

### 5.1 Landing-Page — Referenz `mockups/Main.html`, `screenshots/landing-*.png`

Aufbau von oben nach unten (Container `max-width: 1200px`, Seitenrand 24px):

| Abschnitt | Kernpunkte |
|---|---|
| Nav | Logo + kleines `WODch`, Links Features / So funktioniert's / Open Source, GitHub-Pill. **Mobil (<640px): nur Logo + GitHub**, Anker-Links ausblenden (im Mockup brechen sie um — das ist nicht gewollt). |
| Hero | 2 Spalten (`grid`, `repeat(auto-fit, minmax(min(100%,440px),1fr))`, gap 56px). Links Eyebrow, H1 `--fs-hero`, Lead, CTA-Paar, Hinweis, Trust-Liste mit Lime-Punkten. Rechts Bühne. |
| Bühne | Karte `--surface`, Rand `#26262b`, Radius 18px, Schatten `0 40px 80px -30px rgba(0,0,0,.8)`. Kopfzeile (pulsierender Punkt, Beispiel-Link, „2 Geräte verbunden“). Inhalt pro Tab (min-height 340px). Unten 3 Tabs als Raster; aktiver Tab: 2px Lime-Linie oben + `--surface-hover`. |
| Bühne · Timer | Tabata 20 s Arbeit / 10 s Pause × 8. Phase-Label + „Tabata · Runde n/8“, Ziffern `clamp(88px,13vw,150px)` JetBrains Mono 800 in Phasenfarbe, Fortschrittsbalken 8px, darunter 8 Runden-Segmente (fertig = Lime, laufend = `--round-current`, offen = `--line`). |
| Bühne · KI | Prompt-Feld (Sparkle-Icon), generiertes Workout zentriert in Mono, Hinweisleiste „Timer erkannt: Count-Down 20:00 · bereit“ im Lime-Tint. Rein statisch. |
| Bühne · Fernsteuerung | Bildschirm-Rahmen („TV in der Box“) + Handy-Rahmen mit derselben laufenden Zeit, gestrichelte Lime-Linie dazwischen. |
| Preset-Ticker | Band `--bg-band`, Begriffe in Display-Schrift 26px `--text-ghost`, Lime-Schrägstriche als Trenner. Statisch, kein Marquee. |
| So funktioniert's | Eyebrow, H2, 3 Schritte im Auto-Fit-Raster; Nummern `01–03` Mono 800 44px; Schritt 1 mit Lime-Linie oben, die anderen `--line-strong`. |
| Features | H2 + Intro rechts. Grosse Karte „Intervall-Timer mit 5 Modi“ mit Preset-Chips, darunter 6 Karten im Raster mit 1px-Fugen (`gap:1px` auf `--line`-Hintergrund). |
| Tastatur-Band | Umrandete Box, `<kbd>` mit 3px Unterkante. |
| Open Source | Band `--bg-band`, links Text + GitHub-Button, rechts 2×2-Kennzahlen. |
| Schluss-CTA | Dekoratives `3·2·1` in `--line-soft` (aria-hidden), H2 „Bereit? Los.“, Primär-Button. |
| Footer | Logo, Copyright, Datenschutz/Impressum (öffnen weiterhin `LegalModal`), GitHub. |

Verhalten, das erhalten bleiben muss: beide Primär-Buttons rufen `start()` auf (`session.create()` → `router.sync()`), Ladezustand „Session wird erstellt…“, `disabled` während `starting`; Legal-Modals; `.aurora` entfällt ersatzlos.

### 5.2 Timer-Leiste — Referenz `mockups/App.html`, `screenshots/app-desktop.png`

- Hintergrund `--bg-band`, unten ein **4px-Fortschrittsbalken** über die volle Breite in Phasenfarbe (Fortschritt der aktuellen Phase bzw. Minute; Wert aus `timer.derived` ableiten, nicht streamen).
- Mitte: **Phasen-Label** über der Zeit (Mono 12px, uppercase, `letter-spacing:.2em`, Phasenfarbe) — z. B. `EMOM · Minute 4`, `Tabata · Runde 3/8`, `Warmup`, `Pause`. Pausiert: Label `Pausiert — tippen zum Fortsetzen` in Orange, Ziffern in `--text-faint`. Die Ziffern behalten die bestehende `container-query`-Skalierung (`cqh/cqw`) und `tabular-nums`.
- Links: Logo + Verbindungs-Pill (Punkt pulsiert nur bei „verbunden“; vorhandene `dotClass`-Logik beibehalten).
- Rechts: Rundenzähler als **Segmentgruppe** `[−] Runde n [+]`, „+“ gefüllt in Lime; danach Icon-Buttons Ton, Einstellungen, `Teilen` (Button **mit Text**), `?`. Alle Ziele ≥ 44px.
- Bestehende `data-tour`-Attribute, `aria-label`s, Tastatur-Shortcuts und der Klick-auf-Leiste-Mechanismus (`barAction.ts`) bleiben unverändert.
- `warmup`-Phase bekommt eine eigene Farbe: `--text-muted` für Label, Ziffern `--text`.

### 5.3 Editor & Video

- **Tabs:** Mono 13px, inaktiv `--text-faint`, aktiv `--text` 700 mit 2px Lime-Unterstrich; `+` als 44px-Iconbutton. Doppelklick-Umbenennen und Drag & Drop unverändert.
- **Editor-Aktionen rechts in der Tab-Zeile:** `Generieren` (Rahmen-Button, Lime-Sparkle-Icon) und `Timer aus Workout` (Lime-Tint-Button). Beide mit sichtbarem Text statt nur Icon.
- **Editor-Text:** bleibt zentrierter Mono-Text (es ist Freitext — keine Strukturierung einführen). Nur Farbe/Zeilenhöhe an Tokens anpassen. Die Display-Schrift-Überschrift im Mockup („EMOM 12“) ist Illustration, kein Feature.
- **Video-Toolbar:** URL-Input `--surface-2` mit Radius 8px und Label (visuell versteckt), Buttons `−10s` / `+10s` als Rahmen-Buttons, Loop als Toggle (`aria-pressed`, aktiv = Lime-Tint).
- **Leerer Video-Zustand:** gestrichelter Rahmen, runder Play-Kreis, Text „YouTube-Link einfügen — Technik-Demo oder Playlist“.
- **SplitPane:** Griff als 1px `--line`, Hover `--accent`.

### 5.4 Mobile — Referenz `mockups/Remote.html`, `screenshots/remote-mobile.png`, `screenshots/app-mobile.png`

- `MobileTabs` behält Workout / Timer / Video. Tab-Leiste im neuen Stil (Mono, Lime-Unterstrich).
- **Tab „Timer“ = Fernbedienung:** grosse Zeitkarte (Phasen-Label, Ziffern 84px, Fortschrittsbalken, Hinweis „Läuft synchron auf dem Screen in der Box“), darunter 3 grosse Buttons (88px hoch): `Reset` · `Start/Pause` (Lime, pausiert Orange) · `Modus` (öffnet `TimerModal`), dann Rundenzähler mit 64px-Buttons, dann `Schnellstart`-Chips (EMOM, Tabata, Count-Down, For Time → bestehende Preset-/Mode-APIs; For Time = Count-Up), unten Session-Link mit `Kopieren` (gleiche Logik wie `ShareModal`).
- Die bisherige mobile Timer-Darstellung (`TimerBar` im Tab) wird dadurch ersetzt. Empfehlung: Reset bei laufendem Timer kurz bestätigen lassen (vorhandenen `ConfirmDialog` aus dem Editor wiederverwenden), weil der grosse Button mit dem Daumen leicht getroffen wird.

### 5.5 Dialoge

Overlay `rgba(0,0,0,.7)`, Panel `--surface`, Rand `--line-strong`, Radius 16px. Titel in Inter 600 20px (keine Display-Schrift in Dialogen). Primär-Button Lime mit `--accent-ink`, Sekundär umrandet. Preset-Auswahl im `TimerModal` als Chips im Lime-Tint-Stil (wie Feature-Karte „Intervall-Timer“).

## 6. Tests

Bestehende Tests beschreiben teilweise das alte Layout. Anpassen, **ohne Verhalten zu verlieren**:

- `LandingPage.test.ts`
  - H1 ist nicht mehr „WODch“ → prüfen, dass `h1` „Die Uhr“ enthält und der Produktname im Logo-`aria-label` steht.
  - `.cta` → Text „Session starten“ (Hero) bzw. „Jetzt starten“ (Schluss) — beide starten eine Session.
  - „genau ein großes Video“ → neu: **ohne Klick kein IFrame**; nach `▶ Video ansehen` genau ein IFrame mit der URL des aktiven Tabs; Tab-Wechsel wechselt Demo bzw. Video, nie zwei IFrames.
  - Feature-Überschriften: neue Liste aus `copy.md`.
  - Legal-Modals: unverändert.
- Neue Tests: Fernbedienung (`toggle`/`reset`/Runden/Schnellstart rufen die richtigen Store-Methoden), reduzierte Bewegung stoppt die Landing-Demo.
- `Tour`-Schritte (`tour.ts`) zeigen auf `data-tour`-Selektoren — prüfen, dass alle Ziele nach dem Umbau noch existieren, auch mobil.

## 7. Abnahmekriterien

- [ ] `npm test` und `npm run build` in `frontend/` grün; Server unverändert.
- [ ] Keine Änderungen an `lib/types.ts`, `lib/sync/*`, `lib/stores/*` (ausser rein additiven Getters für Anzeige-Werte, falls nötig), `server/`.
- [ ] Keine externen Requests ausser YouTube nach Klick; CSP unverändert; Fonts offline verfügbar.
- [ ] Landing und App bei 1440px, 1024px, 768px, 390px ohne horizontales Scrollen; Nav mobil reduziert.
- [ ] Kontrast: Text ≥ 4.5:1 (die Tokens sind darauf ausgelegt — `--text-ghost` nur für Dekor/grosse Schrift).
- [ ] Alle Bedienelemente ≥ 44px, echte `<button>`/`<a>`, `aria-label` bei Icon-Buttons, sichtbarer Fokus (`outline: 2px solid var(--accent); outline-offset: 2px`).
- [ ] `prefers-reduced-motion`: Puls-Punkt, Fortschritts-Transitions und Landing-Demo ruhig.
- [ ] Visuell deckungsgleich mit `screenshots/` (Beispieldaten ausgenommen).

## 8. Nicht im Scope

Neue Features oder Sync-Felder, Änderungen an KI-Endpunkten, Umbenennung von Routen, Light-Mode, Marketing-Videos neu produzieren. Beispielinhalte der Mockups (Session-ID `k3x9q`, Workouts, „2 Geräte“) sind Platzhalter.
