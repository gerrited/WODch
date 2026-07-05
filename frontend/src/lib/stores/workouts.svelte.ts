import { nanoid } from 'nanoid'
import type { WorkoutTab, WorkoutsDoc } from '../types'

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
