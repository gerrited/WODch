<script lang="ts">
  import { session } from '../sync/session.svelte'
  import { router } from '../router.svelte'
  import { extractVideoId } from '../video/youtube'
  import Logo from './Logo.svelte'
  import LegalModal from './LegalModal.svelte'

  let starting = $state(false)

  async function start() {
    if (starting) return
    starting = true
    try {
      await session.create()
      router.sync()
    } finally {
      starting = false
    }
  }

  interface Feature {
    id: string
    title: string
    short: string
    text: string
    videoUrl: string
  }

  const features: Feature[] = [
    {
      id: 'timer',
      title: 'Intervall-Timer',
      short: 'Tabata, EMOM & Co.',
      text: 'Uhrzeit, Stoppuhr, Count-Down, Count-Up und Intervall mit Presets wie Tabata, EMOM oder Fight Gone Bad — inklusive Warmup und Rundenzählung.',
      videoUrl: 'https://youtu.be/oSdlbRmrgNw',
    },
    {
      id: 'ki',
      title: 'KI-generierte Workouts',
      short: 'Prompt rein, WOD raus',
      text: 'Kurzen Prompt eingeben — WODch generiert dir ein passendes Workout direkt in den Editor, startklar in Sekunden.',
      videoUrl: 'https://youtu.be/0CU6XrGlTbw',
    },
    {
      id: 'sync',
      title: 'Fernsteuerung per Link',
      short: 'Handy steuert den Screen',
      text: 'Link teilen und Sessions in Echtzeit über mehrere Geräte synchron halten — Timer, Workouts und Video auf Handy und Bildschirm gleichzeitig.',
      videoUrl: 'https://youtu.be/zgr379mhAPQ',
    },
  ]

  // Die Bühne zeigt immer nur ein Video groß — so lädt auch nur ein IFrame.
  let activeId = $state(features[0].id)
  const active = $derived(features.find((f) => f.id === activeId) ?? features[0])
  const activeVideoId = $derived(extractVideoId(active.videoUrl))

  let legal: 'privacy' | 'imprint' | null = $state(null)

  // Aus den Feature-Karten heraus gewählte Videos laufen oben in der Bühne —
  // ohne Scroll bliebe der Klick auf Mobilgeräten unsichtbar.
  let stageEl: HTMLElement | undefined = $state()

  function show(id: string) {
    activeId = id
    stageEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
</script>

<div class="landing">
  <div class="aurora" aria-hidden="true"></div>

  <nav class="topbar">
    <span class="brand"><Logo size="34px" /></span>
    <a class="ghost" href="https://github.com/gerrited/WODch" target="_blank" rel="noopener noreferrer">
      GitHub ↗
    </a>
  </nav>

  <header class="hero">
    <div class="hero-copy">
      <p class="eyebrow">Timer · KI-Workouts · Video-Sync</p>
      <h1>WODch</h1>
      <p class="tagline">
        Gym-Timer, KI-Workouts und Video-Sync auf allen Geräten — ganz ohne Cloud-Account.
      </p>
      <button class="cta" onclick={start} disabled={starting}>
        {starting ? 'Session wird erstellt…' : 'Jetzt starten'}
      </button>
      <p class="hint">
        Erzeugt sofort einen Link, den du mit deinem Handy oder Trainingspartnern teilen kannst.
      </p>
      <ul class="trust">
        <li>Kein Account</li>
        <li>Keine Datenbank</li>
        <li>Open Source</li>
      </ul>
    </div>

    <div class="stage" bind:this={stageEl}>
      <div class="stage-frame">
        <div class="video" role="tabpanel" aria-label={active.title}>
          {#if activeVideoId}
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${activeVideoId}?rel=0`}
              title={active.title}
              loading="lazy"
              allow="encrypted-media; picture-in-picture"
              allowfullscreen
            ></iframe>
          {/if}
        </div>
        <div class="stage-tabs" role="tablist" aria-label="Feature-Videos">
          {#each features as feature (feature.id)}
            <button
              class="stage-tab"
              class:active={feature.id === activeId}
              role="tab"
              aria-selected={feature.id === activeId}
              onclick={() => (activeId = feature.id)}
            >
              <span class="tab-title">{feature.title}</span>
              <span class="tab-short">{feature.short}</span>
            </button>
          {/each}
        </div>
      </div>
    </div>
  </header>

  <section class="features">
    {#each features as feature (feature.id)}
      <article class="feature" class:active={feature.id === activeId}>
        <h2>{feature.title}</h2>
        <p>{feature.text}</p>
        <button class="play" onclick={() => show(feature.id)}>▶ Video ansehen</button>
      </article>
    {/each}
  </section>

  <footer class="footer">
    <p>© 2026 WODch — MIT-Lizenz</p>
    <nav class="legal-links">
      <button onclick={() => (legal = 'privacy')}>Datenschutz</button>
      <span aria-hidden="true">·</span>
      <button onclick={() => (legal = 'imprint')}>Impressum</button>
    </nav>
  </footer>
</div>

{#if legal}
  <LegalModal kind={legal} onClose={() => (legal = null)} />
{/if}

<style>
  .landing {
    position: relative;
    height: 100%;
    overflow-y: auto;
    font-family: monospace;
    color: #fff;
    background: #000;
  }

  /* Dezenter Grünschimmer hinter dem Hero — rein dekorativ */
  .aurora {
    position: absolute;
    top: -280px;
    left: 50%;
    transform: translateX(-50%);
    width: min(1400px, 160%);
    height: 900px;
    pointer-events: none;
    background:
      radial-gradient(ellipse 45% 40% at 30% 40%, rgba(168, 209, 41, 0.16), transparent 70%),
      radial-gradient(ellipse 40% 35% at 72% 30%, rgba(45, 198, 83, 0.13), transparent 70%);
    animation: drift 18s ease-in-out infinite alternate;
  }

  @keyframes drift {
    from {
      opacity: 0.75;
    }
    to {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .aurora {
      animation: none;
    }
  }

  .topbar {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    max-width: 1240px;
    margin: 0 auto;
    padding: 18px 24px;
  }

  .brand {
    display: flex;
    align-items: center;
  }

  .ghost {
    color: #888;
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    text-decoration: none;
    border: 1px solid #2a2a2a;
    border-radius: 999px;
    padding: 7px 14px;
    transition:
      color 0.15s,
      border-color 0.15s;
  }

  .ghost:hover {
    color: #fff;
    border-color: #4a4a4a;
  }

  .hero {
    position: relative;
    display: grid;
    grid-template-columns: minmax(300px, 0.85fr) minmax(0, 1.15fr);
    align-items: center;
    gap: 48px;
    max-width: 1240px;
    margin: 0 auto;
    padding: 40px 24px 72px;
  }

  .eyebrow {
    color: #a8d129;
    font-size: 0.75rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    margin-bottom: 18px;
  }

  .hero h1 {
    font-size: clamp(3rem, 7vw, 4.75rem);
    line-height: 1;
    letter-spacing: 0.04em;
    margin-bottom: 18px;
  }

  .tagline {
    max-width: 460px;
    color: #aaa;
    font-size: 1rem;
    line-height: 1.6;
    margin-bottom: 32px;
  }

  .cta {
    font-family: monospace;
    font-size: 1.1rem;
    font-weight: bold;
    color: #061400;
    background: linear-gradient(135deg, #a8d129, #2dc653);
    border: none;
    border-radius: 10px;
    padding: 16px 34px;
    cursor: pointer;
    box-shadow: 0 10px 30px rgba(45, 198, 83, 0.25);
    transition:
      transform 0.15s,
      box-shadow 0.15s,
      filter 0.15s;
  }

  .cta:hover:not(:disabled) {
    filter: brightness(1.08);
    transform: translateY(-2px);
    box-shadow: 0 14px 38px rgba(45, 198, 83, 0.35);
  }

  .cta:disabled {
    opacity: 0.6;
    cursor: default;
    box-shadow: none;
  }

  .hint {
    max-width: 420px;
    margin-top: 16px;
    color: #666;
    font-size: 0.8rem;
    line-height: 1.5;
  }

  .trust {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 20px;
    list-style: none;
    margin-top: 28px;
  }

  .trust li {
    color: #777;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .trust li::before {
    content: '✓ ';
    color: #2dc653;
  }

  /* Video-Bühne: ein großes Player-Fenster plus Umschalter darunter */
  .stage-frame {
    background: #0c0c0c;
    border: 1px solid #2a2a2a;
    border-radius: 14px;
    padding: 10px;
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.7);
  }

  .video {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 8px;
    overflow: hidden;
    background: #000;
  }

  .video iframe {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: none;
  }

  .stage-tabs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    margin-top: 10px;
  }

  .stage-tab {
    display: flex;
    flex-direction: column;
    gap: 3px;
    text-align: left;
    font-family: monospace;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 8px;
    padding: 10px 12px;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s;
  }

  .stage-tab:hover {
    background: #151515;
  }

  .stage-tab.active {
    background: #151515;
    border-color: #2dc653;
  }

  .tab-title {
    color: #888;
    font-size: 0.8rem;
  }

  .stage-tab.active .tab-title {
    color: #fff;
  }

  .tab-short {
    color: #555;
    font-size: 0.7rem;
  }

  .features {
    position: relative;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 20px;
    max-width: 1240px;
    margin: 0 auto;
    padding: 0 24px 64px;
  }

  .feature {
    background: #0d0d0d;
    border: 1px solid #262626;
    border-radius: 12px;
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: border-color 0.15s;
  }

  .feature.active {
    border-color: #3d5a19;
  }

  .feature h2 {
    font-size: 1.05rem;
  }

  .feature p {
    color: #aaa;
    line-height: 1.55;
    font-size: 0.85rem;
    flex: 1;
  }

  .play {
    align-self: flex-start;
    font-family: monospace;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    color: #a8d129;
    background: transparent;
    border: 1px solid #2f3a1a;
    border-radius: 999px;
    padding: 7px 14px;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s;
  }

  .play:hover {
    background: #141a08;
    border-color: #a8d129;
  }

  .footer {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    max-width: 1240px;
    margin: 0 auto;
    padding: 24px;
    border-top: 1px solid #1c1c1c;
    color: #555;
    font-size: 0.78rem;
  }

  .legal-links {
    display: flex;
    align-items: center;
    gap: 10px;
    color: #333;
  }

  .legal-links button {
    font-family: monospace;
    font-size: 0.78rem;
    color: #888;
    background: none;
    border: none;
    padding: 4px 2px;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .legal-links button:hover {
    color: #a8d129;
  }

  @media (max-width: 900px) {
    .hero {
      grid-template-columns: 1fr;
      gap: 36px;
      padding-bottom: 48px;
      text-align: center;
    }

    .tagline,
    .hint {
      margin-left: auto;
      margin-right: auto;
    }

    .trust {
      justify-content: center;
    }

    .stage-tabs {
      grid-template-columns: 1fr;
    }

    .stage-tab {
      text-align: center;
    }
  }
</style>
