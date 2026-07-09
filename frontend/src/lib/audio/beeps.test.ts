import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SoundStore, MUTE_KEY } from './beeps.svelte'

class FakeAudioParam {
  setValueAtTime(_value: number, _time: number) {
    return this
  }
  linearRampToValueAtTime(_value: number, _time: number) {
    return this
  }
}

class FakeGainNode {
  gain = new FakeAudioParam()
  connect(_dest: unknown) {
    return this
  }
}

class FakeOscillatorNode {
  type = ''
  frequency = new FakeAudioParam()
  connect(dest: unknown) {
    return dest
  }
  start(_when?: number) {}
  stop(_when?: number) {}
}

class FakeAudioContext {
  state: 'suspended' | 'running' = 'suspended'
  currentTime = 0
  destination = {}
  oscillatorCount = 0

  createOscillator() {
    this.oscillatorCount++
    return new FakeOscillatorNode()
  }

  createGain() {
    return new FakeGainNode()
  }

  resume() {
    // Simuliert die echte AudioContext-API: resume() liefert ein Promise,
    // das erst asynchron auflöst. state bleibt bis dahin 'suspended', damit
    // Tests die Lücke zwischen unlock() und tatsächlichem 'running' abbilden
    // können. Tests, die 'running' brauchen, setzen state danach explizit.
    return Promise.resolve()
  }
}

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

describe('SoundStore Beep-Scheduling mit gefaktem AudioContext', () => {
  let fakeCtx: FakeAudioContext

  beforeEach(() => {
    localStorage.clear()
    fakeCtx = new FakeAudioContext()
    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => fakeCtx)
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stumm: beepShort erzeugt keinen Oscillator', () => {
    const s = new SoundStore()
    s.toggleMuted() // -> muted = true
    s.unlock()
    fakeCtx.state = 'running'
    s.beepShort()
    expect(fakeCtx.oscillatorCount).toBe(0)
  })

  it('nicht stumm + entsperrt (running): beepShort erzeugt genau einen Oscillator', () => {
    const s = new SoundStore()
    s.unlock()
    fakeCtx.state = 'running'
    s.beepShort()
    expect(fakeCtx.oscillatorCount).toBe(1)
  })

  it('nicht stumm, kein unlock() / kein Context vorhanden: kein Scheduling', () => {
    const s = new SoundStore()
    // kein unlock() aufgerufen -> kein Context vorhanden
    s.beepShort()
    expect(fakeCtx.oscillatorCount).toBe(0)
  })

  it('nicht stumm, unlock() aufgerufen, Context bleibt suspended (resume() noch nicht aufgelöst): kein Scheduling', () => {
    const s = new SoundStore()
    s.unlock() // erzeugt ctx, stößt resume() an, state bleibt vorerst 'suspended'
    expect(fakeCtx.state).toBe('suspended')
    s.beepShort()
    expect(fakeCtx.oscillatorCount).toBe(0)
  })
})
