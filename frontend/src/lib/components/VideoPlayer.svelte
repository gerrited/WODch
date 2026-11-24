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
    <label for="video-url" class="visually-hidden">YouTube-URL</label>
    <input
      id="video-url"
      value={video.rawUrl}
      oninput={onInput}
      onpaste={onPaste}
      class="url-input"
      placeholder="youtube.com/watch?v=…"
    />
    <button class="tool-btn" title="10 Sekunden zurück" aria-label="10 Sekunden zurück" onclick={() => seekRelative(-10)}>−10s</button>
    <button class="tool-btn" title="10 Sekunden vor" aria-label="10 Sekunden vor" onclick={() => seekRelative(10)}>+10s</button>
    <button
      class="tool-btn loop-toggle"
      class:on={video.loop}
      title="Endlos-Loop"
      aria-label="Endlos-Loop"
      aria-pressed={video.loop}
      onclick={() => video.setLoop(!video.loop)}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M17 2l4 4-4 4M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 01-3 3H3" />
      </svg>
    </button>
  </div>
  <div class="embed-area">
    {#if video.rawUrl && !currentVideoId}
      <div class="error">Keine gültige YouTube URL.</div>
    {:else if !video.rawUrl}
      <!-- Leerer Zustand: gestrichelter Rahmen als Platzhalter-Fläche fürs Video -->
      <div class="placeholder">
        <span class="play-circle" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        </span>
        YouTube-Link einfügen — Technik-Demo oder Playlist
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
    height: 56px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    border-bottom: 1px solid var(--line);
    flex-shrink: 0;
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .url-input {
    flex: 1;
    min-width: 0;
    height: 40px;
    box-sizing: border-box;
    background: var(--surface-2);
    border: 1px solid #26262b;
    border-radius: var(--radius-sm);
    padding: 0 12px;
    color: var(--text-2);
    font-size: 13px;
    font-family: var(--font-mono);
    outline: none;
    transition: border-color 0.15s;
  }
  .url-input:focus-visible {
    border-color: var(--accent);
  }
  .url-input::placeholder {
    color: var(--text-faint);
  }
  .tool-btn {
    height: 40px;
    min-width: 40px;
    padding: 0 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 1px solid #26262b;
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    user-select: none;
    transition: color 0.15s, border-color 0.15s, background-color 0.15s;
  }
  .tool-btn:hover {
    color: var(--text);
    border-color: var(--line-strong);
  }
  .tool-btn:focus-visible,
  .retry-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .loop-toggle {
    padding: 0;
    width: 40px;
  }
  .loop-toggle svg {
    width: 18px;
    height: 18px;
  }
  .loop-toggle.on {
    color: var(--accent);
    background: var(--accent-tint-bg);
    border-color: var(--accent-tint-line);
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
  .error {
    position: absolute;
    padding: 20px;
    color: var(--rest);
    font-family: var(--font-ui);
    font-size: 14px;
    text-align: center;
  }
  .placeholder {
    position: absolute;
    inset: 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 20px;
    color: var(--text-faint);
    font-family: var(--font-ui);
    font-size: 14px;
    text-align: center;
    background: var(--surface-2);
    border: 1px dashed var(--line-strong);
    border-radius: 12px;
  }
  .play-circle {
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    border: 2px solid #3a3a40;
    border-radius: 50%;
    color: var(--text-muted);
  }
  .play-circle svg {
    width: 22px;
    height: 22px;
  }
  .retry-btn {
    display: block;
    margin: 12px auto 0;
    min-height: 40px;
    background: none;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-sm);
    color: var(--text-2);
    font-size: 13px;
    font-family: var(--font-ui);
    padding: 0 14px;
    cursor: pointer;
  }
  .retry-btn:hover {
    color: var(--text);
  }
</style>
