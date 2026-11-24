# Texte (final, Deutsch)

Alle UI-Texte des Redesigns. Texte, die nur im Mockup als Beispiel dienen, sind mit **[Beispiel]** markiert und werden in der App aus echten Daten befüllt.

## Landing-Page (`/`)

### Navigation
- Logo: W**ch** (Link auf `#top`, `aria-label="WODch Startseite"`), daneben klein `WODch`
- Links: `Features` (#features) · `So funktioniert's` (#ablauf) · `Open Source` (#open) · `GitHub ↗` (Pill-Button)

### Hero
- Eyebrow: `Timer · KI-Workouts · Fernsteuerung`
- H1: `Die Uhr für dein WOD.` — Umbruch nach „Uhr“, „WOD.“ in Lime
- Lead: `Intervall-Timer, Workout-Board und YouTube-Video auf einem Screen. Gesteuert vom Handy, synchron auf allen Geräten — ohne Account.`
- Primär-CTA: `Session starten →` (Ladezustand: `Session wird erstellt…`)
- Sekundär: `So funktioniert's` (Anker auf #ablauf)
- Hinweis: `Erzeugt sofort einen Link für dein Handy oder deine Trainingspartner.`
- Trust-Liste: `Kein Account` · `Keine Datenbank` · `Open Source` · `Offline-fähig`

### Bühne (Hero rechts)
- Kopfzeile: `wodch.com/l/k3x9q` **[Beispiel]** · `2 Geräte verbunden` **[Beispiel]**
- Tabs (Titel / Untertitel):
  - `Intervall-Timer` / `Tabata, EMOM & Co.`
  - `KI-Workouts` / `Prompt rein, WOD raus`
  - `Fernsteuerung` / `Handy steuert den Screen`
- Tab Timer: Phase `Arbeit` / `Pause`, `Tabata · Runde 3/8`, Countdown 20 s Arbeit / 10 s Pause × 8
- Tab KI: Prompt `20 Min AMRAP, Kettlebell und Klimmzugstange` **[Beispiel]** → Workout `AMRAP 20:00 / 10 Kettlebell Swings / 8 Pull-ups / 12 Goblet Squats` **[Beispiel]** → `Timer erkannt: Count-Down 20:00` · `bereit`
- Tab Fernsteuerung: Label `TV in der Box`, Bildschirm + Handy mit gleicher Zeit, gestrichelte Verbindung
- Pro Tab zusätzlich: `▶ Video ansehen` (lädt das bisherige Demo-Video in die Bühne, siehe HANDOFF.md)

### Preset-Ticker
`Tabata / EMOM / AMRAP / For Time / Fight Gone Bad / Custom`

### So funktioniert's (#ablauf)
- Eyebrow: `So funktioniert's`
- H2: `In drei Schritten vom Whiteboard auf den grossen Screen.`
- 01 `Session starten` — `Ein Klick öffnet die App auf dem Screen in der Box. Kein Login, keine Installation.`
- 02 `Link teilen` — `Öffne den Session-Link auf dem Handy. Alle Geräte mit dem Link sehen und steuern dasselbe.`
- 03 `Trainieren` — `Timer, Workout und Video laufen synchron. Starten, pausieren und Runden zählen direkt vom Handy.`

### Features (#features)
- H2: `Alles, was die Box braucht.`
- Intro: `Gebaut für Coaches und Athleten, die mitten im WOD keine Zeit für Menüs haben.`
- Gross: `Intervall-Timer mit 5 Modi` — `Uhrzeit, Stoppuhr auf die Hundertstel, Count-Down, Count-Up und Intervall — mit Presets und optionalem Warmup.` Chips: `Tabata` `Fight Gone Bad 1` `Fight Gone Bad 2` `EMOM` `Custom`
- `KI-Workouts` — `Kurzen Prompt eingeben, das Workout landet direkt im Editor. Ein Klick stellt den passenden Timer ein.`
- `Fernsteuerung per Link` — `Handy steuert den Screen. Alle Geräte haben volle Kontrolle — kein Host, kein Pairing.`
- `Workout-Board` — `Mehrere Tabs für Warmup, WOD und Cooldown. Umbenennen per Doppelklick, sortieren per Drag & Drop.`
- `Video daneben` — `YouTube-Link einfügen für Technik-Demos oder Musik. Endlos-Loop und ±10-Sekunden-Sprünge.`
- `Ansagen & Vibration` — `„Los“, „Runde 3“, „Noch zehn Sekunden“ — pro Gerät zuschaltbar. Das Display bleibt an, solange der Timer läuft.`
- `Läuft auch offline` — `Als PWA installierbar. Timer und Editor starten auch ohne Netz — wenn das WLAN in der Box mal streikt.`

### Tastatur-Band
- `Hände voller Kreide?` — `Klick auf die Timer-Leiste genügt. Oder per Tastatur:`
- `Space` Start / Pause · `R` Reset · `M` Einstellungen · `+ / −` Runden zählen

### Open Source (#open)
- Eyebrow: `Privat by Design`
- H2: `Kein Cloud-Konto. Keine Datenbank.`
- Text: `Sessions leben nur im Arbeitsspeicher des Sync-Servers und verfallen 24 Stunden nach der letzten Änderung. Der Code ist offen — unter MIT-Lizenz.`
- Button: `Code auf GitHub ansehen`
- Kennzahlen: `0` Accounts oder Logins · `24h` bis eine Session verfällt · `5` Timer-Modi · `MIT` Open-Source-Lizenz

### Schluss-CTA
- Deko: `3·2·1`
- H2: `Bereit? Los.` („Los.“ in Lime)
- Text: `Session starten, Link aufs Handy, Kreide an die Hände.`
- Button: `Jetzt starten →`

### Footer
- `© 2026 WODch — MIT-Lizenz` · `Datenschutz` · `Impressum` · `GitHub`

## App (`/l/<id>`)
- Verbindungs-Pill: `{n} Geräte` (wie bisher erst ab 2)
- Phasen-Label über der Zeit, Beispiele: `EMOM · Minute 4 · Station 1`, `Tabata · Runde 3/8`, `Pause`, `Warmup`, pausiert: `Pausiert — tippen zum Fortsetzen`
- Rundenzähler: Label `Runde`, Buttons `−` (`aria-label="Runde abziehen"`) / `+` (`aria-label="Runde zählen"`)
- Aktionen: Ton, Timer-Einstellungen, `Teilen` (mit Text), Hilfe `?` (bleibt)
- Editor-Toolbar: `Generieren` (KI-Workout), `Timer aus Workout` (⏱▶ /timerize)
- Video-Toolbar: URL-Feld, `−10s`, `+10s`, Loop-Toggle (aktiv = Lime-Tint)
- Video leer: `YouTube-Link einfügen — Technik-Demo oder Playlist`

## Handy-Fernbedienung (neue Mobile-Ansicht)
- Pill: `Verbunden · {n} Geräte`
- Unter der Zeit: `Läuft synchron auf dem Screen in der Box`
- Buttons: `Reset` · `Start` / `Pause` · `Modus`
- Rundenzähler: Label `Runden`
- `Schnellstart`: `EMOM` `Tabata` `Count-Down` `For Time`
- Fuss: `Session-Link` + `Kopieren`
