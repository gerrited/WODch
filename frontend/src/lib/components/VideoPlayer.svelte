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
      <div class="placeholder">YouTube URL eingeben</div>
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
    background: #0d0d0d;
  }
  .url-bar {
    height: 40px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    border-bottom: 2px solid #333;
    flex-shrink: 0;
  }
  .url-input {
    flex: 1;
    background: #111;
    border: 1px solid #333;
    border-radius: 4px;
    padding: 6px 10px;
    color: #ccc;
    font-size: 12px;
    font-family: monospace;
    outline: none;
    min-width: 0;
  }
  .url-input:focus {
    border-color: #555;
  }
  .url-input::placeholder {
    color: #444;
  }
  .seek-btn {
    background: #111;
    border: 1px solid #333;
    border-radius: 4px;
    color: #888;
    font-size: 11px;
    font-family: monospace;
    padding: 5px 8px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .seek-btn:hover {
    color: #fff;
    background: #1a1a1a;
  }
  .loop-toggle {
    display: flex;
    align-items: center;
    gap: 5px;
    color: #555;
    font-size: 18px;
    cursor: pointer;
    user-select: none;
    flex-shrink: 0;
  }
  .loop-toggle input {
    display: none;
  }
  .loop-toggle:has(input:checked) {
    color: #fff;
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
    color: #444;
    font-size: 13px;
    text-align: center;
    padding: 20px;
    position: absolute;
  }
  .placeholder {
    font-size: 32px;
  }
  .error {
    color: #e63946;
  }
  .retry-btn {
    display: block;
    margin: 10px auto 0;
    background: #111;
    border: 1px solid #333;
    border-radius: 4px;
    color: #888;
    font-size: 12px;
    font-family: monospace;
    padding: 6px 12px;
    cursor: pointer;
  }
  .retry-btn:hover {
    color: #fff;
    background: #1a1a1a;
  }
</style>
