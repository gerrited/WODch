<script lang="ts">
  import { timer } from '../stores/timer.svelte'
  import { counter } from '../stores/counter.svelte'
  import { session } from '../sync/session.svelte'
  import { sound } from '../audio/beeps.svelte'
  import { phaseInfo } from '../timer/phaseInfo'
  import type { IntervalPreset, TimerMode } from '../types'
  import { barAction } from './barAction'
  import Logo from './Logo.svelte'
  import ConfirmDialog from './ConfirmDialog.svelte'

  // Handy als Fernbedienung: große Ziele für den Daumen, ausschließlich vorhandene
  // Store-APIs — alles Weitere (Sync an den Screen in der Box) erledigt der Session-Layer.
  let { onOpenModal, onStartTour }: { onOpenModal: () => void; onStartTour: () => void } = $props()

  const info = $derived(phaseInfo(timer.doc, timer.derived, timer.elapsed, new Date(timer.now)))
  const started = $derived(timer.doc.isRunning || timer.doc.accumulatedMs > 0)
  const paused = $derived(started && !timer.doc.isRunning && timer.derived.phase !== 'done')

  const connection = $derived.by(() => {
    if (session.status === 'connected') {
      return { ok: true, text: session.peers > 1 ? `Verbunden · ${session.peers} Geräte` : 'Verbunden' }
    }
    if (session.status === 'error') return { ok: false, text: 'Verbindungsfehler' }
    return { ok: false, text: 'Nicht verbunden' }
  })

  type QuickStart = { id: string; label: string; preset?: IntervalPreset; mode?: TimerMode }
  const quickStarts: QuickStart[] = [
    { id: 'emom', label: 'EMOM', preset: 'emom' },
    { id: 'tabata', label: 'Tabata', preset: 'tabata' },
    { id: 'countdown', label: 'Count-Down', mode: 'countdown' },
    // For Time = hochzählen bis das Workout fertig ist
    { id: 'fortime', label: 'For Time', mode: 'countup' },
  ]

  function isActive(q: QuickStart): boolean {
    if (q.preset) return timer.doc.mode === 'interval' && timer.doc.preset === q.preset
    return timer.doc.mode === q.mode
  }

  // Große Buttons trifft der Daumen leicht — Laufendes nur nach Rückfrage verwerfen
  let pending = $state<{ title: string; message: string; confirmLabel: string; run: () => void } | null>(null)

  function guarded(title: string, message: string, confirmLabel: string, run: () => void) {
    if (started) pending = { title, message, confirmLabel, run }
    else run()
  }

  function confirmPending() {
    pending?.run()
    pending = null
  }

  function resetAll() {
    timer.reset()
    counter.reset()
  }

  function onReset() {
    guarded('Timer zurücksetzen?', 'Zeit und Rundenzähler starten von vorn — auf allen Geräten.', 'Zurücksetzen', resetAll)
  }

  function onStartPause() {
    sound.unlock()
    // Uhrzeit läuft immer — dort führt „Start“ zur Modus-Wahl
    if (timer.doc.mode === 'clock') return onOpenModal()
    if (timer.derived.phase === 'done') timer.reset()
    timer.toggle()
  }

  // Tipp auf die Zeitkarte verhält sich wie ein Klick auf die Timer-Leiste
  function onCardTap() {
    sound.unlock()
    if (barAction(timer.doc, timer.derived) === 'modal') onOpenModal()
    else timer.toggle()
  }

  function quickStart(q: QuickStart) {
    guarded(`${q.label} starten?`, 'Der laufende Timer wird ersetzt.', 'Starten', () => {
      sound.unlock()
      if (q.preset) timer.applyPreset(q.preset)
      else if (q.mode) timer.setMode(q.mode)
      counter.reset()
      timer.start()
    })
  }

  // Session-Link: gleiche Logik wie der Teilen-Button (kopieren bzw. erst erzeugen)
  let copied = $state(false)
  let copiedTimer: ReturnType<typeof setTimeout> | undefined
  const shareText = $derived(session.id ? `${location.host}/l/${session.id}` : 'Noch keine Session')

  async function copyLink() {
    if (session.id) await session.copyLink()
    else await session.create()
    copied = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => (copied = false), 2000)
  }

  $effect(() => () => clearTimeout(copiedTimer))
</script>

<div class="remote">
  <header class="head">
    <Logo size="76px" />
    <div class="head-right">
      <span class="conn" class:ok={connection.ok}><span class="dot" aria-hidden="true"></span>{connection.text}</span>
      <button class="help" data-tour="help" onclick={onStartTour} aria-label="Tour starten" title="Tour starten">?</button>
    </div>
  </header>

  <button
    class="card tone-{info.tone}"
    data-tour="timer-bar"
    onclick={onCardTap}
    aria-label="{info.label}, {timer.displayTime}"
  >
    <span class="phase">{paused ? 'Pausiert' : info.label}</span>
    <span class="time" class:long={timer.displayTime.length > 5}>{timer.displayTime}</span>
    <span class="bar" aria-hidden="true"><span class="bar-fill" style="transform: scaleX({info.progress})"></span></span>
    <span class="hint">Läuft synchron auf dem Screen in der Box</span>
  </button>

  <div class="controls">
    <button class="ctl" onclick={onReset}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.8L3 8" /><path d="M3 3v5h5" />
      </svg>
      Reset
    </button>
    <button class="ctl primary" class:paused onclick={onStartPause}>
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        {#if timer.doc.isRunning}
          <rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" />
        {:else}
          <path d="M7 5v14l12-7z" />
        {/if}
      </svg>
      {timer.doc.isRunning ? 'Pause' : 'Start'}
    </button>
    <button class="ctl" data-tour="gear" onclick={onOpenModal}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
        <circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" />
      </svg>
      Modus
    </button>
  </div>

  <div class="counter">
    <button class="count-btn" onclick={() => counter.decrement()} disabled={counter.count === 0} aria-label="Runde abziehen">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M5 12h14" /></svg>
    </button>
    <div class="count" aria-live="polite">
      <span class="count-label">Runden</span>
      <span class="count-value">{counter.count}</span>
    </div>
    <button class="count-btn plus" onclick={() => counter.increment()} aria-label="Runde zählen">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
    </button>
  </div>

  <section class="quick" aria-labelledby="quick-title">
    <h2 id="quick-title" class="quick-title">Schnellstart</h2>
    <div class="chips">
      {#each quickStarts as q (q.id)}
        <button class="chip" class:active={isActive(q)} onclick={() => quickStart(q)}>{q.label}</button>
      {/each}
    </div>
  </section>

  <footer class="share">
    <div class="share-info">
      <span class="share-label">Session-Link</span>
      <span class="share-url">{shareText}</span>
    </div>
    <button class="copy" data-tour="share" onclick={copyLink}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        {#if copied}
          <path d="M5 12l5 5L20 7" stroke-linecap="round" stroke-linejoin="round" />
        {:else}
          <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" />
        {/if}
      </svg>
      {copied ? 'Kopiert' : session.id ? 'Kopieren' : 'Erstellen'}
    </button>
  </footer>
</div>

{#if pending}
  <ConfirmDialog
    title={pending.title}
    message={pending.message}
    confirmLabel={pending.confirmLabel}
    onConfirm={confirmPending}
    onCancel={() => (pending = null)}
  />
{/if}

<style>
  .remote {
    height: 100%;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 16px 20px 20px;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-ui);
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: -10px 0 -10px -14px;
  }
  .head-right {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .conn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 7px 12px;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-muted);
    white-space: nowrap;
    border: 1px solid #26262b;
    border-radius: 999px;
  }
  .dot {
    flex-shrink: 0;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text-ghost);
  }
  .conn.ok .dot {
    background: var(--accent);
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }
  .help {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: var(--tap);
    height: var(--tap);
    font-size: 17px;
    font-weight: 600;
    color: var(--text-muted);
    background: none;
    border: none;
    border-radius: var(--radius);
  }

  /* Zeitkarte: Phasenfarbe wie in der Timer-Leiste */
  .card {
    --phase: var(--text-muted);
    --digits: var(--text);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 22px 20px 20px;
    color: inherit;
    text-align: center;
    background: var(--surface);
    border: 1px solid #26262b;
    border-radius: 20px;
    container-type: inline-size;
  }
  .card.tone-work,
  .card.tone-done {
    --phase: var(--accent);
  }
  .card.tone-rest {
    --phase: var(--rest);
    --digits: var(--rest);
  }
  .card.tone-paused {
    --phase: var(--rest);
    --digits: var(--text-faint);
  }
  .phase {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--phase);
  }
  .time {
    font-family: var(--font-mono);
    font-weight: 800;
    font-size: min(84px, 26cqw);
    line-height: 1.05;
    letter-spacing: -0.035em;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    color: var(--digits);
  }
  .time.long {
    font-size: min(84px, 16cqw);
  }
  .bar {
    display: block;
    width: 100%;
    height: 6px;
    margin-top: 8px;
    background: var(--line);
    border-radius: 3px;
    overflow: hidden;
  }
  .bar-fill {
    display: block;
    height: 100%;
    background: var(--phase);
    transform-origin: left center;
  }
  .hint {
    margin-top: 8px;
    font-size: 13px;
    color: var(--text-faint);
  }

  .controls {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .ctl {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 88px;
    font-size: 13px;
    color: var(--text-2);
    background: none;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-xl);
  }
  .ctl svg {
    width: 22px;
    height: 22px;
  }
  .ctl.primary {
    font-weight: 600;
    color: var(--accent-ink);
    background: var(--accent);
    border-color: var(--accent);
  }
  .ctl.primary.paused {
    background: var(--rest);
    border-color: var(--rest);
  }
  .ctl.primary svg {
    width: 24px;
    height: 24px;
  }

  .counter {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px;
    border: 1px solid #26262b;
    border-radius: var(--radius-xl);
  }
  .count-btn {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: 64px;
    height: 64px;
    color: var(--text-muted);
    background: none;
    border: 1px solid var(--line-strong);
    border-radius: 14px;
  }
  .count-btn svg {
    width: 22px;
    height: 22px;
  }
  .count-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .count-btn.plus {
    color: var(--accent-ink);
    background: var(--accent);
    border-color: var(--accent);
  }
  .count {
    display: flex;
    flex-direction: column;
    align-items: center;
    font-family: var(--font-mono);
  }
  .count-label {
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .count-value {
    font-size: 44px;
    font-weight: 800;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  .quick-title {
    margin-bottom: 10px;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .chip {
    height: var(--tap);
    padding: 0 14px;
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--text-2);
    background: none;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
  }
  .chip.active {
    color: var(--accent-tint-text);
    background: var(--accent-tint-bg);
    border-color: var(--accent-tint-line);
  }

  .share {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: auto;
    padding-top: 16px;
    border-top: 1px solid var(--line);
  }
  .share-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .share-label {
    font-size: 12px;
    color: var(--text-faint);
  }
  .share-url {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: 14px;
  }
  .copy {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    height: var(--tap);
    padding: 0 16px;
    font-size: 14px;
    font-weight: 500;
    color: var(--text);
    background: none;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
  }
  .copy svg {
    width: 16px;
    height: 16px;
  }

  @media (prefers-reduced-motion: reduce) {
    .conn.ok .dot {
      animation: none;
    }
  }
</style>
