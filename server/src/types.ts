export type TimerMode = 'clock' | 'stopwatch' | 'countdown' | 'countup' | 'interval'
export type IntervalPreset = 'tabata' | 'fgb1' | 'fgb2' | 'emom' | `custom-${number}`

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
  workouts: WorkoutsDoc
  updatedAt: number
}
