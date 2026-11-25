import { describe, it, expect, beforeEach } from 'vitest'
import { KeepAwakeStore, KEEP_AWAKE_KEY } from './keepAwake.svelte'

describe('KeepAwakeStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('ist standardmäßig an', () => {
    expect(new KeepAwakeStore().on).toBe(true)
  })

  it('merkt sich die Einstellung pro Gerät', () => {
    const a = new KeepAwakeStore()
    a.set(false)
    expect(a.on).toBe(false)
    expect(localStorage.getItem(KEEP_AWAKE_KEY)).toBe('0')
    expect(new KeepAwakeStore().on).toBe(false)

    a.set(true)
    expect(new KeepAwakeStore().on).toBe(true)
  })

  it('erkennt, ob der Browser die Wake Lock API kennt', () => {
    expect(new KeepAwakeStore({}).supported).toBe(false)
    expect(new KeepAwakeStore({ wakeLock: { request: async () => ({}) as WakeLockSentinel } }).supported).toBe(true)
  })
})
