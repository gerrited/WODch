import { describe, expect, it } from 'vitest'
import { activeIndexFromScroll } from './tabScroll'

describe('activeIndexFromScroll', () => {
  it('liefert 0 am linken Rand', () => {
    expect(activeIndexFromScroll(0, 375, 3)).toBe(0)
  })

  it('liefert den Index des nächstgelegenen Panels', () => {
    expect(activeIndexFromScroll(375, 375, 3)).toBe(1)
    expect(activeIndexFromScroll(750, 375, 3)).toBe(2)
  })

  it('rundet zwischen zwei Panels zum näheren', () => {
    expect(activeIndexFromScroll(150, 375, 3)).toBe(0)
    expect(activeIndexFromScroll(220, 375, 3)).toBe(1)
  })

  it('klemmt an den Rändern', () => {
    expect(activeIndexFromScroll(-50, 375, 3)).toBe(0)
    expect(activeIndexFromScroll(5000, 375, 3)).toBe(2)
  })

  it('liefert 0 bei Breite 0', () => {
    expect(activeIndexFromScroll(375, 0, 3)).toBe(0)
  })
})
