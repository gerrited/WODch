export type TimerMode = 'clock' | 'stopwatch' | 'countdown' | 'countup' | 'interval'
export type IntervalPreset = 'tabata' | 'fgb1' | 'fgb2' | 'emom' | 'custom'

export interface TimerDoc {
  mode: TimerMode
  preset: IntervalPreset | null
  isRunning: boolean
  startedAt: number | null
  accumulatedMs: number
  countdownTarget: number
  countupStart: number
  workDuration: number
  restDuration: number
  warmupDuration: number
  warmupEnabled: boolean
  emomInterval: number
  emomRounds: number
  totalRounds: number
  // Intervall in Blöcken (z. B. 5 × Tabata): Anzahl Blöcke und Pause dazwischen (ms).
  // Optional, damit TimerDocs älterer Clients gültig bleiben; fehlt = 1 Block.
  sets?: number
  setRest?: number
  clock12h: boolean
}

export interface VideoDoc {
  isPlaying: boolean
  startedAt: number | null
  accumulatedSeconds: number
}

export interface WorkoutTab {
  id: string
  title: string
  content: string
}

export interface WorkoutsDoc {
  tabs: WorkoutTab[]
  activeTab: number
}

export interface SessionDoc {
  timer: TimerDoc
  video: VideoDoc
  videoUrl: string
  videoLoop: boolean
  workouts: WorkoutsDoc
  // Gemeinsamer Rundenzähler. Optional, weil ältere Clients ihn beim Re-Seed nicht mitsenden.
  roundCounter?: number
  updatedAt: number
}
