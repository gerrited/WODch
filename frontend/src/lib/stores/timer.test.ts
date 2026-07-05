import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { TimerStore, CUSTOM_KEY } from './timer.svelte'
import type { TimerDoc } from '../types'

const SEC = 1000
const MIN = 60 * SEC

describe('TimerStore', () => {
  let store: TimerStore

  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
    store = new TimerStore()
  })

  afterEach(() => vi.useRealTimers())

  it('default: clock, nicht laufend', () => {
    expect(store.doc.mode).toBe('clock')
    expect(store.doc.isRunning).toBe(false)
  })

  it('start setzt startedAt und isRunning; elapsed wächst mit now', () => {
    store.setMode('stopwatch')
    store.start()
    expect(store.doc.isRunning).toBe(true)
    expect(store.doc.startedAt).toBe(100_000)
    store.now = 103_500
    expect(store.elapsed).toBe(3500)
  })

  it('pause friert elapsed in accumulatedMs ein, resume läuft weiter', () => {
    store.setMode('stopwatch')
    store.start()
    vi.setSystemTime(104_000)
    store.pause()
    expect(store.doc).toMatchObject({ isRunning: false, startedAt: null, accumulatedMs: 4000 })
    vi.setSystemTime(110_000)
    store.start()
    store.now = 112_000
    expect(store.elapsed).toBe(6000)
  })

  it('reset nullt Sync-Felder ohne Moduswechsel', () => {
    store.setMode('stopwatch')
    store.start()
    vi.setSystemTime(104_000)
    store.reset()
    expect(store.doc).toMatchObject({ mode: 'stopwatch', isRunning: false, startedAt: null, accumulatedMs: 0 })
  })

  it('setMode resettet komplett', () => {
    store.setMode('interval')
    store.applyPreset('tabata')
    store.start()
    store.setMode('countdown')
    expect(store.doc).toMatchObject({ mode: 'countdown', preset: null, isRunning: false, accumulatedMs: 0 })
  })

  it('applyPreset materialisiert tabata/fgb1/fgb2/emom in Dauern', () => {
    store.applyPreset('tabata')
    expect(store.doc).toMatchObject({ mode: 'interval', preset: 'tabata', workDuration: 20 * SEC, restDuration: 10 * SEC, totalRounds: 8 })
    store.applyPreset('fgb1')
    expect(store.doc).toMatchObject({ workDuration: 5 * MIN, restDuration: 1 * MIN, totalRounds: 5 })
    store.applyPreset('fgb2')
    expect(store.doc.totalRounds).toBe(3)
    store.setConfig({ emomInterval: 90 * SEC, emomRounds: 12 })
    store.applyPreset('emom')
    expect(store.doc).toMatchObject({ workDuration: 90 * SEC, restDuration: 0, totalRounds: 12 })
  })

  it('custom interval: speichern, laden, anwenden', () => {
    store.saveCustomInterval(2, { name: 'Murph', rounds: 4, workDuration: 3 * MIN, restDuration: 30 * SEC })
    const fresh = new TimerStore()
    expect(fresh.customIntervals[2]?.name).toBe('Murph')
    fresh.applyPreset('custom-2')
    expect(fresh.doc).toMatchObject({ preset: 'custom-2', workDuration: 3 * MIN, restDuration: 30 * SEC, totalRounds: 4 })
  })

  it('korrupte localStorage-Daten werden ignoriert', () => {
    localStorage.setItem(CUSTOM_KEY, '{{{nope')
    expect(new TimerStore().customIntervals).toEqual([])
  })

  it('onDocChange feuert bei Aktionen, nicht bei applyRemote', () => {
    const spy = vi.fn()
    store.onDocChange = spy
    store.setMode('stopwatch')
    store.start()
    expect(spy).toHaveBeenCalledTimes(2)
    const remote: TimerDoc = { ...store.doc, mode: 'countdown' }
    store.applyRemote(remote)
    expect(spy).toHaveBeenCalledTimes(2)
    expect(store.doc.mode).toBe('countdown')
  })

  it('derived: Tabata läuft deterministisch durch die Phasen', () => {
    store.applyPreset('tabata')
    store.start()
    store.now = 100_000 + 5 * SEC
    expect(store.derived).toMatchObject({ phase: 'work', round: 1 })
    store.now = 100_000 + 25 * SEC
    expect(store.derived).toMatchObject({ phase: 'rest', round: 1 })
    store.now = 100_000 + 240 * SEC
    expect(store.derived).toEqual({ phase: 'done' })
  })
})
