// Minimale Teilmengen von Navigator/Document — Tests reichen eigene Fakes herein.
export interface WakeLockNavigator {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinel> }
}
export interface WakeLockDocument {
  visibilityState: DocumentVisibilityState
  addEventListener(type: 'visibilitychange', cb: () => void): void
}

// Hält den Bildschirm wach, solange ein Timer läuft — ein ans Rack gelehntes
// Handy darf mitten im Workout nicht ausgehen. Der Browser gibt den Lock beim
// Verstecken des Tabs selbst frei; beim Zurückkehren wird er neu angefordert.
export class WakeLockController {
  private wanted = false
  private sentinel: WakeLockSentinel | null = null
  private requesting = false

  constructor(
    private nav: WakeLockNavigator,
    private doc: WakeLockDocument,
  ) {
    doc.addEventListener('visibilitychange', () => void this.sync())
  }

  get active(): boolean {
    return this.sentinel !== null
  }

  setWanted(wanted: boolean) {
    if (wanted === this.wanted) return
    this.wanted = wanted
    void this.sync()
  }

  private async sync() {
    if (this.wanted && !this.sentinel && !this.requesting && this.doc.visibilityState === 'visible') {
      if (!this.nav.wakeLock) return
      this.requesting = true
      try {
        const sentinel = await this.nav.wakeLock.request('screen')
        // Vom Browser freigegeben (Tab versteckt, Akku-Sparmodus) → beim nächsten sync neu anfordern
        sentinel.addEventListener('release', () => {
          if (this.sentinel === sentinel) this.sentinel = null
        })
        this.sentinel = sentinel
      } catch {
        // Verweigert (z. B. Akku-Sparmodus) — Timer läuft trotzdem, nur ohne Wake Lock
      } finally {
        this.requesting = false
      }
      // Während des Requests hat sich der Wunsch geändert → Zustand nachziehen
      if (!this.wanted) await this.sync()
    } else if (!this.wanted && this.sentinel) {
      const sentinel = this.sentinel
      this.sentinel = null
      try {
        await sentinel.release()
      } catch {
        // bereits freigegeben
      }
    }
  }
}
