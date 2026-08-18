<script lang="ts">
  import { session } from '../sync/session.svelte'
  import { router } from '../router.svelte'
  import { extractVideoId } from '../video/youtube'

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
    title: string
    text: string
    videoUrl: string
  }

  const features: Feature[] = [
    {
      title: 'Intervall-Timer',
      text: 'Uhrzeit, Stoppuhr, Count-Down, Count-Up und Intervall mit Presets wie Tabata, EMOM oder Fight Gone Bad — inklusive Warmup und Rundenzählung.',
      videoUrl: 'https://youtu.be/oSdlbRmrgNw',
    },
    {
      title: 'KI-generierte Workouts',
      text: 'Kurzen Prompt eingeben — WODch generiert dir ein passendes Workout direkt in den Editor, startklar in Sekunden.',
      videoUrl: 'https://youtu.be/0CU6XrGlTbw',
    },
    {
      title: 'Fernsteuerung per Link',
      text: 'Link teilen und Sessions in Echtzeit über mehrere Geräte synchron halten — Timer, Workouts und Video auf Handy und Bildschirm gleichzeitig.',
      videoUrl: 'https://youtu.be/zgr379mhAPQ',
    },
  ]
</script>

<div class="landing">
  <header class="hero">
    <h1>WODch</h1>
    <p class="tagline">
      Gym-Timer, KI-Workouts und Video-Sync auf allen Geräten — ganz ohne Cloud-Account.
    </p>
    <button class="cta" onclick={start} disabled={starting}>
      {starting ? 'Session wird erstellt…' : 'Jetzt starten'}
    </button>
    <p class="hint">Erzeugt sofort einen Link, den du mit deinem Handy oder Trainingspartnern teilen kannst.</p>
  </header>

  <section class="features">
    {#each features as feature (feature.title)}
      {@const videoId = extractVideoId(feature.videoUrl)}
      <article class="feature">
        <h2>{feature.title}</h2>
        <p>{feature.text}</p>
        {#if videoId}
          <div class="video">
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?rel=0`}
              title={feature.title}
              loading="lazy"
              allow="encrypted-media; picture-in-picture"
              allowfullscreen
            ></iframe>
          </div>
        {/if}
      </article>
    {/each}
  </section>
</div>

<style>
  .landing {
    height: 100%;
    overflow-y: auto;
    font-family: monospace;
    color: #fff;
    background: #000;
  }

  .hero {
    text-align: center;
    padding: 64px 24px 48px;
  }

  .hero h1 {
    font-size: 3rem;
    letter-spacing: 0.05em;
    margin-bottom: 12px;
  }

  .tagline {
    max-width: 520px;
    margin: 0 auto 32px;
    color: #aaa;
    line-height: 1.5;
  }

  .cta {
    font-family: monospace;
    font-size: 1.1rem;
    font-weight: bold;
    color: #000;
    background: #2dc653;
    border: none;
    border-radius: 6px;
    padding: 14px 32px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .cta:hover:not(:disabled) {
    background: #4caf50;
  }

  .cta:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .hint {
    margin-top: 14px;
    color: #666;
    font-size: 0.85rem;
  }

  .features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 32px;
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 24px 64px;
  }

  .feature {
    background: #111;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .feature h2 {
    font-size: 1.15rem;
  }

  .feature p {
    color: #aaa;
    line-height: 1.4;
    font-size: 0.9rem;
  }

  .video {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 4px;
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
</style>
