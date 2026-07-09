export const MUTE_KEY = 'wodch-sound-muted'

// Web-Audio-Beeps + Mute-State. AudioContext wird lazy erzeugt und muss per
// unlock() aus einer User-Geste heraus entsperrt werden (Autoplay-Policy).
export class SoundStore {
  muted = $state(false)
  private ctx: AudioContext | null = null

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1'
    } catch {
      // localStorage nicht verfügbar — Standard: Ton an
    }
  }

  toggleMuted() {
    this.muted = !this.muted
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0')
    } catch {
      // localStorage nicht verfügbar — Einstellung gilt nur für die Sitzung
    }
  }

  unlock() {
    if (typeof AudioContext === 'undefined') return
    this.ctx ??= new AudioContext()
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  beepShort() {
    this.beep(150)
  }

  beepLong() {
    this.beep(700)
  }

  private beep(durationMs: number) {
    if (this.muted) return
    if (!this.ctx || this.ctx.state !== 'running') return
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = 880
    // kurze Rampen gegen Knacken an Start und Ende
    const t0 = ctx.currentTime
    const t1 = t0 + durationMs / 1000
    gain.gain.setValueAtTime(0, t0)
    gain.gain.linearRampToValueAtTime(0.3, t0 + 0.01)
    gain.gain.setValueAtTime(0.3, t1 - 0.02)
    gain.gain.linearRampToValueAtTime(0, t1)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t0)
    osc.stop(t1)
  }
}

export const sound = new SoundStore()
