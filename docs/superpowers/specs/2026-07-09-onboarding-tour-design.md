# Onboarding-Tour — Design

**Datum:** 2026-07-09
**Status:** Entwurf genehmigt

## Ziel

Neue Nutzer sehen beim ersten Besuch eine geführte Schritt-für-Schritt-Tour, die die wichtigsten Funktionen direkt an den echten UI-Elementen erklärt: Timer setzen und starten/stoppen, Session teilen, Workout-Editor, Video-Player und Layout. Die Tour erscheint einmalig automatisch und ist danach jederzeit über einen ?-Button erneut aufrufbar.

## Umsetzung

Selbst gebaut, keine neue Dependency — passend zum dependency-armen Projekt.

### Komponenten

- **`frontend/src/lib/components/Tour.svelte`** — Overlay-Komponente, gerendert in `App.svelte`.
- **`frontend/src/lib/components/tour.ts`** — reine Logik (Schrittlisten, Weiter/Zurück/Ende, Erstbesuchsentscheidung), analog zum `barAction.ts`-Muster.
- **`frontend/src/lib/components/tour.test.ts`** — Vitest-Tests für die reine Logik.

### Spotlight-Mechanik

- Ziel-Elemente werden per `data-tour="<key>"`-Attribut markiert (nicht über CSS-Klassen-Selektoren). Vergeben werden u. a.: `timer-bar`, `gear`, `editor`, `video`, `share`, `help`.
- Ein `position: fixed` Highlight-Div wird über das Ziel-Element gelegt (Position via `getBoundingClientRect`) und dunkelt mit `box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.7)` den Rest der Seite ab.
- Die Tooltip-Karte erscheint über oder unter dem Ziel, je nachdem, wo mehr Platz ist. Inhalt: Titel, Text, Schrittanzeige („3/7“), Buttons **Zurück**, **Weiter** (letzter Schritt: **Fertig**) und **Überspringen**.
- Schritte ohne Ziel-Element (`target: null`, z. B. Willkommen) zeigen die Karte zentriert ohne Spotlight.
- Bei `resize` wird die Position neu berechnet. `Escape` bricht die Tour ab (wie Überspringen).

### Schrittdefinition

```ts
type TourStep = {
  target: string | null // data-tour-Key
  title: string
  body: string
  tab?: number // mobil: Index des Tabs, der aktiv sein muss (0 Workout, 1 Timer, 2 Video)
}
```

Zwei Schrittlisten: `desktopSteps` und `mobileSteps`. Die Auswahl folgt dem bestehenden `isMobile`-State in `App.svelte`.

### Schritte Desktop (7)

1. **Willkommen** (zentriert) — kurze Vorstellung: Timer, Workouts, Video, alles teilbar.
2. **Timer-Leiste** (`timer-bar`) — Klick = Start/Pause; im Leerlauf öffnet der Klick die Einstellungen. Tastenkürzel: `Space` Start/Pause, `R` Reset, `M` Einstellungen.
3. **Zahnrad** (`gear`) — Timer-Modi: Uhrzeit, Stoppuhr, Count-Down, Count-Up, Intervall mit Presets (Tabata, EMOM, …) und Warmup.
4. **Workout-Editor** (`editor`) — Tabs: Doppelklick zum Umbenennen, Drag & Drop zum Sortieren, freier Text.
5. **Video-Player** (`video`) — YouTube-URL einfügen, ∞-Loop, ±10s-Buttons.
6. **Session teilen** (`share`) — 📤 erzeugt einen Link; alle Geräte mit dem Link sehen alles synchron und haben volle Kontrolle. Session verfällt 24 h nach der letzten Änderung.
7. **Layout & Hilfe** (`help`) — Split-Bereiche per Ziehen der Trenner anpassbar; Tour jederzeit über den ?-Button neu startbar.

### Schritte Mobil

Gleiche Inhalte ohne Tastenkürzel- und Split-Layout-Hinweise; jeder Schritt trägt `tab`, die Tour schaltet beim Durchklicken den aktiven Tab automatisch um:

1. Willkommen (zentriert)
2. Timer-Leiste (`timer-bar`, Tab 1) — Tippen = Start/Pause bzw. Einstellungen
3. Zahnrad (`gear`, Tab 1) — Modi & Presets
4. Workout-Editor (`editor`, Tab 0) — Tabs umbenennen/sortieren
5. Video-Player (`video`, Tab 2) — YouTube-URL, Loop, ±10s
6. Session teilen (`share`, Tab 1) — Link, synchron, 24 h
7. Hilfe (`help`, Tab 1) — Tour über ?-Button neu startbar

Dafür exportiert `MobileTabs.svelte` eine Instanz-Funktion `selectTab(index)` (Svelte-5-Instanz-Export), die `App.svelte` über `bind:this` aufruft. Ein `$bindable`-Binding wäre riskant, weil `onScroll` `active` während der Scroll-Animation laufend aktualisiert und ein bidirektionales Binding damit in Konflikt geriete. Die bestehende localStorage-Persistenz des aktiven Tabs bleibt unverändert.

### Erstbesuch & Wiederaufruf

- localStorage-Flag **`wodch.tourDone`**. Nicht gesetzt → Tour startet automatisch beim Mount. Das gilt auch für Nutzer, die über einen Session-Link (`#session=…`) einsteigen.
- Das Flag wird bei **Fertig** und bei **Überspringen** gesetzt. localStorage-Zugriffe in `try/catch` (Private Mode), wie im Bestand.
- **?-Button** in der Timer-Leiste links neben dem 📤-Share-Button, gleiche dezente Optik wie das Zahnrad, mit `stopPropagation`, damit der Klick nicht den Timer togglet. Er startet die Tour jederzeit neu.

## Fehlerbehandlung

- Ziel-Element nicht im DOM (z. B. Timing): Karte wird zentriert ohne Spotlight angezeigt, die Tour bricht nicht ab.
- localStorage nicht verfügbar: Tour startet dann bei jedem Besuch — akzeptierter Fallback, kein Fehler.

## Tests

- `tour.ts`: Schrittnavigation (Weiter/Zurück, erster/letzter Schritt), Listenauswahl desktop/mobil, Erstbesuchsentscheidung aus Flag-Wert — reine Funktionen, Vitest.
- Bestehende Tests (`MobileTabs.test.ts`) werden an die `$bindable`-Prop angepasst, falls nötig.

## Nicht-Ziele

- Kein Öffnen des Timer-Modals oder der Share-UI während der Tour — es wird nur auf die Auslöser gezeigt.
- Keine Synchronisation des Tour-Zustands über die Session (Tour ist rein lokal).
- Keine i18n — Texte auf Deutsch, wie die restliche UI.
