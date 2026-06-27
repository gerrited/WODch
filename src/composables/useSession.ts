import { ref, watch } from 'vue'
import { ref as dbRef, onValue, set } from 'firebase/database'
import { nanoid } from 'nanoid'
import { db } from '../lib/firebase'
import { useTimerStore } from '../stores/timerStore'
import { useWorkoutStore } from '../stores/workoutStore'
import { useVideoStore } from '../stores/videoStore'
import { useVideoEmbed } from './useVideoEmbed'
import type { WorkoutTab } from '../stores/workoutStore'

export const sessionId = ref<string | null>(null)
export const isConnected = ref(false)
export const connectionError = ref(false)

export function extractSessionId(): string | null {
  const hash = window.location.hash
  const match = hash.match(/[#&]?session=([A-Za-z0-9_-]+)/)
  return match ? match[1] : null
}

export function useSession() {
  const timerStore = useTimerStore()
  const workoutStore = useWorkoutStore()
  const videoStore = useVideoStore()
  const { play, pause, seekTo, getCurrentTime, setOnStateChange, markRemoteSync } = useVideoEmbed()

  let localChange = false
  let workoutDebounce: ReturnType<typeof setTimeout> | null = null

  function buildTimerSnapshot() {
    return {
      mode: timerStore.mode,
      preset: timerStore.preset ?? null,
      phase: timerStore.phase,
      isRunning: timerStore.isRunning,
      startedAt: timerStore.startedAt ?? null,
      accumulatedMs: timerStore.accumulatedMs,
      countdownTarget: timerStore.countdownTarget,
      countupStart: timerStore.countupStart,
      workDuration: timerStore.workDuration,
      restDuration: timerStore.restDuration,
      warmupDuration: timerStore.warmupDuration,
      warmupEnabled: timerStore.warmupEnabled,
      emomInterval: timerStore.emomInterval,
      emomRounds: timerStore.emomRounds,
      currentRound: timerStore.currentRound,
      totalRounds: timerStore.totalRounds,
      clock12h: timerStore.clock12h,
      customIntervals: timerStore.customIntervals,
    }
  }

  function buildInitialState() {
    return {
      timer: buildTimerSnapshot(),
      video: { isPlaying: false, startedAt: null, accumulatedSeconds: 0 },
      videoUrl: videoStore.rawUrl,
      workouts: { tabs: workoutStore.tabs, activeTab: workoutStore.activeTab },
      updatedAt: Date.now(),
    }
  }

  function applyTimerSnapshot(t: ReturnType<typeof buildTimerSnapshot> & { startedAt: number | null; accumulatedMs: number }) {
    // syncFromRemote stoppt/startet den lokalen setInterval korrekt
    timerStore.syncFromRemote({
      mode: t.mode,
      preset: t.preset ?? null,
      phase: t.phase,
      isRunning: t.isRunning,
      startedAt: t.startedAt ?? null,
      accumulatedMs: t.accumulatedMs,
      countdownTarget: t.countdownTarget,
      countupStart: t.countupStart,
      workDuration: t.workDuration,
      restDuration: t.restDuration,
      warmupDuration: t.warmupDuration,
      warmupEnabled: t.warmupEnabled,
      emomInterval: t.emomInterval,
      emomRounds: t.emomRounds,
      currentRound: t.currentRound,
      totalRounds: t.totalRounds,
      clock12h: t.clock12h,
      customIntervals: t.customIntervals ?? [],
    })
  }

  function applyVideoSnapshot(v: { isPlaying: boolean; startedAt: number | null; accumulatedSeconds: number }) {
    markRemoteSync()
    const position = v.accumulatedSeconds + (v.isPlaying && v.startedAt !== null
      ? (Date.now() - v.startedAt) / 1000
      : 0)
    seekTo(position)
    if (v.isPlaying) { play() } else { pause() }
  }

  function subscribe(id: string) {
    const sessionRef = dbRef(db, `sessions/${id}`)

    onValue(
      sessionRef,
      (snapshot) => {
        if (!snapshot.exists()) return
        isConnected.value = true
        connectionError.value = false
        const data = snapshot.val()

        localChange = true
        applyTimerSnapshot(data.timer)
        if (data.workouts) {
          workoutStore.setFromRemote(data.workouts.tabs ?? [], data.workouts.activeTab ?? 0)
        }
        if (data.videoUrl !== undefined) videoStore.rawUrl = data.videoUrl
        if (data.video) applyVideoSnapshot(data.video)
        // Erst nach Vue-Flush wieder freigeben (Macrotask > Microtask)
        setTimeout(() => { localChange = false }, 0)
      },
      () => {
        isConnected.value = false
        connectionError.value = true
      },
    )

    // Outgoing: Timer-State (sofort, außer elapsed)
    watch(
      () => ({
        mode: timerStore.mode,
        preset: timerStore.preset,
        phase: timerStore.phase,
        isRunning: timerStore.isRunning,
        startedAt: timerStore.startedAt,
        accumulatedMs: timerStore.accumulatedMs,
        countdownTarget: timerStore.countdownTarget,
        countupStart: timerStore.countupStart,
        workDuration: timerStore.workDuration,
        restDuration: timerStore.restDuration,
        warmupDuration: timerStore.warmupDuration,
        warmupEnabled: timerStore.warmupEnabled,
        emomInterval: timerStore.emomInterval,
        emomRounds: timerStore.emomRounds,
        currentRound: timerStore.currentRound,
        totalRounds: timerStore.totalRounds,
        clock12h: timerStore.clock12h,
      }),
      () => {
        if (localChange) return
        set(dbRef(db, `sessions/${id}/timer`), buildTimerSnapshot())
        set(dbRef(db, `sessions/${id}/updatedAt`), Date.now())
      },
      { deep: true },
    )

    // Outgoing: Workouts (debounced 500ms)
    watch(
      () => ({ tabs: workoutStore.tabs, activeTab: workoutStore.activeTab }),
      (val) => {
        if (localChange) return
        if (workoutDebounce) clearTimeout(workoutDebounce)
        workoutDebounce = setTimeout(() => {
          set(dbRef(db, `sessions/${id}/workouts`), val)
          set(dbRef(db, `sessions/${id}/updatedAt`), Date.now())
        }, 500)
      },
      { deep: true },
    )

    // Outgoing: videoUrl (sofort)
    watch(
      () => videoStore.rawUrl,
      (url) => {
        if (localChange) return
        set(dbRef(db, `sessions/${id}/videoUrl`), url)
        set(dbRef(db, `sessions/${id}/updatedAt`), Date.now())
      },
    )

    // Outgoing: Video-Playback via YT onStateChange
    setOnStateChange((state) => {
      if (localChange) return
      const YT_PLAYING = 1
      const YT_PAUSED = 2
      const YT_ENDED = 0
      if (state === YT_PLAYING) {
        set(dbRef(db, `sessions/${id}/video`), {
          isPlaying: true,
          startedAt: Date.now(),
          accumulatedSeconds: getCurrentTime(),
        })
      } else if (state === YT_PAUSED || state === YT_ENDED) {
        set(dbRef(db, `sessions/${id}/video`), {
          isPlaying: false,
          startedAt: null,
          accumulatedSeconds: getCurrentTime(),
        })
      }
      set(dbRef(db, `sessions/${id}/updatedAt`), Date.now())
    })
  }

  async function createSession(): Promise<void> {
    const id = nanoid(6)
    await set(dbRef(db, `sessions/${id}`), buildInitialState())
    sessionId.value = id
    window.location.hash = `session=${id}`
    try {
      await navigator.clipboard.writeText(window.location.href)
    } catch {
      // Clipboard-Zugriff kann in nicht-sicheren Kontexten scheitern
    }
    subscribe(id)
  }

  function joinSession(id: string): void {
    sessionId.value = id
    subscribe(id)
  }

  return { sessionId, isConnected, connectionError, createSession, joinSession }
}
