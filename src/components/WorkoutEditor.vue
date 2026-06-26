<template>
  <div class="workout-wrapper">
    <div class="tab-bar">
      <div
        v-for="(tab, i) in tabs"
        :key="i"
        class="tab"
        :class="{ active: i === activeTab, 'drag-over': dragOverTab === i }"
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
        <span v-if="tabs.length > 1" class="tab-close" @click.stop="removeTab(i)">✕</span>
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

<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'

interface Tab {
  title: string
  content: string
}

const tabs = ref<Tab[]>([{ title: 'Workout 1', content: '' }])
const activeTab = ref(0)
const editorRef = ref<HTMLElement>()
const renamingTab = ref(-1)
const renameValue = ref('')
const renameInputRef = ref<HTMLInputElement>()
const dragTab = ref(-1)
const dragOverTab = ref(-1)

function switchTab(i: number) {
  if (renamingTab.value >= 0) return
  activeTab.value = i
}

watch(activeTab, async () => {
  await nextTick()
  if (editorRef.value) editorRef.value.innerText = tabs.value[activeTab.value].content
})

function onInput() {
  const editor = editorRef.value
  if (!editor) return
  if (editor.innerText.trim() === '') editor.innerHTML = ''
  tabs.value[activeTab.value].content = editor.innerText
}

function addTab() {
  tabs.value.push({ title: `Workout ${tabs.value.length + 1}`, content: '' })
  activeTab.value = tabs.value.length - 1
}

function removeTab(i: number) {
  tabs.value.splice(i, 1)
  if (activeTab.value >= tabs.value.length) activeTab.value = tabs.value.length - 1
}

function onDragStart(i: number, e: DragEvent) {
  dragTab.value = i
  e.dataTransfer!.effectAllowed = 'move'
}

function onDrop(i: number) {
  const from = dragTab.value
  if (from === i || from === -1) return
  const moved = tabs.value.splice(from, 1)[0]
  tabs.value.splice(i, 0, moved)
  activeTab.value = i
  dragTab.value = -1
  dragOverTab.value = -1
}

async function startRename(i: number) {
  renamingTab.value = i
  renameValue.value = tabs.value[i].title
  await nextTick()
  renameInputRef.value?.select()
}

function commitRename(i: number) {
  const t = renameValue.value.trim()
  if (t) tabs.value[i].title = t
  renamingTab.value = -1
}

onMounted(() => {
  if (editorRef.value) editorRef.value.innerText = tabs.value[0].content
})
</script>

<style scoped>
.workout-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #000;
}

.tab-bar {
  display: flex;
  align-items: stretch;
  background: #0d0d0d;
  border-bottom: 2px solid #333;
  flex-shrink: 0;
  overflow-x: auto;
  height: 40px;
  box-sizing: border-box;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  cursor: pointer;
  color: #555;
  font-size: 12px;
  letter-spacing: 1px;
  border-right: 1px solid #1a1a1a;
  white-space: nowrap;
  user-select: none;
}

.tab:hover { color: #999; background: #111; }
.tab.active { color: #fff; background: #000; border-bottom: 1px solid #000; }
.tab.drag-over { border-left: 2px solid #555; }

.tab-title { pointer-events: none; }

.tab-rename {
  background: none;
  border: none;
  border-bottom: 1px solid #555;
  color: #fff;
  font-size: 12px;
  font-family: monospace;
  letter-spacing: 1px;
  outline: none;
  width: 80px;
  padding: 0;
}

.tab-close {
  color: #444;
  font-size: 10px;
  cursor: pointer;
  padding: 0 2px;
  pointer-events: all;
}

.tab-close:hover { color: #e63946; }

.tab-add {
  background: none;
  border: none;
  color: #444;
  font-size: 18px;
  cursor: pointer;
  padding: 0 14px;
  line-height: 1;
}

.tab-add:hover { color: #fff; }

.editor-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
}

.workout-editor {
  width: 100%;
  color: #fff;
  font-family: 'JetBrains Mono', monospace;
  font-size: 32px;
  line-height: 1.7;
  outline: none;
  padding: 20px;
  text-align: center;
  white-space: pre-wrap;
  word-break: break-word;
}

.workout-editor:empty::before {
  content: attr(data-placeholder);
  color: #333;
}
</style>
