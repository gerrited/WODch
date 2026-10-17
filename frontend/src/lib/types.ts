export type TimerMode = 'clock' | 'stopwatch' | 'countdown' | 'countup' | 'interval' | 'amrap' | 'fortime'
export type IntervalPreset = 'tabata' | 'fgb1' | 'fgb2' | 'emom' | 'custom'

export interface CustomInterval {
  rounds: number
  workDuration: number // ms
  restDuration: number // ms
}

export interface TimerDoc {
  mode: TimerMode
  preset: IntervalPreset | null
  isRunning: boolean
  startedAt: number | null // ms-Timestamp des letzten Starts
  accumulatedMs: number // elapsed vor dem letzten Start
  countdownTarget: number // ms
  countupStart: number // ms
  workDuration: number // ms
  restDuration: number // ms
  warmupDuration: number // ms
  warmupEnabled: boolean
  emomInterval: number // ms
  emomRounds: number
  totalRounds: number
  clock12h: boolean
  // AMRAP-Dauer bzw. Time Cap für For Time (0 = ohne Cap), ms. Optional, weil
  // TimerDocs älterer Clients die Felder nicht enthalten — Lesen nur über amrapMs/capMs.
  amrapDuration?: number
  timeCap?: number
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
  // Gemeinsamer Rundenzähler. Optional, weil ältere Sessions/Clients ihn nicht kennen.
  roundCounter?: number
  updatedAt: number
}

export function defaultTimerDoc(): TimerDoc {
  return {
    mode: 'clock',
    preset: null,
    isRunning: false,
    startedAt: null,
    accumulatedMs: 0,
    countdownTarget: 3 * 60 * 1000,
    countupStart: 0,
    workDuration: 20 * 1000,
    restDuration: 10 * 1000,
    warmupDuration: 10 * 1000,
    warmupEnabled: false,
    emomInterval: 60 * 1000,
    emomRounds: 10,
    totalRounds: 8,
    clock12h: false,
    amrapDuration: 20 * 60 * 1000,
    timeCap: 0,
  }
}
