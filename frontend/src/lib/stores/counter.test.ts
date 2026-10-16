import { describe, it, expect, vi } from 'vitest'
import { CounterStore, MAX_ROUND_COUNTER } from './counter.svelte'

describe('CounterStore', () => {
  it('zählt hoch/runter und meldet jede lokale Änderung', () => {
    const c = new CounterStore()
    const spy = vi.fn()
    c.onChange = spy
    c.increment()
    c.increment()
    c.decrement()
    expect(c.count).toBe(1)
    expect(spy.mock.calls).toEqual([[1], [2], [1]])
  })

  it('bleibt in [0, MAX] und meldet No-ops nicht', () => {
    const c = new CounterStore()
    const spy = vi.fn()
    c.onChange = spy
    c.decrement()
    expect(c.count).toBe(0)
    c.applyRemote(MAX_ROUND_COUNTER)
    c.increment()
    expect(c.count).toBe(MAX_ROUND_COUNTER)
    expect(spy).not.toHaveBeenCalled()
  })

  it('reset setzt auf 0', () => {
    const c = new CounterStore()
    c.increment()
    c.reset()
    expect(c.count).toBe(0)
  })

  it('applyRemote feuert keinen Callback und toleriert fehlende Werte', () => {
    const c = new CounterStore()
    const spy = vi.fn()
    c.onChange = spy
    c.applyRemote(4)
    expect(c.count).toBe(4)
    c.applyRemote(undefined)
    expect(c.count).toBe(0)
    expect(spy).not.toHaveBeenCalled()
  })
})
