import { describe, it, expect } from 'vitest'
import {
  WOD_SPECS,
  clampField,
  defaultValues,
  formatField,
  specFor,
  wodFirstClock,
  wodSegments,
  wodSummary,
  wodTimerConfig,
  wodTotalMs,
  type WodKind,
} from './wodBuilder'
import { defaultTimerDoc, type TimerDoc } from '../types'
import { derivePhase } from '../timer/engine'

function doc(kind: WodKind, values = defaultValues()[kind]): TimerDoc {
  return { ...defaultTimerDoc(), warmupEnabled: false, ...wodTimerConfig(kind, values) }
}

describe('wodBuilder', () => {
  it('Tabata entspricht dem Preset der App (8 × 20/10)', () => {
    const cfg = wodTimerConfig('tabata', defaultValues().tabata)
    expect(cfg).toMatchObject({
      mode: 'interval',
      preset: 'tabata',
      workDuration: 20_000,
      restDuration: 10_000,
      totalRounds: 8,
      sets: 1,
      isRunning: false,
      startedAt: null,
      accumulatedMs: 0,
    })
    expect(wodTotalMs('tabata', defaultValues().tabata)).toBe(240_000)
  })

  it('EMOM setzt Takt und Runden wie applyPreset', () => {
    const v = { ...defaultValues().emom, emomSeconds: 90, rounds: 12 }
    expect(wodTimerConfig('emom', v)).toMatchObject({
      mode: 'interval',
      preset: 'emom',
      emomInterval: 90_000,
      emomRounds: 12,
      workDuration: 90_000,
      restDuration: 0,
      totalRounds: 12,
    })
    expect(wodSummary('emom', v)).toBe('EMOM · 12 × 1:30')
  })

  it('AMRAP ist ein Count-Down, For Time ein Count-Up ab 0', () => {
    expect(wodTimerConfig('amrap', { ...defaultValues().amrap, minutes: 12 })).toMatchObject({
      mode: 'countdown',
      preset: null,
      countdownTarget: 12 * 60_000,
    })
    expect(wodTimerConfig('fortime', defaultValues().fortime)).toMatchObject({ mode: 'countup', countupStart: 0 })
    expect(wodTotalMs('fortime', defaultValues().fortime)).toBeNull()
    expect(wodFirstClock('amrap', { ...defaultValues().amrap, minutes: 12 })).toBe('12:00')
  })

  it.each<[WodKind, Partial<ReturnType<typeof defaultValues>['tabata']>]>([
    ['tabata', {}],
    ['tabata', { sets: 3 }],
    ['emom', { rounds: 7, emomSeconds: 45 }],
    ['interval', { rounds: 4, workSeconds: 30, restSeconds: 0 }],
    ['interval', { rounds: 6, workSeconds: 45, restSeconds: 15 }],
  ])('Gesamtdauer der Zeitleiste stimmt mit der Timer-Engine überein (%s %o)', (kind, patch) => {
    const v = { ...defaultValues()[kind], ...patch }
    const total = wodTotalMs(kind, v)!
    const d = doc(kind, v)
    expect(derivePhase(d, total - 1, true).phase).not.toBe('done')
    expect(derivePhase(d, total, true).phase).toBe('done')
  })

  it('Tabata-Blöcke: Blockpause ersetzt die letzte kurze Pause', () => {
    const segs = wodSegments('tabata', { ...defaultValues().tabata, sets: 2 })!
    expect(segs).toHaveLength(32)
    expect(segs[15]).toEqual({ kind: 'rest', ms: 60_000 })
    expect(segs[31]).toEqual({ kind: 'rest', ms: 10_000 })
  })

  it('Werte bleiben in den Grenzen und werden lesbar formatiert', () => {
    const work = specFor('interval').fields.find((f) => f.key === 'workSeconds')!
    expect(clampField(work, 0)).toBe(5)
    expect(clampField(work, 9999)).toBe(600)
    expect(formatField(work, 75)).toBe('1:15')
    expect(formatField(specFor('amrap').fields[0], 20)).toBe('20 min')
  })

  it('jede Art hat ein Label und eine Kurzbeschreibung', () => {
    for (const spec of WOD_SPECS) {
      expect(wodSummary(spec.kind, defaultValues()[spec.kind])).toContain(spec.label)
    }
  })
})
