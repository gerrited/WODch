import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { applyModalStart, type ModalForm } from './modalStart'
import { TimerStore } from '../stores/timer.svelte'

function form(overrides: Partial<ModalForm> = {}): ModalForm {
  return {
    mode: 'clock',
    preset: null,
    countdownMin: 3,
    countdownSec: 0,
    countupMin: 0,
    countupSec: 0,
    emomMin: 1,
    emomSec: 0,
    warmupMin: 0,
    warmupSec: 10,
    customName: '',
    customRounds: 5,
    customWorkMin: 5,
    customWorkSec: 0,
    customRestMin: 1,
    customRestSec: 0,
    ...overrides,
  }
}

describe('applyModalStart', () => {
  let timer: TimerStore

  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(50_000)
    timer = new TimerStore()
  })

  afterEach(() => vi.useRealTimers())

  it('countdown: übernimmt Zielzeit und startet', () => {
    timer.setMode('countdown')
    applyModalStart(timer, form({ mode: 'countdown', countdownMin: 2, countdownSec: 30 }))
    expect(timer.doc.countdownTarget).toBe(150_000)
    expect(timer.doc.isRunning).toBe(true)
    expect(timer.doc.accumulatedMs).toBe(0)
  })

  it('emom: übernimmt Intervall und startet Preset', () => {
    timer.setMode('interval')
    timer.setConfig({ emomRounds: 12 })
    applyModalStart(timer, form({ mode: 'interval', preset: 'emom', emomMin: 0, emomSec: 45 }))
    expect(timer.doc).toMatchObject({ preset: 'emom', workDuration: 45_000, restDuration: 0, totalRounds: 12, isRunning: true })
  })

  it('custom: speichert Slot mit Fallback-Namen und startet', () => {
    timer.setMode('interval')
    applyModalStart(timer, form({ mode: 'interval', preset: 'custom-3', customRounds: 4, customWorkMin: 0, customWorkSec: 40, customRestMin: 0, customRestSec: 20 }))
    expect(timer.customIntervals[3]).toEqual({ name: 'Custom 4', rounds: 4, workDuration: 40_000, restDuration: 20_000 })
    expect(timer.doc).toMatchObject({ preset: 'custom-3', workDuration: 40_000, totalRounds: 4, isRunning: true })
  })

  it('warmup: übernimmt Dauer wenn aktiviert', () => {
    timer.applyPreset('tabata')
    timer.setConfig({ warmupEnabled: true })
    applyModalStart(timer, form({ mode: 'interval', preset: 'tabata', warmupMin: 1, warmupSec: 30 }))
    expect(timer.doc.warmupDuration).toBe(90_000)
    expect(timer.derived).toMatchObject({ phase: 'warmup' })
  })

  it('warmup: übernimmt Dauer auch bei countdown', () => {
    timer.setMode('countdown')
    timer.setConfig({ warmupEnabled: true })
    applyModalStart(timer, form({ mode: 'countdown', warmupMin: 0, warmupSec: 20 }))
    expect(timer.doc.warmupDuration).toBe(20_000)
    expect(timer.derived).toMatchObject({ phase: 'warmup' })
  })

  it('warmup: greift bei emom (applyPreset überschreibt nicht mehr)', () => {
    timer.setMode('interval')
    timer.setConfig({ warmupEnabled: true })
    applyModalStart(timer, form({ mode: 'interval', preset: 'emom', warmupMin: 0, warmupSec: 15 }))
    expect(timer.doc.warmupEnabled).toBe(true)
    expect(timer.doc.warmupDuration).toBe(15_000)
  })
})
