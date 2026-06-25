export type TimerMode = 'clock' | 'stopwatch' | 'countdown' | 'countup' | 'interval'
export type TimerPhase = 'idle' | 'warmup' | 'work' | 'rest'
export type IntervalPreset = 'tabata' | 'fgb1' | 'fgb2' | 'emom' | `custom-${number}`

export interface CustomInterval {
  name: string
  rounds: number
  workDuration: number  // ms
  restDuration: number  // ms
}
