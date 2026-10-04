export const MUTE_KEY = 'wodch-sound-muted'
export const VOICE_KEY = 'wodch-voice'
export const VIBRATE_KEY = 'wodch-vibrate'

// Die Ansage folgt erst nach dem langen Beep, sonst überdeckt der Ton die Sprache.
const SPEECH_DELAY_MS = 700

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    // localStorage nicht verfügbar — Standard: aus
    return false
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    // localStorage nicht verfügbar — Einstellung gilt nur für die Sitzung
  }
}

// Web-Audio-Beeps, Sprachansagen, Vibration + deren Einstellungen. Alles ist
// gerätelokal (nie synchronisiert): jedes Gerät entscheidet selbst, ob es spricht.
// AudioContext wird lazy erzeugt und muss per unlock() aus einer User-Geste
// heraus entsperrt werden (Autoplay-Policy).
export class SoundStore {
  muted = $state(false)
  voice = $state(false)
  vibrate = $state(false)
  private ctx: AudioContext | null = null
  private speechUnlocked = false
  private speechTimer: ReturnType<typeof setTimeout> | undefined

  constructor() {
    this.muted = readFlag(MUTE_KEY)
    this.voice = readFlag(VOICE_KEY)
    this.vibrate = readFlag(VIBRATE_KEY)
  }

  toggleMuted() {
    this.muted = !this.muted
    writeFlag(MUTE_KEY, this.muted)
  }

  setVoice(on: boolean) {
    this.voice = on
    writeFlag(VOICE_KEY, on)
    if (on) this.unlockSpeech()
  }

  setVibrate(on: boolean) {
    this.vibrate = on
    writeFlag(VIBRATE_KEY, on)
  }

  get canVibrate(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
  }

  get canSpeak(): boolean {
    return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined'
  }

  unlock() {
    if (this.voice) this.unlockSpeech()
    if (typeof AudioContext === 'undefined') return
    this.ctx ??= new AudioContext()
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  // iOS spricht nur, wenn die erste Äußerung aus einer User-Geste kommt — eine
  // leere Äußerung schaltet die Sprachausgabe für spätere Ansagen frei.
  private unlockSpeech() {
    if (this.speechUnlocked || !this.canSpeak) return
    this.speechUnlocked = true
    speechSynthesis.speak(new SpeechSynthesisUtterance(''))
  }

  speak(text: string) {
    if (this.muted || !this.voice || !this.canSpeak) return
    clearTimeout(this.speechTimer)
    this.speechTimer = setTimeout(() => {
      // Veraltete Ansagen (z. B. nach Tab im Hintergrund) nicht nachholen
      speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'de-DE'
      speechSynthesis.speak(u)
    }, SPEECH_DELAY_MS)
  }

  buzz(durationMs: number) {
    if (!this.vibrate || !this.canVibrate) return
    navigator.vibrate(durationMs)
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
