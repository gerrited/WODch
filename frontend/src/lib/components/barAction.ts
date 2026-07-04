import type { TimerDoc } from '../types'
import type { Derived } from '../timer/engine'

// Klick auf die Timer-Leiste: Modal im Clock-Modus und im Idle-/Fertig-Zustand, sonst Start/Pause
export function barAction(doc: TimerDoc, derived: Derived, elapsed: number): 'modal' | 'toggle' {
  if (doc.mode === 'clock') return 'modal'
  if (doc.mode === 'interval') {
    return derived.phase === 'idle' || derived.phase === 'done' ? 'modal' : 'toggle'
  }
  if (doc.mode === 'countdown' && elapsed >= doc.countdownTarget) return 'modal'
  const started = doc.isRunning || doc.accumulatedMs > 0
  return started ? 'toggle' : 'modal'
}
