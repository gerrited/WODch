<script lang="ts">
  import { timer } from '../stores/timer.svelte'
  import { session } from '../sync/session.svelte'
  import { phaseInfo } from '../timer/phaseInfo'
  import { barAction } from './barAction'
  import Logo from './Logo.svelte'
  import ShareButton from './ShareButton.svelte'
  import { sound } from '../audio/beeps.svelte'
  import { counter } from '../stores/counter.svelte'

  let { onOpenModal, onStartTour }: { onOpenModal: () => void; onStartTour: () => void } = $props()

  const dotClass = $derived.by(() => {
    if (!session.id) return 'dot-off'
    if (session.status === 'connected') return 'dot-ok'
    if (session.status === 'error') return 'dot-error'
    return 'dot-off'
  })

  const connectionText = $derived.by(() => {
    if (session.peers > 1) return `${session.peers} Geräte verbunden`
    if (dotClass === 'dot-ok') return 'Verbunden'
    if (dotClass === 'dot-error') return 'Verbindungsfehler'
    return 'Nicht verbunden'
  })

  // Label, Farbton und Fortschritt werden lokal abgeleitet — nichts davon wird synchronisiert
  const info = $derived(phaseInfo(timer.doc, timer.derived, timer.elapsed, new Date(timer.now)))

  function handleClick(e: MouseEvent) {
    // Fehltipps neben die Zähler-Buttons sollen den Timer nicht starten/pausieren
    if (e.target instanceof Element && e.target.closest('.counter')) return
    sound.unlock()
    if (barAction(timer.doc, timer.derived) === 'modal') onOpenModal()
    else timer.toggle()
  }

  function handleGear(e: MouseEvent) {
    e.stopPropagation()
    onOpenModal()
  }

  function handleMute(e: MouseEvent) {
    e.stopPropagation()
    sound.unlock()
    sound.toggleMuted()
  }

  // Zähler-Buttons liegen auf der Timer-Leiste — Klicks dürfen nicht Start/Pause auslösen
  function handleCount(e: MouseEvent, delta: 1 | -1) {
    e.stopPropagation()
    if (delta === 1) counter.increment()
    else counter.decrement()
  }

  function handleHelp(e: MouseEvent) {
    e.stopPropagation()
    onStartTour()
  }
</script>

<div class="timer-bar tone-{info.tone}" data-tour="timer-bar" onclick={handleClick} role="button" tabindex="-1" onkeydown={() => {}}>
  <div class="row">
    <div class="brand">
      <Logo />
      <span class="conn" class:pill={session.peers > 1} title={connectionText} aria-label={connectionText}>
        <span class="connection-dot {dotClass}"></span>
        {#if session.peers > 1}<span class="peers">{session.peers} Geräte</span>{/if}
      </span>
    </div>

    <div class="timer-center">
      <span class="phase">{info.label}</span>
      <span class="time" class:long={timer.displayTime.length > 5}>{timer.displayTime}</span>
    </div>

    <div class="actions">
      <div class="counter" title="Runden zählen (+/−) — gilt für alle Geräte der Session">
        <button class="count-btn" onclick={(e) => handleCount(e, -1)} disabled={counter.count === 0} aria-label="Runde abziehen">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M5 12h14" /></svg>
        </button>
        <span class="count" aria-label="Gezählte Runden">
          <span class="count-heading" aria-hidden="true">Runde</span>
          <span class="count-value">{counter.count}</span>
        </span>
        <button class="count-btn plus" onclick={(e) => handleCount(e, 1)} aria-label="Runde zählen">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>
      <button class="icon-btn mute" onclick={handleMute} title={sound.muted ? 'Ton einschalten' : 'Ton ausschalten'} aria-label={sound.muted ? 'Ton einschalten' : 'Ton ausschalten'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M11 5L6 9H3v6h3l5 4z" />
          {#if sound.muted}
            <path d="M22 9l-6 6M16 9l6 6" />
          {:else}
            <path d="M16 9a4 4 0 010 6M19 6a8 8 0 010 12" />
          {/if}
        </svg>
      </button>
      <button class="icon-btn" data-tour="gear" onclick={handleGear} title="Timer-Einstellungen" aria-label="Timer-Einstellungen">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
          <circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" />
        </svg>
      </button>
      <ShareButton />
      <button class="icon-btn help" data-tour="help" onclick={handleHelp} title="Tour starten" aria-label="Tour starten">?</button>
    </div>
  </div>
  <div class="progress" aria-hidden="true">
    <div class="progress-fill" style="transform: scaleX({info.progress})"></div>
  </div>
</div>

<style>
  .timer-bar {
    /* Phasenfarbe: Lime = Arbeit, Orange = Pause/pausiert */
    --phase: var(--text-muted);
    --digits: var(--text);
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg-band);
    cursor: pointer;
    user-select: none;
  }
  .tone-work {
    --phase: var(--accent);
  }
  .tone-rest {
    --phase: var(--rest);
    --digits: var(--rest);
  }
  .tone-paused {
    --phase: var(--rest);
    --digits: var(--text-faint);
  }
  .tone-done {
    --phase: var(--accent);
  }

  /* Container für die Ziffern-Skalierung (cqh/cqw) — wächst mit der ziehbaren Leiste */
  .row {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 16px;
    padding: 0 20px;
    container-type: size;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  .conn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    padding: 6px;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-muted);
    border: 1px solid transparent;
    border-radius: 999px;
  }
  /* Pill erst ab zwei Geräten — vorher genügt der Punkt */
  .conn.pill {
    padding: 6px 12px;
    border-color: #26262b;
  }
  .connection-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    transition: background-color 0.3s;
  }
  .dot-off {
    background: var(--text-ghost);
  }
  .dot-ok {
    background: var(--accent);
    animation: pulse 2s infinite;
  }
  .dot-error {
    background: var(--rest);
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

  .timer-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }
  .phase {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: clamp(11px, 9cqh, 16px);
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--phase);
    transition: color 0.3s;
  }
  .time {
    /* cqw-Deckel: bei schmaler Leiste begrenzt die Breite, nicht die Höhe */
    font-size: clamp(28px, min(62cqh, 10cqw), 9999px);
    line-height: 1;
    font-weight: 800;
    letter-spacing: -0.03em;
    color: var(--digits);
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    transition: color 0.3s;
  }
  /* Uhrzeit, Stunden, Hundertstel: mehr Zeichen → schmaler deckeln */
  .time.long {
    font-size: clamp(28px, min(62cqh, 6.2cqw), 9999px);
  }

  .actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    min-width: 0;
  }
  .icon-btn {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: var(--tap);
    height: var(--tap);
    background: none;
    border: none;
    border-radius: var(--radius);
    color: var(--text-muted);
    cursor: pointer;
    line-height: 0;
    transition:
      color 0.15s,
      background-color 0.15s;
  }
  .icon-btn svg {
    width: 20px;
    height: 20px;
  }
  .icon-btn:hover {
    color: var(--text);
    background: var(--surface-hover);
  }
  .help {
    font-family: var(--font-ui);
    font-size: 17px;
    font-weight: 600;
    line-height: 1;
  }
  .actions :global(.share-btn) {
    margin: 0 4px;
  }

  /* Rundenzähler als Segmentgruppe [−] Runde n [+] */
  .counter {
    display: flex;
    align-items: stretch;
    flex-shrink: 0;
    margin-right: 8px;
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    overflow: hidden;
    cursor: default;
  }
  .count-btn {
    display: grid;
    place-items: center;
    width: var(--tap);
    height: 48px;
    padding: 0;
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    transition:
      color 0.15s,
      background-color 0.15s;
  }
  .count-btn svg {
    width: 18px;
    height: 18px;
  }
  .count-btn:hover:not(:disabled) {
    color: var(--text);
    background: var(--surface-hover);
  }
  .count-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .count-btn.plus {
    color: var(--accent-ink);
    background: var(--accent);
  }
  .count-btn.plus:hover {
    color: var(--accent-ink);
    background: var(--accent-hover);
  }
  .count {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 56px;
    padding: 0 10px;
    font-family: var(--font-mono);
  }
  .count-heading {
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .count-value {
    font-size: 22px;
    font-weight: 800;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  .icon-btn:focus-visible,
  .count-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* 4px-Fortschritt der aktuellen Phase (bzw. Minute) über die volle Breite */
  .progress {
    flex-shrink: 0;
    height: 4px;
    background: #1a1a1d;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: var(--phase);
    transform-origin: left center;
    transition: background-color 0.3s;
  }

  /* Schmale Leiste: Text-Zusätze weg, damit Zeit und Aktionen nicht kollidieren */
  @container (max-width: 1180px) {
    .actions :global(.share-text),
    .count-heading,
    .peers {
      display: none;
    }
    .actions :global(.share-btn) {
      width: var(--tap);
      padding: 0;
      justify-content: center;
    }
  }
  @container (max-width: 820px) {
    .conn.pill {
      padding: 6px;
      border-color: transparent;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dot-ok {
      animation: none;
    }
  }
</style>
