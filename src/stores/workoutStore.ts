import { defineStore } from 'pinia'
import { nanoid } from 'nanoid'

export interface WorkoutTab {
  id: string
  title: string
  content: string
}

export const useWorkoutStore = defineStore('workout', {
  state: () => ({
    tabs: [{ id: nanoid(6), title: 'Workout 1', content: '' }] as WorkoutTab[],
    activeTab: 0,
  }),

  actions: {
    addTab() {
      this.tabs.push({ id: nanoid(6), title: `Workout ${this.tabs.length + 1}`, content: '' })
      this.activeTab = this.tabs.length - 1
    },

    removeTab(i: number) {
      this.tabs.splice(i, 1)
      if (this.activeTab >= this.tabs.length) this.activeTab = this.tabs.length - 1
    },

    renameTab(i: number, title: string) {
      const trimmed = title.trim()
      if (trimmed) this.tabs[i].title = trimmed
    },

    setContent(i: number, content: string) {
      this.tabs[i].content = content
    },

    switchTab(i: number) {
      this.activeTab = i
    },

    reorderTabs(from: number, to: number) {
      const moved = this.tabs.splice(from, 1)[0]
      this.tabs.splice(to, 0, moved)
      this.activeTab = to
    },

    setFromRemote(tabs: WorkoutTab[], activeTab: number) {
      this.tabs = tabs
      this.activeTab = activeTab
    },
  },
})
