import type { SessionDoc, TimerDoc, VideoDoc, WorkoutsDoc } from './types.js'

const TTL_MS = 24 * 60 * 60 * 1000

export interface Session {
  doc: SessionDoc
  clients: Set<unknown>
}

export interface Store {
  get(id: string): Session | undefined
  create(id: string, doc: SessionDoc): Session
  applyPatch(id: string, path: string, value: unknown, now?: number): boolean
  sweep(now?: number): string[]
}

export function createStore(): Store {
  const sessions = new Map<string, Session>()

  return {
    get(id) {
      return sessions.get(id)
    },

    create(id, doc) {
      const existing = sessions.get(id)
      if (existing) return existing
      const session: Session = { doc, clients: new Set() }
      sessions.set(id, session)
      return session
    },

    applyPatch(id, path, value, now = Date.now()) {
      const session = sessions.get(id)
      if (!session) return false
      const doc = session.doc
      const parts = path.split('/')

      let applied = false
      if (parts.length === 1) {
        if (path === 'timer') {
          doc.timer = value as TimerDoc
          applied = true
        } else if (path === 'video') {
          doc.video = value as VideoDoc
          applied = true
        } else if (path === 'videoUrl') {
          doc.videoUrl = value as string
          applied = true
        } else if (path === 'videoLoop') {
          doc.videoLoop = value as boolean
          applied = true
        } else if (path === 'workouts') {
          doc.workouts = value as WorkoutsDoc
          applied = true
        }
      } else if (parts.length === 2 && parts[0] === 'workouts' && parts[1] === 'activeTab') {
        doc.workouts.activeTab = value as number
        applied = true
      } else if (parts.length === 3 && parts[0] === 'tab' && (parts[2] === 'content' || parts[2] === 'title')) {
        const tab = doc.workouts.tabs.find((t) => t.id === parts[1])
        if (tab) {
          tab[parts[2] as 'content' | 'title'] = value as string
          applied = true
        }
      }

      if (applied) doc.updatedAt = now
      return applied
    },

    sweep(now = Date.now()) {
      const removed: string[] = []
      for (const [id, session] of sessions) {
        if (session.clients.size === 0 && session.doc.updatedAt < now - TTL_MS) {
          sessions.delete(id)
          removed.push(id)
        }
      }
      return removed
    },
  }
}
