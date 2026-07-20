import type { SessionDoc, TimerDoc, VideoDoc, WorkoutsDoc } from './types.js'

const TTL_MS = 24 * 60 * 60 * 1000

// Struktur-Validierung aller Patch-Werte. Der Server ist die single source of truth:
// ein Angreifer darf weder den Prozess crashen noch kaputte Docs an andere Clients
// weiterreichen können (SECURITY_REVIEW Befund 1/5).
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

const TIMER_MODES = new Set(['clock', 'stopwatch', 'countdown', 'countup', 'interval'])
const INTERVAL_PRESETS = new Set(['tabata', 'fgb1', 'fgb2', 'emom'])

function isTimerDoc(v: unknown): v is TimerDoc {
  if (!isRecord(v)) return false
  return (
    typeof v.mode === 'string' &&
    TIMER_MODES.has(v.mode) &&
    (v.preset === null ||
      (typeof v.preset === 'string' && (INTERVAL_PRESETS.has(v.preset) || /^custom-\d+$/.test(v.preset)))) &&
    typeof v.isRunning === 'boolean' &&
    (v.startedAt === null || isFiniteNumber(v.startedAt)) &&
    isFiniteNumber(v.accumulatedMs) &&
    isFiniteNumber(v.countdownTarget) &&
    isFiniteNumber(v.countupStart) &&
    isFiniteNumber(v.workDuration) &&
    isFiniteNumber(v.restDuration) &&
    isFiniteNumber(v.warmupDuration) &&
    typeof v.warmupEnabled === 'boolean' &&
    isFiniteNumber(v.emomInterval) &&
    isFiniteNumber(v.emomRounds) &&
    isFiniteNumber(v.totalRounds) &&
    typeof v.clock12h === 'boolean'
  )
}

function isVideoDoc(v: unknown): v is VideoDoc {
  return (
    isRecord(v) &&
    typeof v.isPlaying === 'boolean' &&
    (v.startedAt === null || isFiniteNumber(v.startedAt)) &&
    isFiniteNumber(v.accumulatedSeconds)
  )
}

function isWorkoutsDoc(v: unknown): v is WorkoutsDoc {
  return (
    isRecord(v) &&
    Array.isArray(v.tabs) &&
    v.tabs.every(
      (t) =>
        isRecord(t) &&
        typeof t.id === 'string' &&
        typeof t.title === 'string' &&
        typeof t.content === 'string',
    ) &&
    isFiniteNumber(v.activeTab)
  )
}

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
      // path/value kommen aus dem Netz: nie tippen voraussetzen, immer prüfen.
      if (typeof path !== 'string') return false
      const doc = session.doc
      // Ein per seed eingeschleustes Nicht-Objekt-Doc darf keinen Patch crashen.
      if (!isRecord(doc)) return false
      const parts = path.split('/')

      let applied = false
      if (parts.length === 1) {
        if (path === 'timer' && isTimerDoc(value)) {
          doc.timer = value
          applied = true
        } else if (path === 'video' && isVideoDoc(value)) {
          doc.video = value
          applied = true
        } else if (path === 'videoUrl' && typeof value === 'string') {
          doc.videoUrl = value
          applied = true
        } else if (path === 'videoLoop' && typeof value === 'boolean') {
          doc.videoLoop = value
          applied = true
        } else if (path === 'workouts' && isWorkoutsDoc(value)) {
          doc.workouts = value
          applied = true
        }
      } else if (parts.length === 2 && parts[0] === 'workouts' && parts[1] === 'activeTab') {
        // Guards auf dem Bestands-Doc: schützt gegen Typ-Verwirrung durch Garbage-Seeds.
        if (isFiniteNumber(value) && isRecord(doc.workouts)) {
          doc.workouts.activeTab = value
          applied = true
        }
      } else if (parts.length === 3 && parts[0] === 'tab' && (parts[2] === 'content' || parts[2] === 'title')) {
        if (typeof value === 'string' && isRecord(doc.workouts) && Array.isArray(doc.workouts.tabs)) {
          const tab = doc.workouts.tabs.find((t) => isRecord(t) && t.id === parts[1])
          if (tab) {
            tab[parts[2] as 'content' | 'title'] = value
            applied = true
          }
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
