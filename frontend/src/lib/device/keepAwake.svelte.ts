import type { WakeLockNavigator } from './wakeLock'

export const KEEP_AWAKE_KEY = 'wodch-keep-awake'

// Display dauerhaft wach halten, auch ohne laufenden Timer: etwa wenn auf dem TV
// in der Box nur das Workout-Board steht. Gerätelokal und nie synchronisiert,
// denn ob ein Display anbleiben soll, entscheidet jedes Gerät für sich.
export class KeepAwakeStore {
  // Standard: an. In der Box soll das Display nicht ausgehen, ohne dass vorher
  // jemand etwas einstellen muss. Nur ein ausdrückliches Ausschalten wird gemerkt.
  on = $state(true)

  constructor(private nav: WakeLockNavigator = typeof navigator !== 'undefined' ? navigator : {}) {
    try {
      this.on = localStorage.getItem(KEEP_AWAKE_KEY) !== '0'
    } catch {
      // localStorage nicht verfügbar, Standard bleibt an
    }
  }

  // Ohne Wake Lock API (ältere Browser) blenden wir den Schalter aus, statt
  // etwas anzubieten, das nicht wirkt
  get supported(): boolean {
    return this.nav.wakeLock !== undefined
  }

  set(on: boolean) {
    this.on = on
    try {
      localStorage.setItem(KEEP_AWAKE_KEY, on ? '1' : '0')
    } catch {
      // localStorage nicht verfügbar, Einstellung gilt nur bis zum Neuladen
    }
  }
}

export const keepAwake = new KeepAwakeStore()
