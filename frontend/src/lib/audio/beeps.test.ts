import { describe, it, expect, beforeEach } from 'vitest'
import { SoundStore, MUTE_KEY } from './beeps.svelte'

describe('SoundStore Mute-Persistenz', () => {
  beforeEach(() => localStorage.clear())

  it('Standard: nicht stumm', () => {
    expect(new SoundStore().muted).toBe(false)
  })

  it('lädt muted aus localStorage', () => {
    localStorage.setItem(MUTE_KEY, '1')
    expect(new SoundStore().muted).toBe(true)
  })

  it('toggleMuted persistiert', () => {
    const s = new SoundStore()
    s.toggleMuted()
    expect(s.muted).toBe(true)
    expect(localStorage.getItem(MUTE_KEY)).toBe('1')
    s.toggleMuted()
    expect(localStorage.getItem(MUTE_KEY)).toBe('0')
  })

  it('beep/unlock werfen nicht ohne AudioContext (jsdom)', () => {
    const s = new SoundStore()
    expect(() => {
      s.unlock()
      s.beepShort()
      s.beepLong()
    }).not.toThrow()
  })
})
