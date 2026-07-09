<script lang="ts">
  import { tick } from 'svelte'
  import { workouts } from '../stores/workouts.svelte'
  import ConfirmDialog from './ConfirmDialog.svelte'
  import GenerateDialog from './GenerateDialog.svelte'
  import { requestWorkout, PHRASES, nextPhraseIndex } from '../generate/generate'

  let editorEl: HTMLDivElement | undefined = $state()
  let focused = false
  let renamingTab = $state(-1)
  let renameValue = $state('')
  let renameInput: HTMLInputElement | undefined = $state()
  let dragTab = -1
  let dragOverTab = $state(-1)
  let pendingDelete = $state<number | null>(null)

  let showGenerate = $state(false)
  let generating = $state(false)
  let phraseIndex = $state(0)
  let genError = $state<string | null>(null)
  let phraseTimer: ReturnType<typeof setInterval> | undefined

  function openGenerate() {
    genError = null
    showGenerate = true
  }

  async function runGenerate(prompt: string) {
    showGenerate = false
    genError = null
    generating = true
    phraseIndex = 0
    phraseTimer = setInterval(() => {
      phraseIndex = nextPhraseIndex(phraseIndex)
    }, 1500)
    const target = workouts.activeTab
    try {
      const workout = await requestWorkout(prompt)
      workouts.setContent(target, workout)
    } catch (e) {
      genError = e instanceof Error ? e.message : 'Generierung fehlgeschlagen.'
    } finally {
      generating = false
      clearInterval(phraseTimer)
    }
  }

  // innerText fehlt in jsdom — Fallback auf textContent (Inhalt ist reiner Text)
  function getText(el: HTMLElement): string {
    return (el as { innerText?: string }).innerText ?? el.textContent ?? ''
  }
  function setText(el: HTMLElement, text: string) {
    if (getText(el) === text) return
    if ('innerText' in el && el.innerText !== undefined) el.innerText = text
    else el.textContent = text
  }

  // DOM aus dem Store aktualisieren — aber nie, während der User tippt (Fokus-Schutz).
  // Remote-Änderungen am aktiven Tab werden dadurch gepuffert und bei blur angewendet.
  $effect(() => {
    const content = workouts.tabs[workouts.activeTab]?.content ?? ''
    if (editorEl && !focused) setText(editorEl, content)
  })

  function onInput() {
    if (!editorEl) return
    if (getText(editorEl).trim() === '') editorEl.replaceChildren()
    workouts.setContent(workouts.activeTab, getText(editorEl))
  }

  function onFocus() {
    focused = true
  }

  function onBlur() {
    focused = false
    if (editorEl) setText(editorEl, workouts.tabs[workouts.activeTab]?.content ?? '')
  }

  function switchTab(i: number) {
    if (renamingTab >= 0) return
    workouts.switchTab(i)
  }

  async function startRename(i: number) {
    renamingTab = i
    renameValue = workouts.tabs[i].title
    await tick()
    renameInput?.select()
  }

  function commitRename(i: number) {
    workouts.renameTab(i, renameValue)
    renamingTab = -1
  }

  function onDragStart(i: number, e: DragEvent) {
    dragTab = i
    e.dataTransfer!.effectAllowed = 'move'
  }

  function onDrop(i: number) {
    if (dragTab === i || dragTab === -1) return
    workouts.reorderTabs(dragTab, i)
    dragTab = -1
    dragOverTab = -1
  }

  function confirmDelete() {
    if (pendingDelete === null) return
    workouts.removeTab(pendingDelete)
    pendingDelete = null
  }
</script>

<div class="workout-wrapper" data-tour="editor">
  <div class="tab-bar">
    {#each workouts.tabs as tab, i (tab.id)}
      <div
        class="tab"
        class:active={i === workouts.activeTab}
        class:drag-over={dragOverTab === i}
        draggable="true"
        role="tab"
        tabindex="-1"
        onclick={() => switchTab(i)}
        ondblclick={(e) => {
          e.stopPropagation()
          startRename(i)
        }}
        ondragstart={(e) => onDragStart(i, e)}
        ondragover={(e) => {
          e.preventDefault()
          dragOverTab = i
        }}
        ondragleave={() => (dragOverTab = -1)}
        ondrop={(e) => {
          e.preventDefault()
          onDrop(i)
        }}
        ondragend={() => (dragOverTab = -1)}
        onkeydown={() => {}}
      >
        {#if renamingTab === i}
          <input
            bind:this={renameInput}
            class="tab-rename"
            bind:value={renameValue}
            onblur={() => commitRename(i)}
            onkeydown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitRename(i)
              } else if (e.key === 'Escape') {
                renamingTab = -1
              }
            }}
            onclick={(e) => e.stopPropagation()}
          />
        {:else}
          <span class="tab-title">{tab.title}</span>
        {/if}
        {#if workouts.tabs.length > 1}
          <span
            class="tab-close"
            role="button"
            tabindex="-1"
            onclick={(e) => {
              e.stopPropagation()
              pendingDelete = i
            }}
            onkeydown={() => {}}>✕</span
          >
        {/if}
      </div>
    {/each}
    <button class="tab-add" onclick={() => workouts.addTab()}>+</button>
    <button
      class="tab-magic"
      data-tour="ai-generate"
      title="Workout mit AI erstellen"
      aria-label="Workout mit AI erstellen"
      onclick={openGenerate}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path
          d="M12 2l1.6 4.6L18 8.2l-4.4 1.6L12 14.4l-1.6-4.6L6 8.2l4.4-1.6L12 2zM19 13l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9L19 13zM5 14l.7 2 2 .7-2 .7L5 19.4l-.7-2-2-.7 2-.7L5 14z"
        />
      </svg>
    </button>
  </div>
  <div class="editor-area">
    <div
      bind:this={editorEl}
      class="workout-editor"
      contenteditable="true"
      spellcheck="false"
      data-placeholder="Workout eingeben..."
      oninput={onInput}
      onfocus={onFocus}
      onblur={onBlur}
      role="textbox"
      tabindex="0"
    ></div>
    {#if generating}
      <div class="gen-overlay">
        <span class="gen-phrase">{PHRASES[phraseIndex]}<span class="gen-dots"></span></span>
      </div>
    {/if}
    {#if genError}
      <div class="gen-error">{genError}</div>
    {/if}
  </div>
</div>

{#if pendingDelete !== null}
  <ConfirmDialog
    title="Workout löschen?"
    message={`„${workouts.tabs[pendingDelete]?.title ?? ''}" wird entfernt.`}
    onConfirm={confirmDelete}
    onCancel={() => (pendingDelete = null)}
  />
{/if}

{#if showGenerate}
  <GenerateDialog onSubmit={runGenerate} onCancel={() => (showGenerate = false)} />
{/if}

<style>
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
  .tab:hover {
    color: #999;
    background: #111;
  }
  .tab.active {
    color: #fff;
    background: #000;
    border-bottom: 1px solid #000;
  }
  .tab.drag-over {
    border-left: 2px solid #555;
  }
  .tab-title {
    pointer-events: none;
  }
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
  }
  .tab-close:hover {
    color: #e63946;
  }
  .tab-add {
    background: none;
    border: none;
    color: #444;
    font-size: 18px;
    cursor: pointer;
    padding: 0 14px;
    line-height: 1;
  }
  .tab-add:hover {
    color: #fff;
  }
  .editor-area {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow-y: auto;
    position: relative;
  }
  .tab-magic {
    background: none;
    border: none;
    color: #444;
    cursor: pointer;
    padding: 0 14px;
    line-height: 1;
    margin-left: auto;
    display: flex;
    align-items: center;
  }
  .tab-magic svg {
    width: 16px;
    height: 16px;
    display: block;
  }
  .tab-magic:hover {
    color: #fff;
  }
  .gen-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.85);
  }
  .gen-phrase {
    color: #7cc;
    font-family: 'JetBrains Mono', monospace;
    font-size: 22px;
    letter-spacing: 1px;
  }
  .gen-dots::after {
    content: '';
    animation: gen-dots 1.2s steps(4, end) infinite;
  }
  @keyframes gen-dots {
    0% {
      content: '';
    }
    25% {
      content: '.';
    }
    50% {
      content: '..';
    }
    75% {
      content: '...';
    }
  }
  .gen-error {
    position: absolute;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    color: #e63946;
    font-size: 12px;
    font-family: monospace;
    background: #1a1a1a;
    padding: 6px 12px;
    border-radius: 4px;
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
