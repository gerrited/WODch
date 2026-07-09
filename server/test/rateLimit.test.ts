import { describe, it, expect } from 'vitest'
import { createRateLimiter } from '../src/rateLimit.ts'

describe('createRateLimiter', () => {
  it('erlaubt bis zum Limit und blockt danach', () => {
    let t = 0
    const rl = createRateLimiter(3, 1000, () => t)
    expect(rl.allow('a')).toBe(true)
    expect(rl.allow('a')).toBe(true)
    expect(rl.allow('a')).toBe(true)
    expect(rl.allow('a')).toBe(false)
  })

  it('zählt pro Schlüssel getrennt', () => {
    let t = 0
    const rl = createRateLimiter(1, 1000, () => t)
    expect(rl.allow('a')).toBe(true)
    expect(rl.allow('b')).toBe(true)
    expect(rl.allow('a')).toBe(false)
  })

  it('gibt Kapazität frei, sobald das Fenster verstrichen ist', () => {
    let t = 0
    const rl = createRateLimiter(1, 1000, () => t)
    expect(rl.allow('a')).toBe(true)
    expect(rl.allow('a')).toBe(false)
    t = 1001
    expect(rl.allow('a')).toBe(true)
  })
})
