import { describe, it, expect } from 'vitest'
import { formatMs, formatClock } from './format'

describe('formatMs', () => {
  it('rundet Sekunden auf (ceil) im Standardformat', () => {
    expect(formatMs(1)).toBe('00:01')
    expect(formatMs(1000)).toBe('00:01')
    expect(formatMs(1001)).toBe('00:02')
    expect(formatMs(90 * 1000)).toBe('01:30')
  })

  it('zeigt Stunden ab 1h als H:MM:SS', () => {
    expect(formatMs(3600 * 1000)).toBe('1:00:00')
    expect(formatMs(3661 * 1000)).toBe('1:01:01')
  })

  it('klemmt negative Werte auf 0', () => {
    expect(formatMs(-500)).toBe('00:00')
    expect(formatMs(-500, true)).toBe('00:00.00')
  })

  it('centiseconds: floor-Sekunden + Hundertstel', () => {
    expect(formatMs(0, true)).toBe('00:00.00')
    expect(formatMs(1234, true)).toBe('00:01.23')
    expect(formatMs(61_990, true)).toBe('01:01.99')
  })
})

describe('formatClock', () => {
  const date = new Date(2026, 6, 4, 15, 7, 9)
  const morning = new Date(2026, 6, 4, 0, 30, 0)

  it('24h-Format HH:MM:SS', () => {
    expect(formatClock(date, false)).toBe('15:07:09')
  })

  it('12h-Format h:MM:SS AM/PM, Mitternacht als 12', () => {
    expect(formatClock(date, true)).toBe('3:07:09 PM')
    expect(formatClock(morning, true)).toBe('12:30:00 AM')
  })
})
