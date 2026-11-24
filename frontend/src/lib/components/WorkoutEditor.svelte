<script lang="ts">
  import { tick } from 'svelte'
  import { workouts } from '../stores/workouts.svelte'
  import ConfirmDialog from './ConfirmDialog.svelte'
  import GenerateDialog from './GenerateDialog.svelte'
  import { requestWorkout, PHRASES, nextPhraseIndex } from '../generate/generate'
  import { estimateDuration, type EstimateTab, type DurationEstimate } from '../generate/estimate'
  import { requestTimer, planTimer } from '../generate/timerize'
  import { timer } from '../stores/timer.svelte'

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

  let estimating = $state(false)
  let estimate = $state<DurationEstimate | null>(null)
  let estimateError = $state<string | null>(null)
  let estimateStale = $state(false)
  let hasContent = $derived(workouts.tabs.some((t) => t.content.trim() !== ''))

  let timerizing = $state(false)
  let timerizeResult = $state<{ label: string } | { error: string } | null>(null)
  let activeHasContent = $derived((workouts.tabs[workouts.activeTab]?.content ?? '').trim() !== '')

  // KI leitet aus dem aktiven Tab die Timer-Einstellung ab (EMOM, AMRAP, For Time …).
  // Lokale Aktion über den Timer-Store → wird wie jede Einstellung an alle Geräte gesynct.
  async function runTimerize() {
    const content = workouts.tabs[workouts.activeTab]?.content.trim() ?? ''
    if (!content || timerizing) return
    closeEstimate()
    timerizeResult = null
    timerizing = true
    try {
      const suggestion = await requestTimer(content)
      const plan = planTimer(suggestion)
      if (plan.custom) timer.saveCustomInterval(plan.custom)
      timer.setConfig(plan.config)
      timerizeResult = { label: suggestion.label }
    } catch (e) {
      timerizeResult = { error: e instanceof Error ? e.message : 'Timer-Vorschlag fehlgeschlagen.' }
    } finally {
      timerizing = false
    }
  }

  function collectTabs(): EstimateTab[] {
    return workouts.tabs
      .filter((t) => t.content.trim() !== '')
      .map((t) => ({ title: t.title, content: t.content }))
  }

  async function runEstimate() {
    const tabs = collectTabs()
    if (tabs.length === 0 || estimating) return
    timerizeResult = null
    estimateError = null
    estimateStale = false
    estimating = true
    try {
      estimate = await estimateDuration(tabs)
    } catch (e) {
      estimate = null
      estimateError = e instanceof Error ? e.message : 'Schätzung fehlgeschlagen.'
    } finally {
      estimating = false
    }
  }

  function closeEstimate() {
    estimate = null
    estimateError = null
    estimateStale = false
  }

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
      const phases = await requestWorkout(prompt)
      workouts.applyGenerated(target, phases)
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
    if (estimate) estimateStale = true
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

<svelte:window
  onkeydown={(e) => {
    if (e.key !== 'Escape') return
    if (estimate || estimateError) closeEstimate()
    timerizeResult = null
  }}
  onpointerdown={(e) => {
    const target = e.target as HTMLElement | null
    if (estimate || estimateError) {
      if (!target?.closest('.estimate-popover') && !target?.closest('.tab-estimate')) closeEstimate()
    }
    if (timerizeResult) {
      if (!target?.closest('.timerize-popover') && !target?.closest('.tab-timerize')) timerizeResult = null
    }
  }}
/>

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
    <button class="tab-add" title="Neues Workout" aria-label="Neues Workout" onclick={() => workouts.addTab()}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
    <div class="tab-actions">
      <!-- Beide KI-Aktionen mit sichtbarem Text; bei schmalem Editor nur noch Icon (Container-Query) -->
      <button
        class="action-btn tab-magic"
        data-tour="ai-generate"
        title="Workout mit AI erstellen"
        aria-label="Generieren"
        onclick={openGenerate}
      >
        <svg class="sparkle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
        </svg>
        <span class="action-text">Generieren</span>
      </button>
      <button
        class="action-btn tint tab-estimate tab-timerize"
        title="Timer aus Workout einstellen"
        aria-label="Timer aus Workout"
        class:busy={timerizing}
        disabled={timerizing || !activeHasContent}
        onclick={runTimerize}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="12" cy="13" r="8" />
          <path d="M10.5 10v6l4.5-3z" fill="currentColor" stroke-linejoin="round" />
          <path d="M9 2h6" stroke-linecap="round" />
        </svg>
        <span class="action-text">Timer aus Workout</span>
      </button>
      <button
        class="icon-action tab-estimate"
        data-tour="estimate"
        title="Dauer schätzen"
        aria-label="Dauer schätzen"
        class:busy={estimating}
        disabled={estimating || !hasContent}
        onclick={runEstimate}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="12" cy="13" r="8" />
          <path d="M12 13V9" stroke-linecap="round" />
          <path d="M9 2h6" stroke-linecap="round" />
        </svg>
      </button>
    </div>
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
  {#if estimate || estimateError}
    <div class="estimate-popover" role="dialog" aria-label="Geschätzte Dauer">
      <button class="estimate-close" onclick={closeEstimate} aria-label="Schließen">✕</button>
      {#if estimateError}
        <div class="estimate-error">{estimateError}</div>
      {:else if estimate}
        <div class="estimate-total">~ {estimate.totalMinutes} Min</div>
        {#if estimateStale}
          <div class="estimate-stale">Text geändert — neu schätzen</div>
        {/if}
        {#if estimate.segments.length > 0}
          <div class="estimate-divider"></div>
          {#each estimate.segments as seg}
            <div class="estimate-seg">
              <span class="estimate-seg-label">{seg.label}</span>
              <span class="estimate-seg-min">~{seg.minutes} Min</span>
            </div>
          {/each}
        {/if}
      {/if}
    </div>
  {/if}
  {#if timerizeResult}
    <div class="estimate-popover timerize-popover" role="dialog" aria-label="Timer-Vorschlag">
      <button class="estimate-close" onclick={() => (timerizeResult = null)} aria-label="Schließen">✕</button>
      {#if 'error' in timerizeResult}
        <div class="estimate-error">{timerizeResult.error}</div>
      {:else}
        <div class="estimate-total">Timer eingestellt</div>
        {#if timerizeResult.label}
          <div class="estimate-seg"><span class="estimate-seg-label">{timerizeResult.label}</span></div>
        {/if}
        <div class="estimate-stale">Start per Klick auf die Timer-Leiste</div>
      {/if}
    </div>
  {/if}
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
    background: var(--bg);
    position: relative;
    container-type: inline-size;
  }
  .tab-bar {
    --toolbar-h: 56px;
    display: flex;
    align-items: stretch;
    gap: 2px;
    padding: 0 8px;
    background: var(--bg);
    border-bottom: 1px solid var(--line);
    flex-shrink: 0;
    overflow-x: auto;
    height: var(--toolbar-h);
    box-sizing: border-box;
    user-select: none;
  }
  /* Tabs in Mono: inaktiv gedimmt, aktiv hell + fett mit Lime-Unterstrich */
  .tab {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    cursor: pointer;
    color: var(--text-faint);
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    user-select: none;
    transition: color 0.15s;
  }
  /* Unterstrich innerhalb des Tabs: die Leiste hat overflow-x: auto (→ auch vertikal
     clippend), ein über den Rand ragender border-bottom wurde halb abgeschnitten */
  .tab::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 2px;
    background: transparent;
    transition: background-color 0.15s;
  }
  .tab:hover {
    color: var(--text);
  }
  .tab.active {
    color: var(--text);
    font-weight: 700;
  }
  .tab.active::after {
    background: var(--accent);
  }
  .tab.drag-over {
    box-shadow: inset 2px 0 0 var(--text-muted);
  }
  .tab-title {
    pointer-events: none;
  }
  .tab-rename {
    background: none;
    border: none;
    border-bottom: 1px solid var(--accent);
    color: var(--text);
    font-size: 13px;
    font-family: var(--font-mono);
    font-weight: 700;
    outline: none;
    width: 90px;
    padding: 0;
  }
  /* Schließen-Kreuz erst bei Hover/aktivem Tab zeigen — weniger Rauschen in der Leiste */
  .tab-close {
    color: var(--text-faint);
    font-size: 10px;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 4px;
    opacity: 0;
    transition: opacity 0.15s, color 0.15s;
  }
  .tab:hover .tab-close,
  .tab.active .tab-close {
    opacity: 1;
  }
  .tab-close:hover {
    color: var(--rest);
  }
  .tab-add,
  .icon-action {
    align-self: center;
    display: grid;
    place-items: center;
    width: var(--tap);
    height: var(--tap);
    flex-shrink: 0;
    background: none;
    border: none;
    border-radius: var(--radius);
    color: var(--text-faint);
    cursor: pointer;
    line-height: 1;
    transition: color 0.15s, background-color 0.15s;
  }
  .tab-add svg,
  .icon-action svg {
    width: 18px;
    height: 18px;
    display: block;
  }
  .tab-add:hover,
  .icon-action:hover:not(:disabled) {
    color: var(--text);
    background: var(--surface-hover);
  }
  /* Text-Buttons der Editor-Aktionen: Rahmen (Generieren) bzw. Lime-Tint (Timer aus Workout) */
  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    flex-shrink: 0;
    height: 40px;
    min-width: var(--tap);
    padding: 0 12px;
    font: 500 13px/1 var(--font-ui);
    color: var(--text-2);
    background: none;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-sm);
    cursor: pointer;
    white-space: nowrap;
    transition: border-color 0.15s, color 0.15s;
  }
  .action-btn svg {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
  }
  .action-btn .sparkle {
    color: var(--accent);
  }
  .action-btn:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--text-ghost);
  }
  .action-btn.tint {
    color: var(--accent-tint-text);
    background: var(--accent-tint-bg);
    border-color: var(--accent-tint-line);
  }
  .action-btn.tint:hover:not(:disabled) {
    color: var(--accent-tint-text);
    border-color: var(--accent);
  }
  .tab-add:focus-visible,
  .icon-action:focus-visible,
  .action-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  /* Schmaler Editor (Split klein gezogen, Handy): Aktionen nur als Icon */
  @container (max-width: 620px) {
    .action-text {
      display: none;
    }
    .action-btn {
      width: var(--tap);
      padding: 0;
    }
  }
  .editor-area {
    flex: 1;
    display: flex;
    align-items: safe center;
    justify-content: center;
    overflow-y: auto;
    position: relative;
  }
  .tab-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
    padding-left: 8px;
  }
  .tab-estimate:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .tab-estimate.busy {
    animation: estimate-pulse 1s ease-in-out infinite;
  }
  @keyframes estimate-pulse {
    0%,
    100% {
      opacity: 0.4;
    }
    50% {
      opacity: 1;
    }
  }
  .gen-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(10, 10, 11, 0.88);
  }
  .gen-phrase {
    color: var(--accent);
    font-family: var(--font-mono);
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
    color: var(--rest);
    font-size: 13px;
    font-family: var(--font-ui);
    background: var(--surface);
    border: 1px solid var(--line-strong);
    padding: 8px 14px;
    border-radius: var(--radius-sm);
  }
  .workout-editor {
    width: 100%;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 32px;
    line-height: 1.6;
    outline: none;
    padding: 20px;
    text-align: center;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .workout-editor:empty::before {
    content: attr(data-placeholder);
    color: var(--text-faint);
  }
  .estimate-popover {
    position: absolute;
    top: 62px;
    right: 8px;
    z-index: 50;
    background: var(--surface);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-lg);
    padding: 16px 18px;
    min-width: 240px;
    font-family: var(--font-mono);
    color: var(--text-2);
    text-align: left;
  }
  .estimate-close {
    position: absolute;
    top: 8px;
    right: 10px;
    background: none;
    border: none;
    color: var(--text-faint);
    font-size: 13px;
    cursor: pointer;
    padding: 2px 4px;
  }
  .estimate-close:hover {
    color: var(--text);
  }
  .estimate-total {
    color: var(--accent);
    font-size: 22px;
    letter-spacing: 1px;
  }
  .estimate-stale {
    color: var(--rest);
    font-size: 11px;
    margin-top: 4px;
  }
  .estimate-divider {
    border-top: 1px solid var(--line);
    margin: 12px 0 8px;
  }
  .estimate-seg {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    font-size: 13px;
    padding: 2px 0;
  }
  .estimate-seg-label {
    color: var(--text-muted);
  }
  .estimate-seg-min {
    color: var(--text-2);
  }
  .estimate-error {
    color: var(--rest);
    font-size: 13px;
  }
  .timerize-popover .estimate-total {
    font-size: 17px;
    padding-right: 20px;
  }
</style>
