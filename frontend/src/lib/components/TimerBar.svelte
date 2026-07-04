<script lang="ts">
  import { timer } from '../stores/timer.svelte'
  import { session } from '../sync/session.svelte'
  import { barAction } from './barAction'
  import ShareButton from './ShareButton.svelte'

  let { onOpenModal }: { onOpenModal: () => void } = $props()

  const dotClass = $derived.by(() => {
    if (!session.id) return 'dot-off'
    if (session.status === 'connected') return 'dot-ok'
    if (session.status === 'error') return 'dot-error'
    return 'dot-off'
  })

  function handleClick() {
    if (barAction(timer.doc, timer.derived, timer.elapsed) === 'modal') onOpenModal()
    else timer.toggle()
  }

  function handleGear(e: MouseEvent) {
    e.stopPropagation()
    onOpenModal()
  }
</script>

<div class="timer-bar" onclick={handleClick} role="button" tabindex="-1" onkeydown={() => {}}>
  <div class="timer-center">
    {#if timer.displayRound}
      <span class="round">{timer.displayRound}</span>
    {/if}
    <span class="time" class:work={timer.derived.phase === 'work'} class:rest={timer.derived.phase === 'rest'}>
      {timer.displayTime}
    </span>
  </div>
  <ShareButton />
  <button class="gear" onclick={handleGear} title="Timer-Einstellungen">⚙</button>
  <span class="connection-dot {dotClass}"></span>
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
    font-size: 36px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    line-height: 1;
  }
  .gear:hover {
    color: #888;
    background: #222;
  }
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
  .dot-off {
    background: #333;
  }
  .dot-ok {
    background: #4caf50;
  }
  .dot-error {
    background: #e63946;
  }
</style>
