import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTimerStore } from '../src/stores/timerStore'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('clock mode', () => {
  it('default mode is clock', () => {
    const store = useTimerStore()
    expect(store.mode).toBe('clock')
  })

  it('displayTime returns HH:MM:SS in 24h format', () => {
    vi.setSystemTime(new Date('2024-01-01T14:05:03'))
    const store = useTimerStore()
    store.start()
    vi.advanceTimersByTime(1000)
    expect(store.displayTime).toBe('14:05:04')
  })

  it('displayTime returns h:MM:SS AM/PM in 12h format', () => {
    vi.setSystemTime(new Date('2024-01-01T14:05:03'))
    const store = useTimerStore()
    store.clock12h = true
    store.start()
    vi.advanceTimersByTime(1000)
    expect(store.displayTime).toBe('2:05:04 PM')
  })
})

describe('stopwatch mode', () => {
  it('starts at 00:00.00', () => {
    const store = useTimerStore()
    store.setMode('stopwatch')
    expect(store.displayTime).toBe('00:00.00')
  })

  it('counts up with centiseconds', () => {
    const store = useTimerStore()
    store.setMode('stopwatch')
    store.start()
    vi.advanceTimersByTime(1250)
    expect(store.displayTime).toBe('00:01.25')
  })

  it('pause stops elapsed', () => {
    const store = useTimerStore()
    store.setMode('stopwatch')
    store.start()
    vi.advanceTimersByTime(2000)
    store.pause()
    const snapshot = store.displayTime
    vi.advanceTimersByTime(2000)
    expect(store.displayTime).toBe(snapshot)
  })

  it('reset returns to 00:00.00', () => {
    const store = useTimerStore()
    store.setMode('stopwatch')
    store.start()
    vi.advanceTimersByTime(5000)
    store.reset()
    expect(store.displayTime).toBe('00:00.00')
    expect(store.isRunning).toBe(false)
  })

  it('resume continues from paused position', () => {
    const store = useTimerStore()
    store.setMode('stopwatch')
    store.start()
    vi.advanceTimersByTime(3000)
    store.pause()
    store.start() // resume
    vi.advanceTimersByTime(1000)
    expect(store.displayTime).toBe('00:04.00')
  })
})

describe('countdown mode', () => {
  it('counts down from target', () => {
    const store = useTimerStore()
    store.setMode('countdown')
    store.countdownTarget = 10 * 1000
    store.start()
    vi.advanceTimersByTime(3000)
    expect(store.displayTime).toBe('00:07')
  })

  it('stops at 00:00 and is no longer running', () => {
    const store = useTimerStore()
    store.setMode('countdown')
    store.countdownTarget = 5 * 1000
    store.start()
    vi.advanceTimersByTime(6000)
    expect(store.displayTime).toBe('00:00')
    expect(store.isRunning).toBe(false)
  })
})

describe('countup mode', () => {
  it('counts up from countupStart', () => {
    const store = useTimerStore()
    store.setMode('countup')
    store.countupStart = 2 * 60 * 1000
    store.start()
    vi.advanceTimersByTime(30000)
    expect(store.displayTime).toBe('02:30')
  })
})

describe('tabata preset', () => {
  it('starts in work phase with 20s', () => {
    const store = useTimerStore()
    store.applyPreset('tabata')
    store.start()
    vi.advanceTimersByTime(100)
    expect(store.phase).toBe('work')
    expect(store.currentRound).toBe(1)
    expect(store.totalRounds).toBe(8)
    expect(store.displayTime).toBe('00:20')
  })

  it('transitions work→rest after 20s', () => {
    const store = useTimerStore()
    store.applyPreset('tabata')
    store.start()
    vi.advanceTimersByTime(20000)
    expect(store.phase).toBe('rest')
    expect(store.displayTime).toBe('00:10')
  })

  it('advances round after rest', () => {
    const store = useTimerStore()
    store.applyPreset('tabata')
    store.start()
    vi.advanceTimersByTime(30000) // 20s work + 10s rest
    expect(store.phase).toBe('work')
    expect(store.currentRound).toBe(2)
  })

  it('stops after 8 rounds', () => {
    const store = useTimerStore()
    store.applyPreset('tabata')
    store.start()
    vi.advanceTimersByTime(8 * 30000) // 8 × (20+10)
    expect(store.isRunning).toBe(false)
    expect(store.phase).toBe('idle')
  })
})

describe('fgb1 preset', () => {
  it('sets 5 rounds × 5min work + 1min rest', () => {
    const store = useTimerStore()
    store.applyPreset('fgb1')
    expect(store.totalRounds).toBe(5)
    expect(store.workDuration).toBe(5 * 60 * 1000)
    expect(store.restDuration).toBe(60 * 1000)
  })
})

describe('fgb2 preset', () => {
  it('sets 3 rounds × 5min work + 1min rest', () => {
    const store = useTimerStore()
    store.applyPreset('fgb2')
    expect(store.totalRounds).toBe(3)
    expect(store.workDuration).toBe(5 * 60 * 1000)
    expect(store.restDuration).toBe(60 * 1000)
  })
})

describe('emom preset', () => {
  it('uses emomInterval and emomRounds', () => {
    const store = useTimerStore()
    store.emomInterval = 60 * 1000
    store.emomRounds = 10
    store.applyPreset('emom')
    expect(store.workDuration).toBe(60 * 1000)
    expect(store.restDuration).toBe(0)
    expect(store.totalRounds).toBe(10)
  })

  it('advances round every emomInterval (no rest)', () => {
    const store = useTimerStore()
    store.emomInterval = 60 * 1000
    store.emomRounds = 3
    store.applyPreset('emom')
    store.start()
    vi.advanceTimersByTime(60000)
    expect(store.currentRound).toBe(2)
  })
})

describe('warmup', () => {
  it('starts in warmup phase when enabled', () => {
    const store = useTimerStore()
    store.applyPreset('tabata')
    store.warmupEnabled = true
    store.warmupDuration = 10 * 1000
    store.start()
    vi.advanceTimersByTime(100)
    expect(store.phase).toBe('warmup')
  })

  it('transitions warmup→work after warmupDuration', () => {
    const store = useTimerStore()
    store.applyPreset('tabata')
    store.warmupEnabled = true
    store.warmupDuration = 10 * 1000
    store.start()
    vi.advanceTimersByTime(10000)
    expect(store.phase).toBe('work')
    expect(store.currentRound).toBe(1)
  })
})

describe('custom intervals', () => {
  it('saves and loads from localStorage', () => {
    const store = useTimerStore()
    store.saveCustomInterval(0, { name: 'My WOD', rounds: 5, workDuration: 300000, restDuration: 60000 })
    const store2 = useTimerStore()
    store2.loadCustomIntervals()
    expect(store2.customIntervals[0].name).toBe('My WOD')
  })

  it('applies custom-0 preset', () => {
    const store = useTimerStore()
    store.saveCustomInterval(0, { name: 'Test', rounds: 3, workDuration: 120000, restDuration: 30000 })
    store.loadCustomIntervals()
    store.applyPreset('custom-0')
    expect(store.totalRounds).toBe(3)
    expect(store.workDuration).toBe(120000)
    expect(store.restDuration).toBe(30000)
  })
})

describe('displayRound', () => {
  it('returns null in non-interval modes', () => {
    const store = useTimerStore()
    expect(store.displayRound).toBeNull()
    store.setMode('stopwatch')
    expect(store.displayRound).toBeNull()
  })

  it('returns "round / total" during interval work phase', () => {
    const store = useTimerStore()
    store.applyPreset('tabata')
    store.start()
    vi.advanceTimersByTime(100)
    expect(store.displayRound).toBe('1 / 8')
  })
})
