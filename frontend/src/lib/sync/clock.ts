// Gemeinsame Zeitbasis für synchronisierte Timestamps (Timer, Video).
// Der Versatz zur Server-Uhr wird beim Verbinden per ping/pong gemessen —
// alle geteilten startedAt-Werte stehen in Server-Zeit, damit Geräte mit
// abweichender Systemuhr nicht auseinanderlaufen.
let offsetMs = 0

export function setClockOffset(ms: number): void {
  offsetMs = ms
}

export function clockOffset(): number {
  return offsetMs
}

export function syncedNow(): number {
  return Date.now() + offsetMs
}
