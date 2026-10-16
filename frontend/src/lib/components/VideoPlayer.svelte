<script lang="ts">
  import { video } from '../stores/video.svelte'
  import { session } from '../sync/session.svelte'
  import {
    extractVideoId,
    initPlayer,
    setLoop,
    setOnLocalStateChange,
    applyRemoteVideo,
    seekRelative,
  } from '../video/youtube'

  let playerContainer: HTMLDivElement | undefined = $state()
  let currentVideoId = $state<string | null>(null)
  let loadError = $state(false)

  function onPaste(e: ClipboardEvent) {
    e.preventDefault()
    const text = e.clipboardData?.getData('text') ?? ''
    if (text) video.setUrl(text)
  }

  function onInput(e: Event) {
    video.setUrl((e.target as HTMLInputElement).value)
  }

  // Player meldet lokale Play/Pause/Seek-Zustände an die Session
  setOnLocalStateChange((v) => session.publishVideo(v))
  session.registerVideoApply((v) => applyRemoteVideo(v))

  $effect(() => {
    setLoop(video.loop)
  })

  async function loadVideo(id: string) {
    if (!playerContainer) return
    loadError = false
    const el = document.createElement('div')
    playerContainer.replaceChildren(el)
    try {
      await initPlayer(el, id)
    } catch {
      // API-Script nicht ladbar (z. B. Funkloch) — Fehler anzeigen statt
      // stillschweigend so zu tun, als wäre das Video geladen
      loadError = true
    }
  }

  $effect(() => {
    const id = extractVideoId(video.rawUrl)
    if (!id) {
      currentVideoId = null
      return
    }
    if (id === currentVideoId) return
    currentVideoId = id
    void loadVideo(id)
  })
</script>

<div class="video-player" data-tour="video">
  <div class="url-bar">
    <input
      value={video.rawUrl}
      oninput={onInput}
      onpaste={onPaste}
      class="url-input"
      placeholder="YouTube URL einfügen..."
    />
    <button class="seek-btn" title="10 Sekunden zurück" onclick={() => seekRelative(-10)}>« 10s</button>
    <button class="seek-btn" title="10 Sekunden vor" onclick={() => seekRelative(10)}>10s »</button>
    <label class="loop-toggle" title="Dauerschleife">
      <input
        type="checkbox"
        checked={video.loop}
        onchange={(e) => video.setLoop((e.target as HTMLInputElement).checked)}
      />
      ∞
    </label>
  </div>
  <div class="embed-area">
    {#if video.rawUrl && !currentVideoId}
      <div class="error">Keine gültige YouTube URL.</div>
    {:else if !video.rawUrl}
      <div class="placeholder">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">
          <rect x="2" y="5" width="20" height="14" rx="4" />
          <path d="M10 9.5v5l4.5-2.5z" fill="currentColor" />
        </svg>
        Video-Link oben einfügen
      </div>
    {:else if loadError}
      <div class="error">
        Video konnte nicht geladen werden.
        <button class="retry-btn" onclick={() => currentVideoId && loadVideo(currentVideoId)}>
          Erneut versuchen
        </button>
      </div>
    {/if}
    <div
      bind:this={playerContainer}
      class="embed-frame"
      class:hidden={!currentVideoId || loadError}
    ></div>
  </div>
</div>

<style>
  .video-player {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }
  .url-bar {
    height: var(--bar-h);
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 8px;
    border-bottom: 1px solid var(--line);
    flex-shrink: 0;
  }
  .url-input {
    flex: 1;
    height: 32px;
    background: var(--surface);
    border: 1px solid transparent;
    border-radius: var(--radius);
    padding: 0 12px;
    margin-right: 4px;
    color: var(--text);
    font-size: 13px;
    font-family: var(--font-ui);
    outline: none;
    min-width: 0;
    transition: border-color 0.15s;
  }
  .url-input:focus {
    border-color: var(--line-strong);
  }
  .url-input::placeholder {
    color: var(--text-faint);
  }
  .seek-btn,
  .loop-toggle {
    height: 32px;
    padding: 0 10px;
    display: flex;
    align-items: center;
    background: none;
    border: none;
    border-radius: var(--radius);
    color: var(--text-faint);
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    user-select: none;
    transition: color 0.15s, background-color 0.15s;
  }
  .seek-btn {
    font-size: 12px;
    font-family: var(--font-ui);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .seek-btn:hover,
  .loop-toggle:hover {
    color: var(--text);
    background: var(--surface-hover);
  }
  .loop-toggle {
    font-size: 18px;
  }
  .loop-toggle input {
    display: none;
  }
  .loop-toggle:has(input:checked) {
    color: var(--accent);
  }
  .embed-area {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
  }
  .embed-frame {
    width: 100%;
    height: 100%;
  }
  .embed-frame.hidden {
    display: none;
  }
  .embed-frame :global(iframe) {
    width: 100%;
    height: 100%;
    display: block;
    border: none;
  }
  .placeholder,
  .error {
    color: var(--text-faint);
    font-family: var(--font-ui);
    font-size: 14px;
    text-align: center;
    padding: 20px;
    position: absolute;
  }
  /* Leerer Zustand als dezenter Hinweis — die Eingabe sitzt bereits in der Leiste darüber */
  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  .placeholder svg {
    width: 40px;
    height: 40px;
  }
  .error {
    color: #ff4d5e;
  }
  .retry-btn {
    display: block;
    margin: 12px auto 0;
    background: var(--surface);
    border: none;
    border-radius: var(--radius);
    color: var(--text-muted);
    font-size: 13px;
    font-family: var(--font-ui);
    padding: 8px 14px;
    cursor: pointer;
  }
  .retry-btn:hover {
    color: var(--text);
    background: var(--surface-hover);
  }
</style>
