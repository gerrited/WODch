<script lang="ts">
  import { timer } from '../stores/timer.svelte'
  import { applyModalStart, type ModalForm } from './modalStart'
  import type { IntervalPreset, TimerMode } from '../types'

  let { onClose }: { onClose: () => void } = $props()

  const modes: { value: TimerMode; label: string }[] = [
    { value: 'clock', label: 'Uhrzeit' },
    { value: 'stopwatch', label: 'Stoppuhr' },
    { value: 'countdown', label: 'Count-Down' },
    { value: 'countup', label: 'Count-Up' },
    { value: 'interval', label: 'Intervall' },
  ]

  const presets = $derived([
    { value: 'tabata' as IntervalPreset, label: 'Tabata (20s/10s × 8)' },
    { value: 'fgb1' as IntervalPreset, label: 'Fight Gone Bad 1 (5×5min)' },
    { value: 'fgb2' as IntervalPreset, label: 'Fight Gone Bad 2 (3×5min)' },
    { value: 'emom' as IntervalPreset, label: 'EMOM' },
    ...Array.from({ length: 10 }, (_, i) => ({
      value: `custom-${i}` as IntervalPreset,
      label: timer.customIntervals[i]?.name || `Custom ${i + 1}`,
    })),
  ])

  let selectedMode = $state(timer.doc.mode)
  let selectedPreset = $state<IntervalPreset | null>(timer.doc.preset)

  function splitMs(msValue: number): [number, number] {
    return [Math.floor(msValue / 60000), Math.floor((msValue % 60000) / 1000)]
  }

  let countdownMin = $state(splitMs(timer.doc.countdownTarget)[0])
  let countdownSec = $state(splitMs(timer.doc.countdownTarget)[1])
  let countupMin = $state(splitMs(timer.doc.countupStart)[0])
  let countupSec = $state(splitMs(timer.doc.countupStart)[1])
  let emomMin = $state(splitMs(timer.doc.emomInterval)[0])
  let emomSec = $state(splitMs(timer.doc.emomInterval)[1])
  let warmupMin = $state(splitMs(timer.doc.warmupDuration)[0])
  let warmupSec = $state(splitMs(timer.doc.warmupDuration)[1])
  let emomRounds = $state(timer.doc.emomRounds)
  let clock12h = $state(timer.doc.clock12h)
  let warmupEnabled = $state(timer.doc.warmupEnabled)

  const customSlot = $derived(
    selectedPreset?.startsWith('custom-') ? parseInt(selectedPreset.replace('custom-', ''), 10) : -1,
  )
  let customName = $state('')
  let customRounds = $state(5)
  let customWorkMin = $state(5)
  let customWorkSec = $state(0)
  let customRestMin = $state(1)
  let customRestSec = $state(0)

  // Beim Wechsel des Custom-Slots dessen gespeicherte Werte laden
  $effect(() => {
    if (customSlot < 0) return
    const ci = timer.customIntervals[customSlot]
    customName = ci?.name ?? ''
    customRounds = ci?.rounds ?? 5
    ;[customWorkMin, customWorkSec] = splitMs(ci?.workDuration ?? 300_000)
    ;[customRestMin, customRestSec] = splitMs(ci?.restDuration ?? 60_000)
  })

  function onModeChange() {
    timer.setMode(selectedMode)
    selectedPreset = null
  }

  function onPresetChange() {
    if (selectedPreset && !selectedPreset.startsWith('custom-')) timer.applyPreset(selectedPreset)
  }

  function buildForm(): ModalForm {
    return {
      mode: selectedMode,
      preset: selectedPreset,
      countdownMin, countdownSec,
      countupMin, countupSec,
      emomMin, emomSec,
      warmupMin, warmupSec,
      customName, customRounds,
      customWorkMin, customWorkSec,
      customRestMin, customRestSec,
    }
  }

  function handleStart() {
    timer.setConfig({ clock12h, warmupEnabled, emomRounds })
    applyModalStart(timer, buildForm())
    onClose()
  }

  // Events enden am Overlay — die UI dahinter darf nicht reagieren
  function onOverlayClick(e: MouseEvent) {
    e.stopPropagation()
    if (e.target === e.currentTarget) onClose()
  }
</script>

<div
  class="modal-overlay"
  onclick={onOverlayClick}
  onpointerdown={(e) => e.stopPropagation()}
  ontouchstart={(e) => e.stopPropagation()}
  role="presentation"
>
  <div class="modal">
    <button class="close-btn" onclick={onClose}>✕</button>

    <section class="section">
      <div class="label">MODUS</div>
      <div class="radio-group">
        {#each modes as m (m.value)}
          <label class="radio-label">
            <input type="radio" value={m.value} bind:group={selectedMode} onchange={onModeChange} />
            {m.label}
          </label>
        {/each}
      </div>
    </section>

    {#if selectedMode === 'countdown'}
      <section class="section">
        <div class="label">ZIEL-ZEIT</div>
        <div class="time-input-row">
          <input type="number" bind:value={countdownMin} min="0" max="99" class="time-input" /> Min
          <input type="number" bind:value={countdownSec} min="0" max="59" class="time-input" /> Sek
        </div>
      </section>
    {/if}

    {#if selectedMode === 'countup'}
      <section class="section">
        <div class="label">START-ZEIT</div>
        <div class="time-input-row">
          <input type="number" bind:value={countupMin} min="0" max="99" class="time-input" /> Min
          <input type="number" bind:value={countupSec} min="0" max="59" class="time-input" /> Sek
        </div>
      </section>
    {/if}

    {#if selectedMode === 'clock'}
      <section class="section">
        <div class="label">FORMAT</div>
        <div class="radio-group">
          <label class="radio-label"><input type="radio" value={false} bind:group={clock12h} /> 24h</label>
          <label class="radio-label"><input type="radio" value={true} bind:group={clock12h} /> 12h (AM/PM)</label>
        </div>
      </section>
    {/if}

    {#if selectedMode === 'interval'}
      <section class="section">
        <div class="label">PRESET</div>
        <div class="radio-group">
          {#each presets as p (p.value)}
            <label class="radio-label">
              <input type="radio" value={p.value} bind:group={selectedPreset} onchange={onPresetChange} />
              {p.label}
            </label>
          {/each}
        </div>
      </section>
    {/if}

    {#if selectedPreset === 'emom'}
      <section class="section">
        <div class="label">EMOM EINSTELLUNGEN</div>
        <div class="config-row">
          <span>Intervall</span>
          <div class="time-input-row">
            <input type="number" bind:value={emomMin} min="0" max="99" class="time-input" /> Min
            <input type="number" bind:value={emomSec} min="0" max="59" class="time-input" /> Sek
          </div>
        </div>
        <div class="config-row">
          <span>Runden</span>
          <input type="number" bind:value={emomRounds} min="1" max="99" class="time-input" />
        </div>
      </section>
    {/if}

    {#if selectedPreset?.startsWith('custom-')}
      <section class="section">
        <div class="label">CUSTOM INTERVAL</div>
        <div class="config-row">
          <span>Name</span>
          <input type="text" bind:value={customName} class="text-input" maxlength="20" />
        </div>
        <div class="config-row">
          <span>Runden</span>
          <input type="number" bind:value={customRounds} min="1" max="99" class="time-input" />
        </div>
        <div class="config-row">
          <span>Work</span>
          <div class="time-input-row">
            <input type="number" bind:value={customWorkMin} min="0" max="99" class="time-input" /> Min
            <input type="number" bind:value={customWorkSec} min="0" max="59" class="time-input" /> Sek
          </div>
        </div>
        <div class="config-row">
          <span>Rest</span>
          <div class="time-input-row">
            <input type="number" bind:value={customRestMin} min="0" max="99" class="time-input" /> Min
            <input type="number" bind:value={customRestSec} min="0" max="59" class="time-input" /> Sek
          </div>
        </div>
      </section>
    {/if}

    {#if selectedMode === 'interval'}
      <section class="section">
        <div class="label">WARMUP</div>
        <div class="config-row">
          <label class="radio-label">
            <input type="checkbox" bind:checked={warmupEnabled} /> Aktiviert
          </label>
          {#if warmupEnabled}
            <div class="time-input-row">
              <input type="number" bind:value={warmupMin} min="0" max="99" class="time-input" /> Min
              <input type="number" bind:value={warmupSec} min="0" max="59" class="time-input" /> Sek
            </div>
          {/if}
        </div>
      </section>
    {/if}

    <div class="controls">
      <button class="btn btn-primary" onclick={handleStart}>▶ Start</button>
      <button class="btn" onclick={() => timer.pause()} disabled={!timer.doc.isRunning}>⏸ Pause</button>
      <button class="btn" onclick={() => timer.reset()}>↺ Reset</button>
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    overscroll-behavior: contain;
    touch-action: none;
  }
  .modal {
    background: #111;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 24px;
    width: 420px;
    max-height: 90vh;
    overflow-y: auto;
    overscroll-behavior: contain;
    position: relative;
  }
  .close-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    background: none;
    border: none;
    color: #666;
    font-size: 16px;
    cursor: pointer;
    padding: 4px 8px;
  }
  .close-btn:hover {
    color: #fff;
  }
  .section {
    margin-bottom: 20px;
  }
  .label {
    font-size: 10px;
    letter-spacing: 3px;
    color: #666;
    margin-bottom: 8px;
  }
  .radio-group {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
  .radio-label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #ccc;
    font-size: 13px;
    cursor: pointer;
  }
  .time-input-row {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #888;
    font-size: 13px;
  }
  .time-input {
    width: 52px;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 4px;
    padding: 4px 8px;
    color: #fff;
    font-size: 14px;
    text-align: center;
  }
  .text-input {
    flex: 1;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 4px;
    padding: 4px 8px;
    color: #fff;
    font-size: 13px;
  }
  .config-row {
    display: flex;
    align-items: center;
    gap: 12px;
    color: #888;
    font-size: 13px;
    margin-bottom: 8px;
  }
  .config-row span {
    min-width: 60px;
  }
  .controls {
    display: flex;
    gap: 10px;
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid #222;
  }
  .btn {
    flex: 1;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 4px;
    color: #ccc;
    padding: 10px;
    font-size: 13px;
    cursor: pointer;
  }
  .btn:hover:not(:disabled) {
    background: #222;
    color: #fff;
  }
  .btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .btn-primary {
    background: #e63946;
    border-color: #e63946;
    color: #fff;
    font-weight: 700;
  }
  .btn-primary:hover {
    background: #c1121f;
    border-color: #c1121f;
  }
</style>
