# Session Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Workout-Sessions per URL-Hash teilen; Timer, Workouts und YouTube-Video werden über Firebase Realtime Database in Echtzeit auf allen verbundenen Geräten synchronisiert.

**Architecture:** Firebase Realtime Database hält den Session-State unter `sessions/{id}`. Alle Clients subscriben denselben Pfad und schreiben gleichberechtigt (last-write-wins). Der Timer und das Video werden über absolute `startedAt`-Timestamps synchronisiert — kein Flooding mit laufenden Werten. Ein `localChange`-Flag in `useSession` verhindert Echo-Loops.

**Tech Stack:** Vue 3, Pinia, TypeScript, Vite, Firebase JS SDK v10 (modular), YouTube IFrame Player API, Vitest

## Global Constraints

- Firebase SDK: `firebase@^10`
- Nur Firebase Realtime Database (kein Firestore, kein Auth)
- Session-ID: 6 Zeichen, `nanoid(6)`
- URL-Schema: `#session=<id>` (Hash, kein Query-String)
- Alle Vite-Env-Variablen: Prefix `VITE_FIREBASE_`
- Workout-Text: debounced 500 ms vor Firebase-Write
- Timer-`elapsed` wird **nie** nach Firebase geschrieben
- Keine Authentifizierung — Sessions sind öffentlich
- Testrunner: `npm test` (Vitest, jsdom, globals: true)

---

## Dateiübersicht

| Datei | Status | Zweck |
|---|---|---|
| `src/lib/firebase.ts` | Neu | Firebase App + DB initialisieren |
| `src/youtube.d.ts` | Neu | Minimale YT IFrame API Typdeklarationen |
| `src/stores/timerStore.ts` | Ändern | `startTime`→`startedAt`, `lastElapsed`→`accumulatedMs` |
| `src/stores/workoutStore.ts` | Neu | Tabs-State aus WorkoutEditor.vue herausheben |
| `src/stores/videoStore.ts` | Neu | `rawUrl` + `loop` für VideoPlayer |
| `src/composables/useVideoEmbed.ts` | Neuschr. | Singleton YT Player API statt iframe-src |
| `src/composables/useSession.ts` | Neu | Firebase-Sync-Schicht |
| `src/components/ShareButton.vue` | Neu | Session erstellen / Link kopieren |
| `src/components/TimerBar.vue` | Ändern | ShareButton + Connection-Dot integrieren |
| `src/components/WorkoutEditor.vue` | Ändern | Lokalen State → workoutStore |
| `src/components/VideoPlayer.vue` | Ändern | iframe → YT Player API, videoStore |
| `src/App.vue` | Ändern | useSession initialisieren, Auto-Join |
| `tests/timerStore.test.ts` | Ändern | Neue Felder testen |
| `tests/workoutStore.test.ts` | Neu | workoutStore testen |
| `tests/useVideoEmbed.test.ts` | Ändern | `extractVideoId` testen |
| `tests/useSession.test.ts` | Neu | URL-Parsing + Sync-Logic testen |
| `.env.example` | Neu | Firebase-Config-Vorlage |

---

## Task 1: Dependencies + Firebase Init

**Files:**
- Create: `src/lib/firebase.ts`
- Create: `.env.example`
- Modify: `package.json` (via npm install)

**Interfaces:**
- Produces: `db` (Firebase `Database` instance), exportiert aus `src/lib/firebase.ts`

- [ ] **Step 1: Pakete installieren**

```bash
cd /Users/gerrit/Code/WODch
npm install firebase nanoid
npm install -D @types/node
```

Expected: Kein Fehler, `firebase` erscheint in `package.json` dependencies.

- [ ] **Step 2: `.env.example` anlegen**

```
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:abc123
```

Datei: `.env.example`

- [ ] **Step 3: `.env.local` anlegen** (mit echten Firebase-Werten aus Firebase Console → Project settings → Your apps)

Datei: `.env.local` (niemals committen — steht bereits in `.gitignore`)

- [ ] **Step 4: Firebase-Modul erstellen**

Datei: `src/lib/firebase.ts`

```ts
import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
})

export const db = getDatabase(app)
```

- [ ] **Step 5: Firebase Security Rules in Firebase Console konfigurieren**

In Firebase Console → Realtime Database → Rules:

```json
{
  "rules": {
    "sessions": {
      "$sessionId": {
        ".read": true,
        ".write": true,
        ".validate": "newData.hasChildren(['timer','workouts','videoUrl','updatedAt'])"
      }
    }
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/firebase.ts .env.example package.json package-lock.json
git commit -m "chore: install firebase + nanoid, add firebase init module"
```

---

## Task 2: timerStore — Felder umbenennen + Sync-Felder

`startTime` → `startedAt`, `lastElapsed` → `accumulatedMs`. Beide Felder haben dieselbe Semantik wie zuvor, erhalten aber die Namen, die Firebase auch sieht.

**Files:**
- Modify: `src/stores/timerStore.ts`
- Modify: `tests/timerStore.test.ts`

**Interfaces:**
- Produces: `timerStore.startedAt: number | null`, `timerStore.accumulatedMs: number`

- [ ] **Step 1: Fehlschlagende Tests schreiben**

In `tests/timerStore.test.ts` am Ende (vor der letzten `}`) einfügen:

```ts
describe('sync fields (startedAt / accumulatedMs)', () => {
  it('start() setzt startedAt auf aktuellen Timestamp', () => {
    vi.setSystemTime(new Date('2024-01-01T10:00:00.000Z'))
    const store = useTimerStore()
    store.setMode('stopwatch')
    store.start()
    expect(store.startedAt).toBe(new Date('2024-01-01T10:00:00.000Z').getTime())
  })

  it('start() setzt accumulatedMs auf 0 nach reset', () => {
    const store = useTimerStore()
    store.setMode('stopwatch')
    store.start()
    vi.advanceTimersByTime(3000)
    store.reset()
    store.start()
    expect(store.accumulatedMs).toBe(0)
  })

  it('pause() setzt startedAt auf null und accumulatedMs auf elapsed', () => {
    vi.setSystemTime(new Date('2024-01-01T10:00:00.000Z'))
    const store = useTimerStore()
    store.setMode('stopwatch')
    store.start()
    vi.advanceTimersByTime(5000)
    store.pause()
    expect(store.startedAt).toBeNull()
    expect(store.accumulatedMs).toBe(5000)
  })

  it('reset() setzt startedAt und accumulatedMs auf null/0', () => {
    const store = useTimerStore()
    store.setMode('stopwatch')
    store.start()
    vi.advanceTimersByTime(3000)
    store.reset()
    expect(store.startedAt).toBeNull()
    expect(store.accumulatedMs).toBe(0)
  })

  it('_nextPhase setzt startedAt neu und accumulatedMs auf 0', () => {
    vi.setSystemTime(new Date('2024-01-01T10:00:00.000Z'))
    const store = useTimerStore()
    store.applyPreset('tabata')
    store.start()
    const startedAt = store.startedAt
    vi.setSystemTime(new Date('2024-01-01T10:00:20.000Z'))
    vi.advanceTimersByTime(20000) // work→rest transition
    expect(store.startedAt).toBeGreaterThan(startedAt!)
    expect(store.accumulatedMs).toBe(0)
  })
})
```

- [ ] **Step 2: Tests ausführen — müssen scheitern**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "sync fields"
```

Expected: `TypeError: Cannot read properties of undefined` (Felder existieren noch nicht)

- [ ] **Step 3: `timerStore.ts` aktualisieren**

In `src/stores/timerStore.ts` state, `startTime` → `startedAt`, `lastElapsed` → `accumulatedMs`:

```ts
state: () => ({
  mode: 'clock' as TimerMode,
  preset: null as IntervalPreset | null,
  phase: 'idle' as TimerPhase,
  isRunning: false,
  elapsed: 0,
  accumulatedMs: 0,           // war: lastElapsed
  startedAt: null as number | null,  // war: startTime
  clockDisplay: formatClock(new Date(), false),
  clock12h: false,
  countdownTarget: 3 * 60 * 1000,
  countupStart: 0,
  workDuration: 20 * 1000,
  restDuration: 10 * 1000,
  warmupDuration: 10 * 1000,
  warmupEnabled: false,
  emomInterval: 60 * 1000,
  emomRounds: 10,
  currentRound: 0,
  totalRounds: 8,
  customIntervals: [] as CustomInterval[],
}),
```

`start()` aktualisieren:

```ts
start() {
  if (this.isRunning) return
  this.startedAt = Date.now()
  this.isRunning = true
  if (this.mode === 'clock') {
    this.clockDisplay = formatClock(new Date(), this.clock12h)
    _intervalId = setInterval(() => {
      this.clockDisplay = formatClock(new Date(), this.clock12h)
    }, CLOCK_TICK_MS)
    return
  }
  if (this.mode === 'interval' && this.phase === 'idle') {
    this.phase = this.warmupEnabled ? 'warmup' : 'work'
    if (this.phase === 'work') this.currentRound = 1
    this.elapsed = 0
    this.accumulatedMs = 0
  }
  _intervalId = setInterval(() => this._tick(), TICK_MS)
},
```

`pause()` aktualisieren:

```ts
pause() {
  if (!this.isRunning) return
  this._stop()
  this.accumulatedMs = this.elapsed
  this.startedAt = null
  this.isRunning = false
},
```

`reset()` aktualisieren:

```ts
reset() {
  this._stop()
  this.isRunning = false
  this.elapsed = 0
  this.accumulatedMs = 0
  this.startedAt = null
  this.phase = 'idle'
  this.currentRound = 0
},
```

`_tick()` aktualisieren:

```ts
_tick() {
  if (this.startedAt === null) return
  this.elapsed = this.accumulatedMs + (Date.now() - this.startedAt)
  this._checkPhase()
},
```

`_nextPhase()` aktualisieren:

```ts
_nextPhase(phase: TimerPhase, round: number) {
  this.phase = phase
  this.currentRound = round
  this.elapsed = 0
  this.accumulatedMs = 0
  this.startedAt = Date.now()
},
```

`setMode()` aktualisieren — `startTime: null` → `startedAt: null`:

```ts
setMode(mode: TimerMode) {
  this._stop()
  this.isRunning = false
  this.mode = mode
  this.preset = null
  this.phase = 'idle'
  this.elapsed = 0
  this.accumulatedMs = 0
  this.startedAt = null
  this.currentRound = 0
  if (mode === 'clock') this.clockDisplay = formatClock(new Date(), this.clock12h)
},
```

- [ ] **Step 4: Tests ausführen — alle müssen bestehen**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 5: `syncFromRemote` Action ergänzen**

`useSession` kann `$patch({ isRunning: true })` setzen, aber das startet das `setInterval` nicht. `syncFromRemote` kapselt das korrekte Verhalten:

In `src/stores/timerStore.ts` innerhalb von `actions`:

```ts
syncFromRemote(remote: {
  mode: TimerMode
  preset: IntervalPreset | null
  phase: TimerPhase
  isRunning: boolean
  startedAt: number | null
  accumulatedMs: number
  countdownTarget: number
  countupStart: number
  workDuration: number
  restDuration: number
  warmupDuration: number
  warmupEnabled: boolean
  emomInterval: number
  emomRounds: number
  currentRound: number
  totalRounds: number
  clock12h: boolean
  customIntervals: CustomInterval[]
}) {
  this._stop()
  this.mode = remote.mode
  this.preset = remote.preset
  this.phase = remote.phase
  this.isRunning = remote.isRunning
  this.startedAt = remote.startedAt
  this.accumulatedMs = remote.accumulatedMs
  this.countdownTarget = remote.countdownTarget
  this.countupStart = remote.countupStart
  this.workDuration = remote.workDuration
  this.restDuration = remote.restDuration
  this.warmupDuration = remote.warmupDuration
  this.warmupEnabled = remote.warmupEnabled
  this.emomInterval = remote.emomInterval
  this.emomRounds = remote.emomRounds
  this.currentRound = remote.currentRound
  this.totalRounds = remote.totalRounds
  this.clock12h = remote.clock12h
  this.customIntervals = remote.customIntervals ?? []
  if (remote.isRunning && remote.mode !== 'clock') {
    _intervalId = setInterval(() => this._tick(), TICK_MS)
  } else if (remote.isRunning && remote.mode === 'clock') {
    _intervalId = setInterval(() => {
      this.clockDisplay = formatClock(new Date(), this.clock12h)
    }, CLOCK_TICK_MS)
  }
},
```

Test dafür in `tests/timerStore.test.ts` ergänzen:

```ts
describe('syncFromRemote', () => {
  it('startet lokalen Tick wenn isRunning: true', () => {
    vi.setSystemTime(new Date('2024-01-01T10:00:00.000Z'))
    const store = useTimerStore()
    store.syncFromRemote({
      mode: 'stopwatch',
      preset: null,
      phase: 'idle',
      isRunning: true,
      startedAt: Date.now() - 5000,
      accumulatedMs: 0,
      countdownTarget: 180000,
      countupStart: 0,
      workDuration: 20000,
      restDuration: 10000,
      warmupDuration: 10000,
      warmupEnabled: false,
      emomInterval: 60000,
      emomRounds: 10,
      currentRound: 0,
      totalRounds: 8,
      clock12h: false,
      customIntervals: [],
    })
    expect(store.isRunning).toBe(true)
    vi.advanceTimersByTime(1000)
    // elapsed muss weiterlaufen (≈ 6000ms nach sync)
    expect(store.elapsed).toBeGreaterThan(5000)
  })

  it('stoppt lokalen Tick wenn isRunning: false', () => {
    const store = useTimerStore()
    store.setMode('stopwatch')
    store.start()
    vi.advanceTimersByTime(3000)
    store.syncFromRemote({
      mode: 'stopwatch',
      preset: null,
      phase: 'idle',
      isRunning: false,
      startedAt: null,
      accumulatedMs: 3000,
      countdownTarget: 180000,
      countupStart: 0,
      workDuration: 20000,
      restDuration: 10000,
      warmupDuration: 10000,
      warmupEnabled: false,
      emomInterval: 60000,
      emomRounds: 10,
      currentRound: 0,
      totalRounds: 8,
      clock12h: false,
      customIntervals: [],
    })
    expect(store.isRunning).toBe(false)
    const snap = store.elapsed
    vi.advanceTimersByTime(2000)
    expect(store.elapsed).toBe(snap) // kein Fortschritt
  })
})
```

- [ ] **Step 6: Alle Tests ausführen — müssen bestehen**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/stores/timerStore.ts tests/timerStore.test.ts
git commit -m "refactor(timer): rename startTime→startedAt, lastElapsed→accumulatedMs; add syncFromRemote"
```

---

## Task 3: workoutStore — neuer Pinia Store + WorkoutEditor.vue anpassen

Der Tabs-State wird aus der lokalen Komponente in einen Pinia-Store gehoben, damit `useSession` ihn watchen und Firebase-Updates schreiben kann.

**Files:**
- Create: `src/stores/workoutStore.ts`
- Create: `tests/workoutStore.test.ts`
- Modify: `src/components/WorkoutEditor.vue`

**Interfaces:**
- Produces:
  ```ts
  interface WorkoutTab { id: string; title: string; content: string }
  useWorkoutStore() → { tabs, activeTab, addTab(), removeTab(i), renameTab(i, title), setContent(i, content), switchTab(i), reorderTabs(from, to), setFromRemote(tabs, activeTab) }
  ```

- [ ] **Step 1: Fehlschlagende Tests schreiben**

Datei: `tests/workoutStore.test.ts`

```ts
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
```

- [ ] **Step 2: Tests ausführen — müssen scheitern**

```bash
npm test -- tests/workoutStore.test.ts
```

Expected: `Cannot find module '../src/stores/workoutStore'`

- [ ] **Step 3: workoutStore erstellen**

Datei: `src/stores/workoutStore.ts`

```ts
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
```

- [ ] **Step 4: Tests ausführen — müssen bestehen**

```bash
npm test -- tests/workoutStore.test.ts
```

Expected: All 9 tests pass.

- [ ] **Step 5: WorkoutEditor.vue auf workoutStore umstellen**

Ersetze den gesamten `<script setup>` von `src/components/WorkoutEditor.vue`:

```ts
import { ref, watch, nextTick, onMounted } from 'vue'
import { useWorkoutStore } from '../stores/workoutStore'

const store = useWorkoutStore()

const editorRef = ref<HTMLElement>()
const renamingTab = ref(-1)
const renameValue = ref('')
const renameInputRef = ref<HTMLInputElement>()
const dragTab = ref(-1)
const dragOverTab = ref(-1)

function switchTab(i: number) {
  if (renamingTab.value >= 0) return
  store.switchTab(i)
}

watch(() => store.activeTab, async () => {
  await nextTick()
  if (editorRef.value) editorRef.value.innerText = store.tabs[store.activeTab].content
})

function onInput() {
  const editor = editorRef.value
  if (!editor) return
  if (editor.innerText.trim() === '') editor.innerHTML = ''
  store.setContent(store.activeTab, editor.innerText)
}

function addTab() { store.addTab() }

function removeTab(i: number) { store.removeTab(i) }

function onDragStart(i: number, e: DragEvent) {
  dragTab.value = i
  e.dataTransfer!.effectAllowed = 'move'
}

function onDrop(i: number) {
  const from = dragTab.value
  if (from === i || from === -1) return
  store.reorderTabs(from, i)
  dragTab.value = -1
  dragOverTab.value = -1
}

async function startRename(i: number) {
  renamingTab.value = i
  renameValue.value = store.tabs[i].title
  await nextTick()
  renameInputRef.value?.select()
}

function commitRename(i: number) {
  store.renameTab(i, renameValue.value)
  renamingTab.value = -1
}

onMounted(() => {
  if (editorRef.value) editorRef.value.innerText = store.tabs[0].content
})
```

Im Template alle `tabs.` → `store.tabs.`, `activeTab` → `store.activeTab`. Vollständiges Template (unverändert in der Struktur, nur Datenquellen angepasst):

```html
<template>
  <div class="workout-wrapper">
    <div class="tab-bar">
      <div
        v-for="(tab, i) in store.tabs"
        :key="tab.id"
        class="tab"
        :class="{ active: i === store.activeTab, 'drag-over': dragOverTab === i }"
        draggable="true"
        @click="switchTab(i)"
        @dblclick.stop="startRename(i)"
        @dragstart="onDragStart(i, $event)"
        @dragover.prevent="dragOverTab = i"
        @dragleave="dragOverTab = -1"
        @drop.prevent="onDrop(i)"
        @dragend="dragOverTab = -1"
      >
        <input
          v-if="renamingTab === i"
          ref="renameInputRef"
          class="tab-rename"
          v-model="renameValue"
          @blur="commitRename(i)"
          @keydown.enter.prevent="commitRename(i)"
          @keydown.escape="renamingTab = -1"
          @click.stop
        />
        <span v-else class="tab-title">{{ tab.title }}</span>
        <span v-if="store.tabs.length > 1" class="tab-close" @click.stop="removeTab(i)">✕</span>
      </div>
      <button class="tab-add" @click="addTab">+</button>
    </div>
    <div class="editor-area">
      <div
        ref="editorRef"
        class="workout-editor"
        contenteditable="true"
        spellcheck="false"
        data-placeholder="Workout eingeben..."
        @input="onInput"
      />
    </div>
  </div>
</template>
```

- [ ] **Step 6: App manuell testen**

```bash
npm run dev
```

Öffne `http://localhost:5173`. Tabs anlegen, umbenennen, umordnen, Inhalt eingeben — alles muss wie bisher funktionieren.

- [ ] **Step 7: Commit**

```bash
git add src/stores/workoutStore.ts tests/workoutStore.test.ts src/components/WorkoutEditor.vue
git commit -m "feat: lift workout tabs to Pinia workoutStore for session sync"
```

---

## Task 4: videoStore + useVideoEmbed Rewrite (YT IFrame API)

`useVideoEmbed` wird auf die YouTube IFrame Player API umgestellt. `VideoPlayer.vue` bekommt einen `<div>` als Player-Container statt einem `<iframe>`. `rawUrl` und `loop` wandern in einen kleinen Pinia-Store.

**Files:**
- Create: `src/youtube.d.ts`
- Create: `src/stores/videoStore.ts`
- Modify (Neuschr.): `src/composables/useVideoEmbed.ts`
- Modify: `src/components/VideoPlayer.vue`
- Modify: `tests/useVideoEmbed.test.ts`

**Interfaces:**
- Produces:
  ```ts
  extractVideoId(url: string): string | null
  useVideoEmbed() → {
    initPlayer(el: HTMLElement, videoId: string): Promise<void>,
    loadVideo(videoId: string): void,
    play(): void,
    pause(): void,
    seekTo(seconds: number): void,
    getCurrentTime(): number,
    setOnStateChange(fn: (state: number) => void): void,
    playerReady: Ref<boolean>,
  }
  useVideoStore() → { rawUrl: string, loop: boolean }
  ```

- [ ] **Step 1: YT-Typdeklarationen anlegen**

Datei: `src/youtube.d.ts`

```ts
declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void
    YT: typeof YT
  }
  namespace YT {
    const PlayerState: {
      UNSTARTED: -1
      ENDED: 0
      PLAYING: 1
      PAUSED: 2
      BUFFERING: 3
      CUED: 5
    }
    class Player {
      constructor(el: HTMLElement | string, config: PlayerConfig)
      playVideo(): void
      pauseVideo(): void
      seekTo(seconds: number, allowSeekAhead: boolean): void
      getCurrentTime(): number
      getPlayerState(): number
      loadVideoById(videoId: string): void
      destroy(): void
    }
    interface PlayerConfig {
      videoId?: string
      playerVars?: Record<string, string | number>
      events?: {
        onReady?: (e: { target: Player }) => void
        onStateChange?: (e: { data: number }) => void
      }
    }
  }
}
export {}
```

- [ ] **Step 2: videoStore anlegen**

Datei: `src/stores/videoStore.ts`

```ts
import { defineStore } from 'pinia'

export const useVideoStore = defineStore('video', {
  state: () => ({
    rawUrl: '',
    loop: false,
  }),
})
```

- [ ] **Step 3: Test für `extractVideoId` anpassen**

`tests/useVideoEmbed.test.ts` vollständig ersetzen:

```ts
import { describe, expect, it } from 'vitest'
import { extractVideoId } from '../src/composables/useVideoEmbed'

describe('extractVideoId', () => {
  it('parst youtube.com/watch?v=ID', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('parst youtu.be/ID', () => {
    expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('parst URL mit zusätzlichen Query-Params', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=abc123&t=42s')).toBe('abc123')
  })

  it('gibt null für ungültige URL zurück', () => {
    expect(extractVideoId('https://vimeo.com/12345')).toBeNull()
  })

  it('gibt null für leeren String zurück', () => {
    expect(extractVideoId('')).toBeNull()
  })
})
```

- [ ] **Step 4: Tests ausführen — müssen scheitern**

```bash
npm test -- tests/useVideoEmbed.test.ts
```

Expected: `extractVideoId is not a function` (named export existiert noch nicht)

- [ ] **Step 5: `useVideoEmbed.ts` neu schreiben**

Datei: `src/composables/useVideoEmbed.ts`

```ts
import { ref } from 'vue'

export function extractVideoId(url: string): string | null {
  if (!url) return null
  const ytWatch = url.match(/youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]+)/)
  if (ytWatch) return ytWatch[1]
  const ytShort = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)
  if (ytShort) return ytShort[1]
  return null
}

// Singleton-Zustand — eine Player-Instanz für die gesamte App
let player: YT.Player | null = null
let currentVideoId: string | null = null
let apiReady = false
let apiLoading = false
const pendingResolvers: (() => void)[] = []

export const playerReady = ref(false)
export const videoLoop = ref(false)  // von VideoPlayer.vue gesetzt, intern für Loop genutzt
let _onStateChange: ((state: number) => void) | null = null
// Timestamp des letzten Remote-Sync — verhindert Echo-Loop über onStateChange
let lastRemoteSyncAt = 0

function loadYTApi(): Promise<void> {
  if (apiReady) return Promise.resolve()
  return new Promise((resolve) => {
    if (apiLoading) { pendingResolvers.push(resolve); return }
    apiLoading = true
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      apiReady = true
      apiLoading = false
      if (prev) prev()
      resolve()
      pendingResolvers.forEach(fn => fn())
      pendingResolvers.length = 0
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  })
}

export function useVideoEmbed() {
  async function initPlayer(el: HTMLElement, videoId: string): Promise<void> {
    await loadYTApi()
    if (player) { player.destroy(); player = null }
    playerReady.value = false
    currentVideoId = videoId
    player = new YT.Player(el, {
      videoId,
      playerVars: { controls: 1, rel: 0 },
      events: {
        onReady: () => { playerReady.value = true },
        onStateChange: (e) => {
          // Loop intern behandeln — kein externer Callback nötig
          if (e.data === 0 && videoLoop.value && currentVideoId) {
            player?.loadVideoById(currentVideoId)
            return
          }
          // Ignoriere Events für 1s nach einem Remote-Sync
          if (Date.now() - lastRemoteSyncAt < 1000) return
          if (_onStateChange) _onStateChange(e.data)
        },
      },
    })
  }

  function loadVideo(videoId: string) {
    currentVideoId = videoId
    player?.loadVideoById(videoId)
  }

  function play() { player?.playVideo() }
  function pause() { player?.pauseVideo() }
  function seekTo(seconds: number) { player?.seekTo(seconds, true) }
  function getCurrentTime(): number { return player?.getCurrentTime() ?? 0 }

  // Nur von useSession genutzt — ein einziger Subscriber für Firebase-Sync
  function setOnStateChange(fn: (state: number) => void) {
    _onStateChange = fn
  }

  function markRemoteSync() {
    lastRemoteSyncAt = Date.now()
  }

  return { initPlayer, loadVideo, play, pause, seekTo, getCurrentTime, setOnStateChange, markRemoteSync, playerReady }
}
```

- [ ] **Step 6: Tests ausführen — müssen bestehen**

```bash
npm test -- tests/useVideoEmbed.test.ts
```

Expected: All 5 tests pass.

- [ ] **Step 7: VideoPlayer.vue umbauen**

Datei: `src/components/VideoPlayer.vue` vollständig ersetzen:

```html
<template>
  <div class="video-player">
    <div class="url-bar">
      <input
        v-model="store.rawUrl"
        class="url-input"
        placeholder="YouTube URL einfügen..."
        @paste="onPaste"
      />
      <label class="loop-toggle" title="Dauerschleife">
        <input type="checkbox" v-model="store.loop" />
        ∞
      </label>
    </div>
    <div class="embed-area">
      <div v-if="store.rawUrl && !currentVideoId" class="error">
        Keine gültige YouTube URL.
      </div>
      <div v-else-if="!store.rawUrl" class="placeholder">YouTube URL eingeben</div>
      <div ref="playerContainer" class="embed-frame" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useVideoEmbed, extractVideoId } from '../composables/useVideoEmbed'
import { useVideoStore } from '../stores/videoStore'

const store = useVideoStore()
const { initPlayer, loadVideo } = useVideoEmbed()
const playerContainer = ref<HTMLElement>()
const currentVideoId = ref<string | null>(null)

function onPaste(e: ClipboardEvent) {
  e.preventDefault()
  const text = e.clipboardData?.getData('text') ?? ''
  if (text) store.rawUrl = text
}

watch(() => store.rawUrl, async (url) => {
  const id = extractVideoId(url)
  if (!id) { currentVideoId.value = null; return }
  if (id === currentVideoId.value) return
  currentVideoId.value = id
  if (playerContainer.value) {
    // initPlayer erwartet ein Element; ersetze den Container-Inhalt durch ein frisches div
    const el = document.createElement('div')
    playerContainer.value.innerHTML = ''
    playerContainer.value.appendChild(el)
    await initPlayer(el, id)
  }
})

// Loop via onStateChange: wenn Video endet und loop aktiv, neu starten
// (wird in VideoPlayer gehandelt, nicht in useSession, da loop lokale Präferenz ist)
</script>

<style scoped>
.video-player {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #0d0d0d;
}

.url-bar {
  height: 40px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-bottom: 2px solid #333;
  flex-shrink: 0;
}

.url-input {
  flex: 1;
  background: #111;
  border: 1px solid #333;
  border-radius: 4px;
  padding: 6px 10px;
  color: #ccc;
  font-size: 12px;
  font-family: monospace;
  outline: none;
}

.url-input:focus { border-color: #555; }
.url-input::placeholder { color: #444; }

.loop-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #555;
  font-size: 18px;
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
}

.loop-toggle input { display: none; }
.loop-toggle:has(input:checked) { color: #fff; }

.embed-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.embed-frame {
  width: 100%;
  height: 100%;
}

.placeholder, .error {
  color: #444;
  font-size: 13px;
  text-align: center;
  padding: 20px;
}

.error { color: #e63946; }
</style>
```

- [ ] **Step 8: App manuell testen**

```bash
npm run dev
```

YouTube-URL einfügen → Video muss laden und spielen. Loop-Toggle testen. Verschiedene URLs (watch?v=, youtu.be/) testen.

- [ ] **Step 9: Alle Tests ausführen**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/youtube.d.ts src/stores/videoStore.ts src/composables/useVideoEmbed.ts src/components/VideoPlayer.vue tests/useVideoEmbed.test.ts
git commit -m "feat: rewrite useVideoEmbed with YT IFrame API, add videoStore"
```

---

## Task 5: useSession — Sync-Schicht

`useSession` verbindet Firebase Realtime Database mit den drei Stores und dem YT Player. Es managt Session-Erstellung, Auto-Join via URL-Hash und verhindert Echo-Loops über ein `localChange`-Flag.

**Files:**
- Create: `src/composables/useSession.ts`
- Create: `tests/useSession.test.ts`

**Interfaces:**
- Consumes: `db` aus `src/lib/firebase.ts`, `useTimerStore`, `useWorkoutStore`, `useVideoStore`, `useVideoEmbed`
- Produces:
  ```ts
  useSession() → {
    sessionId: Ref<string | null>,
    isConnected: Ref<boolean>,
    connectionError: Ref<boolean>,
    createSession(): Promise<void>,
    joinSession(id: string): void,
  }
  ```

- [ ] **Step 1: Test für URL-Parsing schreiben**

Datei: `tests/useSession.test.ts`

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Firebase mocken
vi.mock('firebase/database', () => ({
  ref: vi.fn(() => ({})),
  set: vi.fn(() => Promise.resolve()),
  onValue: vi.fn(),
  off: vi.fn(),
}))

vi.mock('../src/lib/firebase', () => ({
  db: {},
}))

beforeEach(() => {
  setActivePinia(createPinia())
  // URL hash zurücksetzen
  window.location.hash = ''
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('extractSessionId', () => {
  it('extrahiert Session-ID aus URL-Hash', async () => {
    const { extractSessionId } = await import('../src/composables/useSession')
    window.location.hash = '#session=Abc123'
    expect(extractSessionId()).toBe('Abc123')
  })

  it('gibt null zurück wenn kein session= im Hash', async () => {
    const { extractSessionId } = await import('../src/composables/useSession')
    window.location.hash = ''
    expect(extractSessionId()).toBeNull()
  })

  it('gibt null zurück für anderen Hash-Inhalt', async () => {
    const { extractSessionId } = await import('../src/composables/useSession')
    window.location.hash = '#other=value'
    expect(extractSessionId()).toBeNull()
  })
})

describe('createSession', () => {
  it('schreibt initialen State und setzt URL-Hash', async () => {
    const { set } = await import('firebase/database')
    const { useSession } = await import('../src/composables/useSession')
    // Clipboard mocken
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(() => Promise.resolve()) },
      writable: true,
    })
    const { createSession, sessionId } = useSession()
    await createSession()
    expect(set).toHaveBeenCalled()
    expect(sessionId.value).toHaveLength(6)
    expect(window.location.hash).toContain(sessionId.value!)
  })
})
```

- [ ] **Step 2: Tests ausführen — müssen scheitern**

```bash
npm test -- tests/useSession.test.ts
```

Expected: `Cannot find module '../src/composables/useSession'`

- [ ] **Step 3: `useSession.ts` erstellen**

Datei: `src/composables/useSession.ts`

```ts
import { ref, watch, nextTick } from 'vue'
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
    if (v.isPlaying) play() else pause()
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
```

- [ ] **Step 4: Tests ausführen — müssen bestehen**

```bash
npm test -- tests/useSession.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Alle Tests ausführen**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/composables/useSession.ts tests/useSession.test.ts
git commit -m "feat: add useSession composable with Firebase Realtime Database sync"
```

---

## Task 6: ShareButton.vue + TimerBar.vue

**Files:**
- Create: `src/components/ShareButton.vue`
- Modify: `src/components/TimerBar.vue`

**Interfaces:**
- Consumes: `useSession()` → `{ sessionId, isConnected, connectionError, createSession }`

- [ ] **Step 1: ShareButton.vue erstellen**

Datei: `src/components/ShareButton.vue`

```html
<template>
  <button class="share-btn" @click="handleClick" :title="label">
    {{ icon }}
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSession } from '../composables/useSession'

const { sessionId, createSession } = useSession()

const icon = computed(() => sessionId.value ? '🔗' : '📤')
const label = computed(() => sessionId.value ? 'Link kopieren' : 'Session teilen')

async function handleClick() {
  if (sessionId.value) {
    await navigator.clipboard.writeText(window.location.href).catch(() => {})
  } else {
    await createSession()
  }
}
</script>

<style scoped>
.share-btn {
  position: absolute;
  right: 60px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  font-size: 22px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  line-height: 1;
  opacity: 0.5;
  transition: opacity 0.15s;
}

.share-btn:hover { opacity: 1; background: #222; }
</style>
```

- [ ] **Step 2: TimerBar.vue aktualisieren**

`src/components/TimerBar.vue` — Connection-Dot und ShareButton einfügen. Ersetze den gesamten Inhalt:

```html
<template>
  <div class="timer-bar" @click="handleClick">
    <div class="timer-center">
      <span v-if="store.displayRound" class="round">{{ store.displayRound }}</span>
      <span class="time">{{ store.displayTime }}</span>
    </div>
    <ShareButton />
    <button class="gear" @click.stop="emit('openModal')" title="Timer-Einstellungen">⚙</button>
    <span class="connection-dot" :class="dotClass" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTimerStore } from '../stores/timerStore'
import { useSession } from '../composables/useSession'
import ShareButton from './ShareButton.vue'

const emit = defineEmits<{ openModal: [] }>()
const store = useTimerStore()
const { sessionId, isConnected, connectionError } = useSession()

const dotClass = computed(() => {
  if (!sessionId.value) return 'dot-off'
  if (connectionError.value) return 'dot-error'
  if (isConnected.value) return 'dot-ok'
  return 'dot-off'
})

function handleClick() {
  if (store.mode === 'clock' || (store.phase === 'idle' && !store.isRunning)) {
    emit('openModal')
  } else {
    store.toggle()
  }
}
</script>

<style scoped>
.timer-bar {
  position: relative;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #111;
  border-bottom: 2px solid #333;
  cursor: pointer;
  user-select: none;
  container-type: size;
}

.timer-bar:hover { background: #161616; }

.timer-center {
  display: flex;
  align-items: baseline;
  gap: 24px;
}

.round {
  font-size: clamp(14px, 25cqh, 9999px);
  color: #888;
  letter-spacing: 2px;
  font-weight: 600;
}

.time {
  font-size: clamp(28px, 60cqh, 9999px);
  font-weight: 900;
  color: #fff;
  letter-spacing: 4px;
  font-family: monospace;
}

.gear {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #444;
  font-size: 36px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  line-height: 1;
}

.gear:hover { color: #888; background: #222; }

.connection-dot {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transition: background-color 0.3s;
}

.dot-off { background: #333; }
.dot-ok { background: #4caf50; }
.dot-error { background: #e63946; }
</style>
```

- [ ] **Step 3: App manuell testen**

```bash
npm run dev
```

ShareButton muss in der TimerBar sichtbar sein. Connection-Dot links oben. Klick auf ShareButton → Hash in URL, Dot wird grün (wenn Firebase konfiguriert).

- [ ] **Step 4: Commit**

```bash
git add src/components/ShareButton.vue src/components/TimerBar.vue
git commit -m "feat: add ShareButton and connection indicator to TimerBar"
```

---

## Task 7: App.vue — Auto-Join + VideoPlayer Loop-Sync

**Files:**
- Modify: `src/App.vue`
- Modify: `src/components/VideoPlayer.vue` (Loop-Handler via onStateChange)

**Interfaces:**
- Consumes: `useSession()`, `extractSessionId()`

- [ ] **Step 1: App.vue aktualisieren**

In `src/App.vue` den `<script setup>` ersetzen:

```ts
import { ref, onMounted, onUnmounted } from 'vue'
import { Splitpanes, Pane } from 'splitpanes'
import TimerBar from './components/TimerBar.vue'
import WorkoutEditor from './components/WorkoutEditor.vue'
import VideoPlayer from './components/VideoPlayer.vue'
import TimerModal from './components/TimerModal.vue'
import { useTimerStore } from './stores/timerStore'
import { useSession, extractSessionId } from './composables/useSession'

const store = useTimerStore()
const { joinSession } = useSession()
const showModal = ref(false)

function onKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

  if (e.code === 'Space') {
    e.preventDefault()
    store.toggle()
  } else if (e.code === 'KeyR') {
    store.reset()
  } else if (e.code === 'KeyM') {
    showModal.value = !showModal.value
  }
}

onMounted(() => {
  store.start()
  document.addEventListener('keydown', onKeydown)

  const id = extractSessionId()
  if (id) joinSession(id)
})

onUnmounted(() => document.removeEventListener('keydown', onKeydown))
```

- [ ] **Step 2: VideoPlayer.vue — loop via `videoLoop` ref synchronisieren**

`videoLoop` wird direkt in `useVideoEmbed` verwaltet (Loop-Handling intern im `onStateChange`). VideoPlayer.vue muss nur den `store.loop`-Wert mit `videoLoop` synchronisieren. `setOnStateChange` bleibt ausschließlich für `useSession` reserviert.

In `src/components/VideoPlayer.vue` den Script-Block ersetzen:

```ts
import { ref, watch } from 'vue'
import { useVideoEmbed, extractVideoId, videoLoop } from '../composables/useVideoEmbed'
import { useVideoStore } from '../stores/videoStore'

const store = useVideoStore()
const { initPlayer } = useVideoEmbed()
const playerContainer = ref<HTMLElement>()
const currentVideoId = ref<string | null>(null)

function onPaste(e: ClipboardEvent) {
  e.preventDefault()
  const text = e.clipboardData?.getData('text') ?? ''
  if (text) store.rawUrl = text
}

watch(() => store.rawUrl, async (url) => {
  const id = extractVideoId(url)
  if (!id) { currentVideoId.value = null; return }
  if (id === currentVideoId.value) return
  currentVideoId.value = id
  if (playerContainer.value) {
    const el = document.createElement('div')
    playerContainer.value.innerHTML = ''
    playerContainer.value.appendChild(el)
    await initPlayer(el, id)
  }
})

// Loop-Präferenz an useVideoEmbed weitergeben (kein Firebase-Sync)
watch(() => store.loop, (val) => { videoLoop.value = val }, { immediate: true })
```

- [ ] **Step 3: Alle Tests ausführen**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 4: End-to-End manuell testen**

```bash
npm run dev
```

1. App öffnen → auf ShareButton klicken → URL-Hash wird gesetzt, Dot grün
2. URL in neuem Tab / anderem Gerät öffnen → Timer muss synchron sein
3. Timer starten auf Gerät A → Gerät B zeigt laufenden Timer
4. Pause auf Gerät B → Gerät A hält an
5. YouTube-URL eingeben → beide Geräte zeigen dasselbe Video
6. Play auf Gerät A → Gerät B startet ebenfalls
7. Workout-Text eingeben → nach 500ms erscheint auf Gerät B

- [ ] **Step 5: Commit**

```bash
git add src/App.vue src/components/VideoPlayer.vue
git commit -m "feat: auto-join session from URL hash, wire loop handler in VideoPlayer"
```

---

## Nachbereitung: Session-Cleanup (optional)

Firebase löscht Sessions nicht automatisch. Einrichten einer Firebase Cloud Function oder eines geplanten Jobs im k8s-Cluster:

```ts
// Beispiel Cloud Function (Node.js)
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getDatabase } from 'firebase-admin/database'

export const cleanSessions = onSchedule('every 24 hours', async () => {
  const db = getDatabase()
  const cutoff = Date.now() - 86400000
  const snap = await db.ref('sessions').orderByChild('updatedAt').endAt(cutoff).get()
  const deletes: Promise<void>[] = []
  snap.forEach(child => { deletes.push(child.ref.remove()) })
  await Promise.all(deletes)
})
```

Alternativ: im k8s-Cluster einen CronJob mit dem Firebase Admin SDK deployen.
