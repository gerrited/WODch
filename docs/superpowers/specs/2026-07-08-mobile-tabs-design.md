# Mobile Tab-Ansicht — Design

Datum: 2026-07-08

## Ziel

Auf Smartphones (schmale Viewports) sollen Video, Workout und Timer nicht gleichzeitig
angezeigt werden. Stattdessen gibt es drei Vollbild-Panels, die über eine Tab-Leiste am
unteren Bildschirmrand **und** per horizontalem Wischen umgeschaltet werden. Das
Desktop-Layout (SplitPane mit TimerBar oben) bleibt unverändert.

## Ansatz

Betrachtete Alternativen:

1. **Scroll-Snap-Container + Tab-Leiste (gewählt).** Ein horizontaler Container mit
   `scroll-snap-type: x mandatory` liefert natives Wischen ohne eigenen Gesten-Code.
   Tabs scrollen per `scrollTo({behavior: 'smooth'})` zum Panel; das Scroll-Event
   aktualisiert den aktiven Tab. Alle drei Panels bleiben gemountet — Video spielt
   weiter, Timer läuft weiter.
2. Nur Tabs mit `{#if}`-Umschaltung. Einfacher, aber Panels würden bei jedem Wechsel
   neu gemountet (YouTube-Player-Neustart) und Wischen fehlt.
3. Eigene Touch-Gesten (pointerdown/move) mit Transform-Animation. Mehr Kontrolle,
   aber deutlich mehr Code und Fehlerquellen als Scroll-Snap.

## Komponenten

- **`MobileTabs.svelte`** (neu): Vollbild-Layout mit Scroll-Snap-Panelbereich und
  fixer Tab-Leiste unten (Safe-Area-Padding für iOS). Drei Snippet-Props
  (`video`, `workout`, `timer`), Panel-Reihenfolge Video → Workout → Timer,
  Start-Tab: Workout (Mitte).
- **`mobileTabs.ts`** (neu): pure Funktion `activeIndexFromScroll(scrollLeft,
  viewportWidth, count)` — bestimmt den aktiven Tab aus der Scroll-Position
  (rund + geklemmt). Testbar ohne DOM.
- **`App.svelte`**: `isMobile`-State über `matchMedia('(max-width: 768px)')` mit
  Change-Listener. Mobil rendert `MobileTabs`, sonst das bestehende SplitPane-Layout.
  Timer-Panel ist die bestehende `TimerBar` in voller Höhe (skaliert dank
  Container-Queries automatisch).

## Verhalten & Randfälle

- Tab-Tap: aktiver Tab wird sofort markiert, Panel scrollt sanft heran.
- Wischen: `scroll`-Event → `activeIndexFromScroll` → Tab-Markierung folgt.
- Rotation/Resize: nach Resize wird auf den aktiven Index zurückgescrollt, damit
  kein Panel „zwischen den Snap-Punkten" hängt.
- Bekannte Einschränkung: über dem YouTube-iframe selbst greifen Touch-Gesten nicht
  (iframe schluckt Events) — Umschalten funktioniert dort über die Tab-Leiste.
- Tastatur-Shortcuts und TimerModal bleiben unverändert.

## Tests

- `mobileTabs.test.ts`: Index-Berechnung (0/1/2, Klemmen an Rändern, Breite 0).
- `MobileTabs.test.ts`: rendert drei Tabs, Tap markiert den Tab als aktiv
  (`aria-selected`).
