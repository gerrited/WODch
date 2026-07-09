// Schrittdefinitionen und reine Logik der Onboarding-Tour
export type TourStep = {
  target: string | null // data-tour-Key des Ziel-Elements, null = zentrierte Karte
  title: string
  body: string
  tab?: number // mobil: Tab, der für diesen Schritt aktiv sein muss (0 Workout, 1 Timer, 2 Video)
}

// Tour automatisch starten, solange sie nie abgeschlossen/übersprungen wurde
export function shouldAutoStart(flag: string | null): boolean {
  return flag !== '1'
}

// Karte auf die Seite des Ziels mit mehr Platz legen
export function cardPlacement(
  rectTop: number,
  rectBottom: number,
  viewportHeight: number
): 'above' | 'below' {
  return viewportHeight - rectBottom >= rectTop ? 'below' : 'above'
}

export const desktopSteps: TourStep[] = [
  {
    target: null,
    title: 'Willkommen bei WODch',
    body: 'Intervall-Timer, Workout-Editor und Video-Player in einem Layout — alles per Link mit anderen Geräten teilbar. Die wichtigsten Funktionen in einer kurzen Tour.',
  },
  {
    target: 'timer-bar',
    title: 'Timer',
    body: 'Ein Klick auf die Leiste startet und pausiert den Timer. Solange nichts läuft, öffnet der Klick die Einstellungen. Tastenkürzel: Space Start/Pause, R Reset, M Einstellungen.',
  },
  {
    target: 'gear',
    title: 'Timer-Modi',
    body: 'Hier findest du alle Modi: Uhrzeit, Stoppuhr, Count-Down, Count-Up und Intervall mit Presets wie Tabata oder EMOM — optional mit Warmup.',
  },
  {
    target: 'editor',
    title: 'Workouts',
    body: 'Freier Text für dein Workout. Mehrere Tabs: Doppelklick benennt um, Ziehen sortiert.',
  },
  {
    target: 'ai-generate',
    title: 'Workout per AI',
    body: 'Der ✨-Button öffnet einen kleinen Dialog: Beschreibe kurz, was du willst — die AI erstellt daraus ein Workout und schreibt es in den aktiven Tab.',
  },
  {
    target: 'video',
    title: 'Video',
    body: 'YouTube-URL einfügen und das Video läuft — mit ∞-Loop und ±10s-Buttons.',
  },
  {
    target: 'share',
    title: 'Session teilen',
    body: 'Erzeugt einen Link. Alle Geräte mit dem Link sehen Timer, Workouts und Video synchron und können alles steuern. Die Session verfällt 24 h nach der letzten Änderung.',
  },
  {
    target: 'help',
    title: 'Noch was',
    body: 'Die Bereiche lassen sich an den Trennlinien ziehen. Diese Tour startest du jederzeit über den ?-Button neu.',
  },
]

export const mobileSteps: TourStep[] = [
  {
    target: null,
    title: 'Willkommen bei WODch',
    body: 'Intervall-Timer, Workout-Editor und Video-Player — alles per Link mit anderen Geräten teilbar. Die wichtigsten Funktionen in einer kurzen Tour.',
  },
  {
    target: 'timer-bar',
    tab: 1,
    title: 'Timer',
    body: 'Tippen startet und pausiert den Timer. Solange nichts läuft, öffnet das Tippen die Einstellungen.',
  },
  {
    target: 'gear',
    tab: 1,
    title: 'Timer-Modi',
    body: 'Hier findest du alle Modi: Uhrzeit, Stoppuhr, Count-Down, Count-Up und Intervall mit Presets wie Tabata oder EMOM — optional mit Warmup.',
  },
  {
    target: 'editor',
    tab: 0,
    title: 'Workouts',
    body: 'Freier Text für dein Workout. Mehrere Tabs: Doppeltippen benennt um, Ziehen sortiert.',
  },
  {
    target: 'ai-generate',
    tab: 0,
    title: 'Workout per AI',
    body: 'Der ✨-Button öffnet einen kleinen Dialog: Beschreibe kurz, was du willst — die AI erstellt daraus ein Workout und schreibt es in den aktiven Tab.',
  },
  {
    target: 'video',
    tab: 2,
    title: 'Video',
    body: 'YouTube-URL einfügen und das Video läuft — mit ∞-Loop und ±10s-Buttons.',
  },
  {
    target: 'share',
    tab: 1,
    title: 'Session teilen',
    body: 'Erzeugt einen Link. Alle Geräte mit dem Link sehen Timer, Workouts und Video synchron und können alles steuern. Die Session verfällt 24 h nach der letzten Änderung.',
  },
  {
    target: 'help',
    tab: 1,
    title: 'Noch was',
    body: 'Diese Tour startest du jederzeit über den ?-Button neu.',
  },
]
