import type { TimerStore } from '../stores/timer.svelte'
import type { IntervalPreset, TimerMode } from '../types'

export interface ModalForm {
  mode: TimerMode
  preset: IntervalPreset | null
  countdownMin: number
  countdownSec: number
  countupMin: number
  countupSec: number
  emomMin: number
  emomSec: number
  warmupMin: number
  warmupSec: number
  customName: string
  customRounds: number
  customWorkMin: number
  customWorkSec: number
  customRestMin: number
  customRestSec: number
}

function ms(min: number, sec: number): number {
  return (min * 60 + sec) * 1000
}

// „Start" im Modal: Formular in den Store übernehmen, resetten, starten
export function applyModalStart(timer: TimerStore, form: ModalForm): void {
  if (form.mode === 'countdown') {
    timer.setConfig({ countdownTarget: ms(form.countdownMin, form.countdownSec) })
  } else if (form.mode === 'countup') {
    timer.setConfig({ countupStart: ms(form.countupMin, form.countupSec) })
  } else if (form.mode === 'interval' && form.preset === 'emom') {
    timer.setConfig({ emomInterval: ms(form.emomMin, form.emomSec) })
    timer.applyPreset('emom')
  } else if (form.mode === 'interval' && form.preset?.startsWith('custom-')) {
    const slot = parseInt(form.preset.replace('custom-', ''), 10)
    if (Number.isFinite(slot) && slot >= 0) {
      timer.saveCustomInterval(slot, {
        name: form.customName || `Custom ${slot + 1}`,
        rounds: form.customRounds,
        workDuration: ms(form.customWorkMin, form.customWorkSec),
        restDuration: ms(form.customRestMin, form.customRestSec),
      })
      timer.applyPreset(form.preset)
    }
  }
  const warmupEnabled = timer.doc.warmupEnabled && form.mode === 'interval'
  if (warmupEnabled) {
    timer.setConfig({ warmupDuration: ms(form.warmupMin, form.warmupSec) })
  }
  timer.reset()
  timer.start()
}
