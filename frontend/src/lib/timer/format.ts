function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatMs(ms: number, centiseconds = false): string {
  const clamped = Math.max(0, ms)
  if (centiseconds) {
    const totalSec = Math.floor(clamped / 1000)
    const cs = Math.floor((clamped % 1000) / 10)
    const sec = totalSec % 60
    const min = Math.floor(totalSec / 60) % 60
    return `${pad(min)}:${pad(sec)}.${pad(cs)}`
  }
  const totalSec = Math.ceil(clamped / 1000)
  const sec = totalSec % 60
  const min = Math.floor(totalSec / 60) % 60
  const hrs = Math.floor(totalSec / 3600)
  if (hrs > 0) return `${hrs}:${pad(min)}:${pad(sec)}`
  return `${pad(min)}:${pad(sec)}`
}

export function formatClock(date: Date, is12h: boolean): string {
  const h = date.getHours()
  const m = date.getMinutes()
  const s = date.getSeconds()
  if (is12h) {
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 || 12
    return `${h12}:${pad(m)}:${pad(s)} ${ampm}`
  }
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}
