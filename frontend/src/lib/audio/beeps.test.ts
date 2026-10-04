import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SoundStore, MUTE_KEY, VOICE_KEY, VIBRATE_KEY } from './beeps.svelte'

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

describe('SoundStore Sprachansagen und Vibration', () => {
  let spoken: { text: string; lang: string }[]
  let vibrations: number[]

  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    spoken = []
    vibrations = []
    class FakeUtterance {
      lang = ''
      constructor(public text: string) {}
    }
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
    vi.stubGlobal('speechSynthesis', {
      speak: (u: FakeUtterance) => spoken.push({ text: u.text, lang: u.lang }),
      cancel: () => {},
    })
    vi.stubGlobal('navigator', { vibrate: (ms: number) => (vibrations.push(ms), true) })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('Standard: Sprache und Vibration aus — nichts passiert', () => {
    const s = new SoundStore()
    s.speak('Los')
    s.buzz(100)
    vi.runAllTimers()
    expect(spoken).toEqual([])
    expect(vibrations).toEqual([])
  })

  it('Einstellungen werden persistiert und geladen', () => {
    const s = new SoundStore()
    s.setVoice(true)
    s.setVibrate(true)
    expect(localStorage.getItem(VOICE_KEY)).toBe('1')
    expect(localStorage.getItem(VIBRATE_KEY)).toBe('1')
    const reloaded = new SoundStore()
    expect(reloaded.voice).toBe(true)
    expect(reloaded.vibrate).toBe(true)
  })

  it('spricht deutsch nach dem Beep; Einschalten entsperrt einmalig mit leerer Äußerung', () => {
    const s = new SoundStore()
    s.setVoice(true)
    expect(spoken).toEqual([{ text: '', lang: '' }])
    s.speak('Runde 2')
    expect(spoken).toHaveLength(1)
    vi.advanceTimersByTime(700)
    expect(spoken[1]).toEqual({ text: 'Runde 2', lang: 'de-DE' })
  })

  it('stumm unterdrückt auch Sprache, aber nicht die Vibration', () => {
    const s = new SoundStore()
    s.setVoice(true)
    s.setVibrate(true)
    s.toggleMuted()
    s.speak('Los')
    s.buzz(400)
    vi.runAllTimers()
    expect(spoken.map((u) => u.text)).toEqual([''])
    expect(vibrations).toEqual([400])
  })
})
