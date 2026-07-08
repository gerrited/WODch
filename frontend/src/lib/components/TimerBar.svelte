<script lang="ts">
  import { timer } from '../stores/timer.svelte'
  import { session } from '../sync/session.svelte'
  import { barAction } from './barAction'
  import Logo from './Logo.svelte'
  import ShareButton from './ShareButton.svelte'
  import { sound } from '../audio/beeps.svelte'

  let { onOpenModal }: { onOpenModal: () => void } = $props()

  const dotClass = $derived.by(() => {
    if (!session.id) return 'dot-off'
    if (session.status === 'connected') return 'dot-ok'
    if (session.status === 'error') return 'dot-error'
    return 'dot-off'
  })

  function handleClick() {
    sound.unlock()
    if (barAction(timer.doc, timer.derived, timer.elapsed) === 'modal') onOpenModal()
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
</script>

<div class="timer-bar" onclick={handleClick} role="button" tabindex="-1" onkeydown={() => {}}>
  <div class="brand">
    <Logo />
    <span class="connection-dot {dotClass}"></span>
  </div>
  <div class="timer-center">
    {#if timer.displayRound}
      <span class="round">{timer.displayRound}</span>
    {/if}
    <span class="time" class:work={timer.derived.phase === 'work'} class:rest={timer.derived.phase === 'rest'}>
      {timer.displayTime}
    </span>
  </div>
  <ShareButton />
  <button class="gear mute" onclick={handleMute} title={sound.muted ? 'Ton einschalten' : 'Ton ausschalten'} aria-label={sound.muted ? 'Ton einschalten' : 'Ton ausschalten'}>
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
  <button class="gear" onclick={handleGear} title="Timer-Einstellungen" aria-label="Timer-Einstellungen">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  </button>
</div>

<style>
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
  .timer-bar:hover {
    background: #161616;
  }
  .timer-center {
    display: flex;
    align-items: baseline;
    gap: 24px;
  }
  .round {
    /* cqw-Deckel: im mobilen Vollbild begrenzt die Breite, nicht die Höhe */
    font-size: clamp(14px, min(25cqh, 7cqw), 9999px);
    color: #888;
    letter-spacing: 2px;
    font-weight: 600;
  }
  .time {
    font-size: clamp(28px, min(60cqh, 12cqw), 9999px);
    font-weight: 900;
    color: #fff;
    letter-spacing: 4px;
    font-family: monospace;
  }
  .time.work {
    color: #e63946;
  }
  .time.rest {
    color: #2dc653;
  }
  .gear {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: #444;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    line-height: 0;
    transition: color 0.15s;
  }
  .gear svg {
    width: 24px;
    height: 24px;
  }
  .gear:hover {
    color: #888;
    background: #222;
  }
  .gear.mute {
    right: 108px;
  }
  .brand {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .connection-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    transition: background-color 0.3s;
  }
  .dot-off {
    background: #333;
  }
  .dot-ok {
    background: #4caf50;
  }
  .dot-error {
    background: #e63946;
  }
  /* Hoher Container (mobiles Vollbild-Panel): Logo/Buttons nach oben, Runde über der Zeit */
  @container (max-aspect-ratio: 3/2) {
    .brand,
    .gear {
      top: 20px;
      transform: none;
    }
    .timer-center {
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
  }
</style>
