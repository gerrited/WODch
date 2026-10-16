// Spiegelt SESSION_DOC_LIMITS.maxRoundCounter im Server — darüber verwirft er den Patch.
export const MAX_ROUND_COUNTER = 9999

// Gemeinsamer Rundenzähler (z. B. für AMRAPs): ein Tipp auf + zählt für alle Geräte.
// Übertragen wird der absolute Wert (last-write-wins wie beim Rest des Docs).
export class CounterStore {
  count = $state(0)

  // Vom Session-Layer gesetzt; feuert nur bei lokalen Aktionen (nie bei applyRemote)
  onChange?: (count: number) => void

  private set(n: number) {
    const next = Math.min(MAX_ROUND_COUNTER, Math.max(0, n))
    if (next === this.count) return
    this.count = next
    this.onChange?.(next)
  }

  increment() {
    this.set(this.count + 1)
  }

  decrement() {
    this.set(this.count - 1)
  }

  reset() {
    this.set(0)
  }

  applyRemote(count: number | undefined) {
    // Ältere Sessions ohne roundCounter liefern undefined
    this.count = Number.isInteger(count) ? (count as number) : 0
  }
}

export const counter = new CounterStore()
