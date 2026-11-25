import { describe, it, expect, beforeEach } from 'vitest'
import { KeepAwakeStore, KEEP_AWAKE_KEY } from './keepAwake.svelte'

describe('KeepAwakeStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('ist standardmäßig aus', () => {
    expect(new KeepAwakeStore().on).toBe(false)
  })

  it('merkt sich die Einstellung pro Gerät', () => {
    const a = new KeepAwakeStore()
    a.set(true)
    expect(a.on).toBe(true)
    expect(localStorage.getItem(KEEP_AWAKE_KEY)).toBe('1')
    expect(new KeepAwakeStore().on).toBe(true)

    a.set(false)
    expect(new KeepAwakeStore().on).toBe(false)
  })

  it('erkennt, ob der Browser die Wake Lock API kennt', () => {
    expect(new KeepAwakeStore({}).supported).toBe(false)
    expect(new KeepAwakeStore({ wakeLock: { request: async () => ({}) as WakeLockSentinel } }).supported).toBe(true)
  })
})
