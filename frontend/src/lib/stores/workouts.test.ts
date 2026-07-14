import { describe, it, expect, beforeEach, vi } from 'vitest'
import { WorkoutStore } from './workouts.svelte'

describe('WorkoutStore', () => {
  let store: WorkoutStore

  beforeEach(() => {
    store = new WorkoutStore()
  })

  it('startet mit einem Tab "Workout 1"', () => {
    expect(store.tabs).toHaveLength(1)
    expect(store.tabs[0].title).toBe('Workout 1')
    expect(store.activeTab).toBe(0)
  })

  it('addTab fügt Tab hinzu, aktiviert ihn und meldet Struktur', () => {
    const spy = vi.fn()
    store.onStructure = spy
    store.addTab()
    expect(store.tabs).toHaveLength(2)
    expect(store.tabs[1].title).toBe('Workout 2')
    expect(store.activeTab).toBe(1)
    expect(spy).toHaveBeenCalledWith({ tabs: store.tabs, activeTab: 1 })
  })

  it('removeTab entfernt Tab und klemmt activeTab', () => {
    store.addTab()
    store.addTab()
    store.switchTab(2)
    store.removeTab(2)
    expect(store.tabs).toHaveLength(2)
    expect(store.activeTab).toBe(1)
  })

  it('renameTab trimmt und verwirft leere Titel; meldet onTabField', () => {
    const spy = vi.fn()
    store.onTabField = spy
    const id = store.tabs[0].id
    store.renameTab(0, '  WOD A  ')
    expect(store.tabs[0].title).toBe('WOD A')
    expect(spy).toHaveBeenCalledWith(id, 'title', 'WOD A')
    store.renameTab(0, '   ')
    expect(store.tabs[0].title).toBe('WOD A')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('setContent aktualisiert Inhalt und meldet onTabField', () => {
    const spy = vi.fn()
    store.onTabField = spy
    store.setContent(0, '5 Rounds for time')
    expect(store.tabs[0].content).toBe('5 Rounds for time')
    expect(spy).toHaveBeenCalledWith(store.tabs[0].id, 'content', '5 Rounds for time')
  })

  it('switchTab meldet onActiveTab', () => {
    const spy = vi.fn()
    store.onActiveTab = spy
    store.addTab()
    store.switchTab(0)
    expect(store.activeTab).toBe(0)
    expect(spy).toHaveBeenCalledWith(0)
  })

  it('reorderTabs verschiebt Tab und aktiviert ihn', () => {
    store.addTab()
    store.addTab()
    const first = store.tabs[0].id
    store.reorderTabs(0, 2)
    expect(store.tabs[2].id).toBe(first)
    expect(store.activeTab).toBe(2)
  })

  it('applyRemote überschreibt komplett ohne Callbacks', () => {
    const spy = vi.fn()
    store.onStructure = spy
    store.applyRemote({ tabs: [{ id: 'x1', title: 'Remote', content: 'abc' }], activeTab: 0 })
    expect(store.tabs[0].title).toBe('Remote')
    expect(spy).not.toHaveBeenCalled()
  })

  it('applyRemoteTabField patcht per id; unbekannte id ist no-op', () => {
    const id = store.tabs[0].id
    store.applyRemoteTabField(id, 'content', 'remote text')
    expect(store.tabs[0].content).toBe('remote text')
    store.applyRemoteTabField('nope', 'content', 'x')
    expect(store.tabs[0].content).toBe('remote text')
  })

  it('applyGenerated mit einer Phase setzt nur Inhalt, Titel bleibt', () => {
    const spy = vi.fn()
    store.onStructure = spy
    store.applyGenerated(0, [{ title: '', content: 'FRAN' }])
    expect(store.tabs).toHaveLength(1)
    expect(store.tabs[0].title).toBe('Workout 1')
    expect(store.tabs[0].content).toBe('FRAN')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('applyGenerated mit mehreren Phasen ersetzt aktiven Tab und hängt an', () => {
    const spy = vi.fn()
    store.onStructure = spy
    store.applyGenerated(0, [
      { title: 'Warm-up', content: 'Run' },
      { title: 'Metcon', content: '21-15-9' },
      { title: 'Cooldown', content: 'Stretch' },
    ])
    expect(store.tabs).toHaveLength(3)
    expect(store.tabs.map((t) => t.title)).toEqual(['Warm-up', 'Metcon', 'Cooldown'])
    expect(store.tabs.map((t) => t.content)).toEqual(['Run', '21-15-9', 'Stretch'])
    expect(store.activeTab).toBe(0)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('applyGenerated fügt neue Tabs hinter dem aktiven ein', () => {
    store.addTab() // Tab 2, activeTab = 1
    store.applyGenerated(1, [
      { title: 'A', content: 'a' },
      { title: 'B', content: 'b' },
    ])
    expect(store.tabs.map((t) => t.title)).toEqual(['Workout 1', 'A', 'B'])
    expect(store.activeTab).toBe(1)
  })
})
