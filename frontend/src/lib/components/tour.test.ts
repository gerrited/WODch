import { describe, it, expect } from 'vitest'
import { shouldAutoStart, cardPlacement, desktopSteps, mobileSteps } from './tour'

describe('shouldAutoStart', () => {
  it('startet, wenn kein Flag gesetzt ist', () => {
    expect(shouldAutoStart(null)).toBe(true)
  })

  it('startet nicht, wenn das Flag gesetzt ist', () => {
    expect(shouldAutoStart('1')).toBe(false)
  })

  it('startet bei unbekanntem Flag-Wert (defensiv)', () => {
    expect(shouldAutoStart('kaputt')).toBe(true)
  })
})

describe('cardPlacement', () => {
  it('platziert die Karte unter dem Ziel, wenn darunter mehr Platz ist', () => {
    expect(cardPlacement(50, 100, 800)).toBe('below')
  })

  it('platziert die Karte über dem Ziel, wenn darüber mehr Platz ist', () => {
    expect(cardPlacement(700, 750, 800)).toBe('above')
  })
})

describe('Schrittlisten', () => {
  it('haben beide 8 Schritte und starten zentriert (ohne Ziel)', () => {
    expect(desktopSteps).toHaveLength(8)
    expect(mobileSteps).toHaveLength(8)
    expect(desktopSteps[0].target).toBeNull()
    expect(mobileSteps[0].target).toBeNull()
  })

  it('alle weiteren Schritte haben ein Ziel', () => {
    for (const step of [...desktopSteps.slice(1), ...mobileSteps.slice(1)]) {
      expect(step.target).toBeTruthy()
    }
  })

  it('mobile Schritte mit Ziel tragen einen gültigen Tab-Index', () => {
    for (const step of mobileSteps.slice(1)) {
      expect(step.tab).toBeGreaterThanOrEqual(0)
      expect(step.tab).toBeLessThanOrEqual(2)
    }
  })

  it('desktop Schritte haben keinen Tab-Index', () => {
    for (const step of desktopSteps) {
      expect(step.tab).toBeUndefined()
    }
  })
})
