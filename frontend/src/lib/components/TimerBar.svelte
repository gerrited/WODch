<script lang="ts">
  import { timer } from '../stores/timer.svelte'
  import { session } from '../sync/session.svelte'
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

  // AMRAP vorbei: statt „ZEIT" das Ergebnis aus dem Rundenzähler zeigen
  const roundLabel = $derived(
    timer.doc.mode === 'amrap' && timer.derived.phase === 'done' && counter.count > 0
      ? `${counter.count} ${counter.count === 1 ? 'RUNDE' : 'RUNDEN'}`
      : timer.displayRound,
  )

  function handleClick(e: MouseEvent) {
    // Fehltipps neben die (mobil großen) Zähler-Buttons sollen den Timer nicht starten/pausieren
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

<div class="timer-bar" data-tour="timer-bar" onclick={handleClick} role="button" tabindex="-1" onkeydown={() => {}}>
  <div class="brand">
    <Logo />
    <span class="connection-dot {dotClass}"></span>
    {#if session.peers > 1}
      <span class="peers" title="{session.peers} Geräte verbunden" aria-label="{session.peers} Geräte verbunden">
        {session.peers}
      </span>
    {/if}
  </div>
  <div class="timer-center">
    <div class="timer-line">
      {#if roundLabel}
        <span class="round">{roundLabel}</span>
      {/if}
      <span class="time" class:work={timer.derived.phase === 'work'} class:rest={timer.derived.phase === 'rest'} class:warmup={timer.derived.phase === 'warmup'}>
        {timer.displayTime}
      </span>
    </div>
    <div class="counter" title="Runden zählen (+/−) — gilt für alle Geräte der Session">
      <button class="count-btn" onclick={(e) => handleCount(e, -1)} disabled={counter.count === 0} aria-label="Runde abziehen">−</button>
      <span class="count" aria-label="Gezählte Runden"><span class="count-label">R&nbsp;</span><span class="count-heading">Runden</span>{counter.count}</span>
      <button class="count-btn" onclick={(e) => handleCount(e, 1)} aria-label="Runde zählen">+</button>
    </div>
  </div>
  <div class="actions">
    <button class="icon-btn mute" onclick={handleMute} title={sound.muted ? 'Ton einschalten' : 'Ton ausschalten'} aria-label={sound.muted ? 'Ton einschalten' : 'Ton ausschalten'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        {#if sound.muted}
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        {:else}
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        {/if}
      </svg>
    </button>
    <button class="icon-btn" data-tour="gear" onclick={handleGear} title="Timer-Einstellungen" aria-label="Timer-Einstellungen">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </button>
    <ShareButton />
    <button class="icon-btn help" data-tour="help" onclick={handleHelp} title="Tour starten" aria-label="Tour starten">?</button>
  </div>
</div>

<style>
  .timer-bar {
    position: relative;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
    cursor: pointer;
    user-select: none;
    container-type: size;
    transition: background-color 0.2s;
  }
  .timer-bar:hover {
    background: #0f0f11;
  }
  /* Zähler sitzt direkt unter der Zeit — Zeit leicht kleiner, damit beides in die Leiste passt */
  .timer-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .timer-line {
    display: flex;
    align-items: baseline;
    gap: 24px;
  }
  .round {
    /* cqw-Deckel: im mobilen Vollbild begrenzt die Breite, nicht die Höhe */
    font-size: clamp(14px, min(22cqh, 6cqw), 9999px);
    color: var(--text-muted);
    letter-spacing: 0.08em;
    font-weight: 500;
  }
  .time {
    font-size: clamp(28px, min(48cqh, 12cqw), 9999px);
    line-height: 1;
    font-weight: 700;
    color: var(--text);
    letter-spacing: 0.02em;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    transition: color 0.3s;
  }
  .time.work {
    color: #ff4d5e;
  }
  .time.rest {
    color: #2dd36f;
  }
  .time.warmup {
    color: #f5b700;
  }
  .brand {
    position: absolute;
    left: 16px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .connection-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    transition: background-color 0.3s, box-shadow 0.3s;
  }
  .dot-off {
    background: var(--text-faint);
  }
  .dot-ok {
    background: #2dd36f;
    box-shadow: 0 0 0 3px rgba(45, 211, 111, 0.15);
  }
  .dot-error {
    background: #ff4d5e;
    box-shadow: 0 0 0 3px rgba(255, 77, 94, 0.15);
  }
  .peers {
    margin-left: -4px;
    color: #2dd36f;
    font-family: var(--font-ui);
    font-size: 12px;
    font-weight: 600;
  }
  /* Alle Icon-Aktionen als eine ruhige Gruppe — keine Einzel-Offsets mehr pflegen */
  /* Zentrierung über top/bottom statt transform: das ShareModal darin ist position: fixed,
     ein transform würde es an diese Gruppe statt an den Viewport binden */
  .actions {
    position: absolute;
    right: 12px;
    top: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .actions :global(.icon-btn) {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    background: none;
    border: none;
    border-radius: var(--radius);
    color: var(--text-faint);
    cursor: pointer;
    line-height: 0;
    transition: color 0.15s, background-color 0.15s;
  }
  .actions :global(.icon-btn svg) {
    width: 20px;
    height: 20px;
  }
  .actions :global(.icon-btn:hover) {
    color: var(--text);
    background: var(--surface-hover);
  }
  .actions :global(.icon-btn:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .help {
    font-family: var(--font-ui);
    font-size: 16px;
    font-weight: 600;
    line-height: 1;
  }
  .counter {
    display: flex;
    align-items: center;
    gap: 4px;
    font-family: var(--font-mono);
  }
  .count {
    color: var(--text-muted);
    font-size: clamp(12px, 11cqh, 30px);
    font-weight: 500;
    min-width: 3.5em;
    text-align: center;
    letter-spacing: 0.05em;
    font-variant-numeric: tabular-nums;
  }
  .count-heading {
    display: none;
  }
  .count-btn {
    display: grid;
    place-items: center;
    background: var(--surface);
    border: none;
    border-radius: 999px;
    color: var(--text-muted);
    cursor: pointer;
    width: clamp(22px, 15cqh, 44px);
    height: clamp(22px, 15cqh, 44px);
    font-family: var(--font-ui);
    font-size: clamp(12px, 9cqh, 24px);
    line-height: 1;
    transition: color 0.15s, background-color 0.15s;
  }
  .count-btn:hover:not(:disabled) {
    color: var(--text);
    background: var(--surface-hover);
  }
  .count-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }
  /* Hoher Container (mobiles Vollbild-Panel): Logo/Buttons nach oben, Runde über der Zeit */
  @container (max-aspect-ratio: 3/2) {
    .brand {
      top: 20px;
      transform: none;
    }
    .actions {
      top: 20px;
      bottom: auto;
    }
    /* Mobil ist Rundenzählen das Hauptfeature: Zeit mittig im freien Raum,
       Zähler groß am unteren Rand in Daumenreichweite */
    .timer-center {
      box-sizing: border-box;
      height: 100%;
      width: 100%;
      padding: 72px 16px 28px;
      gap: 16px;
    }
    .timer-line {
      flex: 1;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    /* Zahl über die volle Breite, −/+ darunter — nebeneinander passt es nicht in Hochkant-Breite */
    .counter {
      flex-wrap: wrap;
      justify-content: center;
      gap: 12px 16px;
      width: 100%;
    }
    .count {
      order: -1;
      flex-basis: 100%;
      color: var(--text);
      font-size: clamp(40px, min(18cqh, 28cqw), 180px);
      font-weight: 700;
      line-height: 1;
    }
    /* Die Zahl soll dominieren — statt „R“ davor eine kleine Überschrift darüber */
    .count-label {
      display: none;
    }
    .count-heading {
      display: block;
      margin-bottom: 0.15em;
      color: var(--text-muted);
      font-size: 0.14em;
      font-weight: 500;
      letter-spacing: 0.2em;
      text-transform: uppercase;
    }
    .count-btn {
      width: clamp(56px, min(12cqh, 20cqw), 96px);
      height: clamp(56px, min(12cqh, 20cqw), 96px);
      font-size: clamp(24px, min(6cqh, 10cqw), 48px);
    }
    /* + ist die Hauptaktion: breite Taste statt Kreis */
    .count-btn:last-child {
      width: min(55cqw, 240px);
      color: var(--text);
    }
  }
</style>
