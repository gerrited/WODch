import { beforeEach, describe, expect, it } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useWorkoutStore } from '../src/stores/workoutStore'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('workoutStore', () => {
  it('startet mit einem Tab namens "Workout 1"', () => {
    const store = useWorkoutStore()
    expect(store.tabs).toHaveLength(1)
    expect(store.tabs[0].title).toBe('Workout 1')
    expect(store.tabs[0].id).toHaveLength(6)
  })

  it('addTab fügt Tab hinzu und aktiviert ihn', () => {
    const store = useWorkoutStore()
    store.addTab()
    expect(store.tabs).toHaveLength(2)
    expect(store.activeTab).toBe(1)
    expect(store.tabs[1].title).toBe('Workout 2')
  })

  it('removeTab entfernt Tab und klemmt activeTab', () => {
    const store = useWorkoutStore()
    store.addTab()
    store.addTab()
    store.removeTab(0)
    expect(store.tabs).toHaveLength(2)
    expect(store.activeTab).toBeLessThan(store.tabs.length)
  })

  it('renameTab setzt neuen Titel (trimmed)', () => {
    const store = useWorkoutStore()
    store.renameTab(0, '  Power WOD  ')
    expect(store.tabs[0].title).toBe('Power WOD')
  })

  it('renameTab ignoriert leeren String', () => {
    const store = useWorkoutStore()
    store.renameTab(0, '   ')
    expect(store.tabs[0].title).toBe('Workout 1')
  })

  it('setContent aktualisiert Inhalt', () => {
    const store = useWorkoutStore()
    store.setContent(0, '10 Burpees')
    expect(store.tabs[0].content).toBe('10 Burpees')
  })

  it('switchTab wechselt activeTab', () => {
    const store = useWorkoutStore()
    store.addTab()
    store.switchTab(0)
    expect(store.activeTab).toBe(0)
  })

  it('reorderTabs verschiebt Tab korrekt', () => {
    const store = useWorkoutStore()
    store.addTab()
    store.addTab()
    const [a, b, c] = store.tabs.map(t => t.id)
    store.reorderTabs(0, 2)
    expect(store.tabs.map(t => t.id)).toEqual([b, c, a])
    expect(store.activeTab).toBe(2)
  })

  it('setFromRemote überschreibt State komplett', () => {
    const store = useWorkoutStore()
    store.setFromRemote(
      [{ id: 'abc123', title: 'Remote WOD', content: 'Squat' }],
      0
    )
    expect(store.tabs).toHaveLength(1)
    expect(store.tabs[0].title).toBe('Remote WOD')
    expect(store.activeTab).toBe(0)
  })
})
