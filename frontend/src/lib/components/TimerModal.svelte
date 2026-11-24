<script lang="ts">
  import { timer } from '../stores/timer.svelte'
  import { counter } from '../stores/counter.svelte'
  import { sound } from '../audio/beeps.svelte'
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

  const presets: { value: IntervalPreset; label: string }[] = [
    { value: 'emom', label: 'EMOM' },
    { value: 'fgb1', label: 'Fight Gone Bad (3 × 5min / 1min)' },
    { value: 'tabata', label: 'Tabata (20s/10s × 8)' },
    { value: 'custom', label: 'Custom' },
  ]

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

  // Das Modal wird pro Öffnen neu gemountet (App.svelte: {#if showModal}),
  // deshalb genügt eine Initialisierung aus den gespeicherten Werten.
  const storedCustom = timer.customInterval
  let customRounds = $state(storedCustom?.rounds ?? 5)
  let customWorkMin = $state(splitMs(storedCustom?.workDuration ?? 300_000)[0])
  let customWorkSec = $state(splitMs(storedCustom?.workDuration ?? 300_000)[1])
  let customRestMin = $state(splitMs(storedCustom?.restDuration ?? 60_000)[0])
  let customRestSec = $state(splitMs(storedCustom?.restDuration ?? 60_000)[1])

  function onModeChange() {
    timer.setMode(selectedMode)
    selectedPreset = null
  }

  function onPresetChange() {
    if (selectedPreset && selectedPreset !== 'custom') timer.applyPreset(selectedPreset)
  }

  function buildForm(): ModalForm {
    return {
      mode: selectedMode,
      preset: selectedPreset,
      countdownMin, countdownSec,
      countupMin, countupSec,
      emomMin, emomSec,
      warmupMin, warmupSec,
      customRounds,
      customWorkMin, customWorkSec,
      customRestMin, customRestSec,
    }
  }

  function handleStart() {
    timer.setConfig({ clock12h, warmupEnabled, emomRounds })
    applyModalStart(timer, buildForm())
    // Neuer Durchgang → Rundenzähler von vorn
    counter.reset()
    onClose()
  }

  function handleReset() {
    timer.reset()
    counter.reset()
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
  <div class="modal" role="dialog" aria-modal="true" aria-label="Timer-Einstellungen">
    <button class="close-btn" onclick={onClose} aria-label="Schließen">✕</button>
    <div class="title">Timer-Einstellungen</div>

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

    {#if selectedPreset === 'custom'}
      <section class="section">
        <div class="label">CUSTOM INTERVAL</div>
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

    {#if selectedMode !== 'clock'}
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

    {#if sound.canSpeak || sound.canVibrate}
      <section class="section">
        <div class="label">DIESES GERÄT</div>
        <div class="radio-group">
          {#if sound.canSpeak}
            <label class="radio-label">
              <input type="checkbox" checked={sound.voice} onchange={(e) => sound.setVoice(e.currentTarget.checked)} />
              Sprachansagen
            </label>
          {/if}
          {#if sound.canVibrate}
            <label class="radio-label">
              <input type="checkbox" checked={sound.vibrate} onchange={(e) => sound.setVibrate(e.currentTarget.checked)} />
              Vibration
            </label>
          {/if}
        </div>
      </section>
    {/if}

    <div class="controls">
      <button class="btn btn-primary" onclick={handleStart}>▶ Start</button>
      <button class="btn" onclick={() => timer.pause()} disabled={!timer.doc.isRunning}>⏸ Pause</button>
      <button class="btn" onclick={handleReset}>↺ Reset</button>
    </div>
  </div>
</div>

<style>
  /* Dialog-Grundstil des Redesigns: Overlay 70 %, Panel --surface, Radius 16px */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    z-index: 100;
    overscroll-behavior: contain;
    touch-action: none;
  }
  .modal {
    position: relative;
    width: 440px;
    max-width: 100%;
    background: var(--surface);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-lg);
    padding: 24px;
    max-height: 90vh;
    overflow-y: auto;
    overscroll-behavior: contain;
    color: var(--text);
    font-family: var(--font-ui);
    text-align: left;
  }
  .close-btn {
    position: absolute;
    top: 10px;
    right: 10px;
    display: grid;
    place-items: center;
    width: var(--tap);
    height: var(--tap);
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--text-faint);
    font-size: 16px;
    cursor: pointer;
  }
  .close-btn:hover {
    color: var(--text);
    background: var(--surface-hover);
  }
  .title {
    padding-right: 40px;
    margin-bottom: 8px;
    font-size: 20px;
    font-weight: 600;
    line-height: 1.3;
    color: var(--text);
  }
  .btn {
    min-height: var(--tap);
    padding: 0 18px;
    font: 500 14px/1 var(--font-ui);
    color: var(--text);
    background: none;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    cursor: pointer;
    transition: border-color 0.15s, background-color 0.15s;
  }
  .btn:hover:not(:disabled) {
    border-color: var(--text-ghost);
  }
  .btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  /* Primär = Lime mit dunkler Schrift */
  .btn-primary {
    font-weight: 600;
    color: var(--accent-ink);
    background: var(--accent);
    border-color: var(--accent);
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
  }
  .btn:focus-visible,
  .close-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .title {
    margin-bottom: 20px;
  }
  .section {
    margin-bottom: 22px;
  }
  .label {
    margin-bottom: 10px;
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.18em;
    color: var(--text-faint);
  }
  .radio-group {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
  }
  .radio-label {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    color: var(--text-2);
    font-size: 14px;
    cursor: pointer;
  }
  .radio-label input[type='checkbox'] {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
  }
  /* Auswahl (Modus, Preset, Format) als Chips im Lime-Tint-Stil der Landing-Page */
  .radio-group:has(input[type='radio']) {
    gap: 8px;
  }
  .radio-label:has(input[type='radio']) {
    position: relative;
    min-height: 40px;
    padding: 0 14px;
    font-family: var(--font-mono);
    font-size: 13px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    transition: border-color 0.15s, color 0.15s, background-color 0.15s;
  }
  .radio-label:has(input[type='radio']):hover {
    color: var(--text);
    border-color: var(--text-ghost);
  }
  .radio-label input[type='radio'] {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .radio-label:has(input[type='radio']:checked) {
    color: var(--accent-tint-text);
    background: var(--accent-tint-bg);
    border-color: var(--accent-tint-line);
  }
  .radio-label:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .time-input-row {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
    font-size: 13px;
  }
  .time-input {
    width: 60px;
    height: 40px;
    background: var(--surface-2);
    border: 1px solid #26262b;
    border-radius: var(--radius-sm);
    padding: 0 8px;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 15px;
    text-align: center;
    outline: none;
  }
  .time-input:focus-visible {
    border-color: var(--accent);
  }
  .config-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    color: var(--text-muted);
    font-size: 14px;
    margin-bottom: 10px;
  }
  .config-row span {
    min-width: 60px;
  }
  .controls {
    display: flex;
    gap: 10px;
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid var(--line);
  }
  .controls .btn {
    flex: 1;
  }
</style>
