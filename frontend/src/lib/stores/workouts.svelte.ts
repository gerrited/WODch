import { nanoid } from 'nanoid'
import type { WorkoutTab, WorkoutsDoc } from '../types'
import type { Phase } from '../generate/generate'

export class WorkoutStore {
  tabs = $state<WorkoutTab[]>([{ id: nanoid(6), title: 'Workout 1', content: '' }])
  activeTab = $state(0)

  // Vom Session-Layer gesetzt; feuern nur bei lokalen Aktionen (nie bei applyRemote*)
  onStructure?: (w: WorkoutsDoc) => void
  onActiveTab?: (i: number) => void
  onTabField?: (id: string, field: 'content' | 'title', value: string) => void

  snapshot(): WorkoutsDoc {
    return {
      tabs: this.tabs.map((t) => ({ ...t })),
      activeTab: this.activeTab,
    }
  }

  addTab() {
    this.tabs.push({ id: nanoid(6), title: `Workout ${this.tabs.length + 1}`, content: '' })
    this.activeTab = this.tabs.length - 1
    this.onStructure?.(this.snapshot())
  }

  removeTab(i: number) {
    this.tabs.splice(i, 1)
    if (this.activeTab >= this.tabs.length) this.activeTab = this.tabs.length - 1
    this.onStructure?.(this.snapshot())
  }

  renameTab(i: number, title: string) {
    const trimmed = title.trim()
    if (!trimmed) return
    this.tabs[i].title = trimmed
    this.onTabField?.(this.tabs[i].id, 'title', trimmed)
  }

  setContent(i: number, content: string) {
    this.tabs[i].content = content
    this.onTabField?.(this.tabs[i].id, 'content', content)
  }

  applyGenerated(active: number, phases: Phase[]) {
    if (phases.length === 0) return
    this.tabs[active].content = phases[0].content
    if (phases.length > 1) {
      if (phases[0].title) this.tabs[active].title = phases[0].title
      const newTabs = phases.slice(1).map((p) => ({
        id: nanoid(6),
        title: p.title || 'Workout',
        content: p.content,
      }))
      this.tabs.splice(active + 1, 0, ...newTabs)
      this.activeTab = active
    }
    this.onStructure?.(this.snapshot())
  }

  switchTab(i: number) {
    this.activeTab = i
    this.onActiveTab?.(i)
  }

  reorderTabs(from: number, to: number) {
    const moved = this.tabs.splice(from, 1)[0]
    this.tabs.splice(to, 0, moved)
    this.activeTab = to
    this.onStructure?.(this.snapshot())
  }

  applyRemote(w: WorkoutsDoc) {
    this.tabs = w.tabs
    this.activeTab = w.activeTab
  }

  applyRemoteActiveTab(i: number) {
    this.activeTab = i
  }

  applyRemoteTabField(id: string, field: 'content' | 'title', value: string) {
    const tab = this.tabs.find((t) => t.id === id)
    if (tab) tab[field] = value
  }
}

export const workouts = new WorkoutStore()
