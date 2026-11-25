<script lang="ts">
  import { session } from '../sync/session.svelte'
  import { router } from '../router.svelte'
  import Logo from './Logo.svelte'
  import LegalModal from './LegalModal.svelte'

  const GITHUB_URL = 'https://github.com/gerrited/WODch'

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

  interface StageTab {
    id: 'timer' | 'ki' | 'sync'
    title: string
    short: string
  }

  const tabs: StageTab[] = [
    { id: 'timer', title: 'Intervall-Timer', short: 'Tabata, EMOM & Co.' },
    { id: 'ki', title: 'KI-Workouts', short: 'Prompt rein, WOD raus' },
    { id: 'sync', title: 'Fernsteuerung', short: 'Handy steuert den Screen' },
  ]

  let activeId = $state<StageTab['id']>('timer')
  const active = $derived(tabs.find((t) => t.id === activeId) ?? tabs[0])

  // Live-Demo: tickt lokal statt über die echten Stores, damit auf '/' weder
  // Session noch Sync angefasst werden. Tabata 20 s Arbeit / 10 s Pause × 8.
  const WORK = 20
  const REST = 10
  const ROUND = WORK + REST
  const ROUNDS = 8
  // Startpunkt = Runde 2, noch 15 s Arbeit — zugleich das Standbild bei reduzierter Bewegung
  let t = $state(ROUND + 5)
  // Bei reduzierter Bewegung startet die Demo pausiert; Fortsetzen ist dann eine bewusste Aktion.
  const reducedMotion =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let running = $state(!reducedMotion)
  // Solange die Demo nie lief, wäre „Fortsetzen“ irreführend — dann heißt die Aktion „Starten“.
  let started = $state(!reducedMotion)
  const resumeVerb = $derived(started ? 'fortsetzen' : 'starten')

  // Pausieren/Fortsetzen wie in der App: Klick auf die Zeit oder den Start/Pause-Button
  function toggleDemo() {
    running = !running
    if (running) started = true
  }

  $effect(() => {
    if (!running) return
    const id = setInterval(() => {
      t = (t + 1) % (ROUND * ROUNDS)
    }, 1000)
    return () => clearInterval(id)
  })

  const demo = $derived.by(() => {
    const round = Math.floor(t / ROUND) + 1
    const inRound = t % ROUND
    const work = inRound < WORK
    const left = work ? WORK - inRound : ROUND - inRound
    const span = work ? WORK : REST
    const done = work ? inRound : inRound - WORK
    return {
      round,
      work,
      clock: '00:' + String(left).padStart(2, '0'),
      progress: Math.round(((done + 1) / span) * 100),
    }
  })

  let legal: 'privacy' | 'imprint' | null = $state(null)

  const ticker = ['Tabata', 'EMOM', 'AMRAP', 'For Time', 'Fight Gone Bad', 'Custom']

  const steps = [
    { title: 'Session starten', text: 'Ein Klick öffnet die App auf dem Screen in der Box. Kein Login, keine Installation.' },
    { title: 'Link teilen', text: 'Öffne den Session-Link auf dem Handy. Alle Geräte mit dem Link sehen und steuern dasselbe.' },
    { title: 'Trainieren', text: 'Timer, Workout und Video laufen synchron. Starten, pausieren und Runden zählen direkt vom Handy.' },
  ]

  const presets = ['EMOM', 'Fight Gone Bad', 'Tabata', 'Custom']

  // Icons als SVG-Pfade (stroke = currentColor, Strichstärke 2), keine Emojis
  const features = [
    {
      title: 'KI-Workouts',
      text: 'Kurzen Prompt eingeben, das Workout landet direkt im Editor. Ein Klick stellt den passenden Timer ein.',
      icon: '<path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    },
    {
      title: 'Fernsteuerung per Link',
      text: 'Handy steuert den Screen. Alle Geräte haben volle Kontrolle — kein Host, kein Pairing.',
      icon: '<rect x="2" y="4" width="14" height="10" rx="1.5"/><rect x="17" y="8" width="5" height="12" rx="1.5"/><path d="M6 18h6"/>',
    },
    {
      title: 'Workout-Board',
      text: 'Mehrere Tabs für Warmup, WOD und Cooldown. Umbenennen per Doppelklick, sortieren per Drag & Drop.',
      icon: '<path d="M4 6h16M4 12h10M4 18h13"/>',
    },
    {
      title: 'Video daneben',
      text: 'YouTube-Link einfügen für Technik-Demos oder Musik. Endlos-Loop und ±10-Sekunden-Sprünge.',
      icon: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M10 9.5v5l4.5-2.5z"/>',
    },
    {
      title: 'Ansagen & Vibration',
      text: '„Los“, „Runde 3“, „Noch zehn Sekunden“ — pro Gerät zuschaltbar. Das Display bleibt an, solange der Timer läuft.',
      icon: '<path d="M11 5L6 9H3v6h3l5 4zM16 9a4 4 0 010 6M19 6a8 8 0 010 12"/>',
    },
    {
      title: 'Läuft auch offline',
      text: 'Als PWA installierbar. Timer und Editor starten auch ohne Netz — wenn das WLAN in der Box mal streikt.',
      icon: '<path d="M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0M2 9a14 14 0 0120 0"/><circle cx="12" cy="19.5" r="1"/>',
    },
  ]

  const shortcuts = [
    { key: 'Space', label: 'Start / Pause' },
    { key: 'R', label: 'Reset' },
    { key: 'M', label: 'Einstellungen' },
    { key: '+ / −', label: 'Runden zählen' },
  ]

  const stats = [
    { value: '0', label: 'Accounts oder Logins' },
    { value: '24h', label: 'bis eine Session verfällt' },
    { value: '5', label: 'Timer-Modi' },
    { value: 'MIT', label: 'Open-Source-Lizenz' },
  ]
</script>

{#snippet arrow()}
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
{/snippet}

{#snippet playPause()}
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    {#if running}
      <rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" />
    {:else}
      <path d="M7 4.5v15l13-7.5z" />
    {/if}
  </svg>
{/snippet}

<div class="landing" id="top">
  <header class="nav-wrap">
    <nav class="nav container" aria-label="Hauptnavigation">
      <a class="brand" href="#top" aria-label="WODch Startseite">
        <Logo size="72px" />
        <span class="brand-name" aria-hidden="true">WODch</span>
      </a>
      <div class="nav-links">
        <a class="anchor" href="#features">Features</a>
        <a class="anchor" href="#ablauf">So funktioniert's</a>
        <a class="anchor" href="#open">Open Source</a>
        <a class="pill" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
          GitHub
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M7 17L17 7M8 7h9v9" />
          </svg>
        </a>
      </div>
    </nav>
  </header>

  <section class="hero container">
    <div class="hero-copy">
      <p class="eyebrow">Timer · KI-Workouts · Fernsteuerung</p>
      <h1>Die Uhr<br />für dein <span class="lime">WOD.</span></h1>
      <p class="lead">
        Intervall-Timer, Workout-Board und YouTube-Video auf einem Screen. Gesteuert vom Handy, synchron auf allen
        Geräten — ohne Account.
      </p>
      <div class="cta-row">
        <button class="cta" onclick={start} disabled={starting}>
          {#if starting}Session wird erstellt…{:else}Session starten {@render arrow()}{/if}
        </button>
        <a class="btn-outline" href="#ablauf">So funktioniert's</a>
      </div>
      <p class="hint">Erzeugt sofort einen Link für dein Handy oder deine Trainingspartner.</p>
      <ul class="trust">
        <li>Kein Account</li>
        <li>Keine Datenbank</li>
        <li>Open Source</li>
        <li>Offline-fähig</li>
      </ul>
    </div>

    <div class="stage">
      <div class="stage-head">
        <span class="stage-url"><span class="pulse" aria-hidden="true"></span>wodch.com/l/k3x9q</span>
        <span>2 Geräte verbunden</span>
      </div>

      <div class="stage-body" role="tabpanel" id="stage-panel" aria-label={active.title}>
        {#if activeId === 'timer'}
          <div class="demo-timer" class:rest={!demo.work} class:paused={!running}>
            <div class="demo-meta">
              <span class="phase">
                {#if !running}{started ? 'Pausiert' : 'Bereit'}{:else}{demo.work ? 'Arbeit' : 'Pause'}{/if}
              </span>
              <span>Tabata · Runde {demo.round}/{ROUNDS}</span>
            </div>
            <button
              class="demo-clock"
              onclick={toggleDemo}
              aria-label={running ? `Demo-Timer ${demo.clock} — pausieren` : `Demo-Timer ${demo.clock} — ${resumeVerb}`}
            >
              {demo.clock}
            </button>
            <div class="bar"><div class="bar-fill" style="width: {demo.progress}%"></div></div>
            <div class="rounds" aria-hidden="true">
              {#each { length: ROUNDS } as _, i (i)}
                <span
                  class="seg"
                  class:done={i + 1 < demo.round}
                  class:current={i + 1 === demo.round}
                ></span>
              {/each}
            </div>
            <div class="stage-actions">
              <button class="demo-toggle" class:paused={!running} onclick={toggleDemo} aria-pressed={!running}>
                {@render playPause()}
                {running ? 'Pause' : started ? 'Fortsetzen' : 'Starten'}
              </button>
            </div>
          </div>
        {:else if activeId === 'ki'}
          <div class="demo-ki">
            <div class="prompt">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
              </svg>
              20 Min AMRAP, Kettlebell und Klimmzugstange
            </div>
            <div class="wod">AMRAP 20:00<br />10 Kettlebell Swings<br />8 Pull-ups<br />12 Goblet Squats</div>
            <div class="detected">
              <span>Timer erkannt: <strong>Count-Down 20:00</strong></span>
              <span class="mono">bereit</span>
            </div>
          </div>
        {:else}
          <div class="demo-sync">
            <div class="screen">
              <span class="screen-label">TV in der Box</span>
              <span class="screen-clock" class:paused={!running}>{demo.clock}</span>
            </div>
            <svg class="link" width="56" height="24" viewBox="0 0 56 24" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4" aria-hidden="true">
              <path d="M2 12h52" />
            </svg>
            <div class="phone">
              <span class="phone-clock">{demo.clock}</span>
              <button
                class="phone-btn"
                class:paused={!running}
                onclick={toggleDemo}
                aria-label={running ? 'Demo pausieren' : `Demo ${resumeVerb}`}
              >
                {@render playPause()}
              </button>
            </div>
          </div>
        {/if}
      </div>

      <div class="stage-tabs" role="tablist" aria-label="Features">
        {#each tabs as tab (tab.id)}
          <button
            class="stage-tab"
            class:active={tab.id === activeId}
            role="tab"
            aria-selected={tab.id === activeId}
            aria-controls="stage-panel"
            onclick={() => (activeId = tab.id)}
          >
            <span class="tab-title">{tab.title}</span>
            <span class="tab-short">{tab.short}</span>
          </button>
        {/each}
      </div>
    </div>
  </section>

  <div class="ticker">
    <div class="ticker-inner container">
      {#each ticker as item, i (item)}
        {#if i > 0}<span class="slash" aria-hidden="true">/</span>{/if}
        <span>{item}</span>
      {/each}
    </div>
  </div>

  <section id="ablauf" class="steps-section container">
    <p class="eyebrow">So funktioniert's</p>
    <h2 class="steps-title">In drei Schritten vom Whiteboard auf den großen Screen.</h2>
    <ol class="steps">
      {#each steps as step, i (step.title)}
        <li class="step" class:first={i === 0}>
          <span class="step-no">{String(i + 1).padStart(2, '0')}</span>
          <h3>{step.title}</h3>
          <p>{step.text}</p>
        </li>
      {/each}
    </ol>
  </section>

  <section id="features" class="features-section container">
    <div class="features-head">
      <h2>Alles, was die Box braucht.</h2>
      <p>Gebaut für Coaches und Athleten, die mitten im WOD keine Zeit für Menüs haben.</p>
    </div>
    <article class="feature feature-big">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2h6" />
      </svg>
      <h3>Intervall-Timer mit 5 Modi</h3>
      <p>Uhrzeit, Stoppuhr auf die Hundertstel, Count-Down, Count-Up und Intervall — mit Presets und optionalem Warmup.</p>
      <ul class="chips">
        {#each presets as preset (preset)}<li>{preset}</li>{/each}
      </ul>
    </article>
    <div class="feature-grid">
      {#each features as feature (feature.title)}
        <article class="feature">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            {@html feature.icon}
          </svg>
          <h3>{feature.title}</h3>
          <p>{feature.text}</p>
        </article>
      {/each}
    </div>
  </section>

  <section class="keys-section container">
    <div class="keys">
      <div>
        <h3>Hände voller Kreide?</h3>
        <p>Klick auf die Timer-Leiste genügt. Oder per Tastatur:</p>
      </div>
      <ul class="key-list">
        {#each shortcuts as s (s.key)}
          <li><kbd>{s.key}</kbd>{s.label}</li>
        {/each}
      </ul>
    </div>
  </section>

  <section id="open" class="open">
    <div class="open-inner container">
      <div>
        <p class="eyebrow">Privat by Design</p>
        <h2>Kein Cloud-Konto.<br />Keine Datenbank.</h2>
        <p class="open-text">
          Sessions leben nur im Arbeitsspeicher des Sync-Servers und verfallen 24 Stunden nach der letzten Änderung.
          Der Code ist offen — unter MIT-Lizenz.
        </p>
        <a class="btn-outline gh" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path
              d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 00-1.3-3.2 4.2 4.2 0 00-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 00-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 00-.1 3.2A4.6 4.6 0 004 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"
            />
          </svg>
          Code auf GitHub ansehen
        </a>
      </div>
      <dl class="stats">
        {#each stats as stat, i (stat.label)}
          <div class="stat">
            <dt class:lime={i === 0}>{stat.value}</dt>
            <dd>{stat.label}</dd>
          </div>
        {/each}
      </dl>
    </div>
  </section>

  <section class="final container">
    <div class="countdown" aria-hidden="true">3·2·1</div>
    <h2>Bereit? <span class="lime">Los.</span></h2>
    <p>Session starten, Link aufs Handy, Kreide an die Hände.</p>
    <button class="cta cta-lg" onclick={start} disabled={starting}>
      {#if starting}Session wird erstellt…{:else}Jetzt starten {@render arrow()}{/if}
    </button>
  </section>

  <footer class="footer">
    <div class="footer-inner container">
      <span class="copy"><Logo size="52px" />© 2026 WODch — MIT-Lizenz</span>
      <nav class="legal-links" aria-label="Rechtliches">
        <button onclick={() => (legal = 'privacy')}>Datenschutz</button>
        <button onclick={() => (legal = 'imprint')}>Impressum</button>
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
      </nav>
    </div>
  </footer>
</div>

{#if legal}
  <LegalModal kind={legal} onClose={() => (legal = null)} />
{/if}

<style>
  .landing {
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    scroll-behavior: smooth;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-ui);
    font-size: var(--fs-body);
    line-height: 1.55;
  }

  .container {
    max-width: var(--container);
    margin: 0 auto;
    padding-left: var(--gutter);
    padding-right: var(--gutter);
  }

  .landing :global(a),
  .landing button {
    -webkit-tap-highlight-color: transparent;
  }

  .landing a:focus-visible,
  .landing button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .lime {
    color: var(--accent);
  }

  .mono {
    font-family: var(--font-mono);
  }

  /* Überschriften greifen das kursive Wch-Logo auf: immer italic 900, uppercase */
  h1,
  h2 {
    font-family: var(--font-display);
    font-style: italic;
    font-weight: 900;
    text-transform: uppercase;
  }

  h2 {
    font-size: var(--fs-h2);
    line-height: 0.95;
  }

  h3 {
    font-size: 22px;
    font-weight: 600;
    line-height: 1.3;
  }

  .eyebrow {
    margin-bottom: 14px;
    font-family: var(--font-mono);
    font-size: var(--fs-eyebrow);
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--accent);
  }

  /* ---------- Buttons ---------- */
  .cta {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 52px;
    padding: 16px 28px;
    font: 600 17px/1 var(--font-ui);
    color: var(--accent-ink);
    background: var(--accent);
    border: none;
    border-radius: var(--radius);
    cursor: pointer;
    transition: background 0.15s;
  }

  .cta:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .cta:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .cta-lg {
    min-height: 56px;
    padding: 18px 34px;
    font-size: 18px;
  }

  .btn-outline {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 52px;
    padding: 16px 24px;
    font-weight: 500;
    font-size: 17px;
    line-height: 1;
    color: var(--text);
    text-decoration: none;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    transition: border-color 0.15s;
  }

  .btn-outline:hover {
    border-color: var(--text-ghost);
  }

  /* ---------- Navigation ---------- */
  .nav-wrap {
    border-bottom: 1px solid var(--line-soft);
  }

  .nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding-top: 4px;
    padding-bottom: 4px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0;
    min-height: var(--tap);
    margin-left: -12px;
    color: var(--text);
    text-decoration: none;
  }

  .brand-name {
    font-family: var(--font-mono);
    font-size: 13px;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }

  .nav-links {
    display: flex;
    align-items: center;
    gap: 28px;
    font-size: 14px;
  }

  .anchor {
    display: inline-flex;
    align-items: center;
    min-height: var(--tap);
    color: var(--text-muted);
    text-decoration: none;
    transition: color 0.15s;
  }

  .anchor:hover {
    color: var(--text);
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: var(--tap);
    padding: 9px 16px;
    color: var(--text);
    text-decoration: none;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    transition: border-color 0.15s;
  }

  .pill:hover {
    border-color: var(--text-ghost);
  }

  /* Mobil nur Logo + GitHub — die Anker-Links würden sonst umbrechen */
  @media (max-width: 639px) {
    .anchor {
      display: none;
    }
  }

  /* ---------- Hero ---------- */
  .hero {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 440px), 1fr));
    gap: 56px;
    align-items: center;
    padding-top: 72px;
    padding-bottom: 56px;
  }

  .hero-copy .eyebrow {
    margin-bottom: 20px;
  }

  h1 {
    font-size: var(--fs-hero);
    line-height: 0.92;
    letter-spacing: -1px;
  }

  .lead {
    max-width: 500px;
    margin-top: 28px;
    font-size: var(--fs-lead);
    color: var(--text-2);
  }

  .cta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 36px;
  }

  .hint {
    margin-top: 16px;
    font-size: 14px;
    color: var(--text-faint);
  }

  .trust {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 22px;
    margin-top: 32px;
    list-style: none;
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--text-muted);
  }

  .trust li {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .trust li::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
  }

  /* ---------- Bühne ---------- */
  .stage {
    min-width: 0;
    background: var(--surface);
    border: 1px solid #26262b;
    border-radius: var(--radius-xl);
    overflow: hidden;
    box-shadow: 0 40px 80px -30px rgba(0, 0, 0, 0.8);
  }

  .stage-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--line);
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-faint);
  }

  .stage-url {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pulse {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
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

  /* Feste Höhe für alle Tabs — sonst springt die Karte beim Tab-Wechsel */
  .stage-body {
    container-type: inline-size;
    height: 340px;
    display: flex;
    flex-direction: column;
  }

  .demo-timer {
    --phase: var(--accent);
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 16px;
    flex: 1;
    padding: 24px 28px 8px;
  }

  .demo-timer.rest {
    --phase: var(--rest);
  }

  /* Pausiert: Label in Orange, Ziffern zurückgenommen — wie in der Timer-Leiste der App */
  .demo-timer.paused {
    --phase: var(--rest);
  }

  .demo-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    font-family: var(--font-mono);
    font-size: 13px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .phase {
    color: var(--phase);
    font-weight: 700;
  }

  .demo-clock {
    font-family: var(--font-mono);
    font-weight: 800;
    font-size: clamp(80px, 11vw, 128px);
    font-variant-numeric: tabular-nums;
    line-height: 1;
    letter-spacing: -4px;
    text-align: center;
    color: var(--phase);
    background: none;
    border: none;
    border-radius: var(--radius);
    cursor: pointer;
  }

  .paused .demo-clock {
    color: var(--text-faint);
  }

  .paused .bar-fill {
    background: var(--text-ghost);
  }

  .bar {
    height: 8px;
    background: var(--line);
    border-radius: 4px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    background: var(--phase);
    border-radius: 4px;
    transition: width 1s linear;
  }

  .rounds {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 6px;
  }

  .seg {
    height: 6px;
    border-radius: 3px;
    background: var(--line);
  }

  .seg.done {
    background: var(--accent);
  }

  .seg.current {
    background: var(--round-current);
  }

  .demo-ki {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 16px;
    flex: 1;
    padding: 24px 28px;
  }

  .prompt {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    font-size: 15px;
    color: var(--text-2);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
  }

  .prompt svg {
    flex-shrink: 0;
    color: var(--accent);
  }

  .wod {
    padding: 8px 0;
    font-family: var(--font-mono);
    font-size: 17px;
    line-height: 1.7;
    text-align: center;
  }

  .detected {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    font-size: 14px;
    color: var(--text-2);
    background: var(--accent-tint-bg);
    border: 1px solid var(--accent-tint-line);
    border-radius: var(--radius);
  }

  .detected strong,
  .detected .mono {
    color: var(--accent);
  }

  .demo-sync {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 28px;
    flex: 1;
    padding: 28px;
  }

  .screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    flex: 0 1 250px;
    min-width: 0;
    height: 160px;
    border: 2px solid var(--line-strong);
    border-radius: var(--radius);
  }

  .screen-label {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-faint);
  }

  .screen-clock {
    font-family: var(--font-mono);
    font-weight: 800;
    font-size: 52px;
    line-height: 1;
    color: var(--accent);
  }

  .screen-clock.paused {
    color: var(--text-faint);
  }

  .link {
    flex-shrink: 0;
    color: var(--accent);
  }

  .phone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    flex: 0 0 96px;
    height: 176px;
    border: 2px solid var(--line-strong);
    border-radius: var(--radius-xl);
  }

  .phone-clock {
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 20px;
  }

  .phone-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: none;
    border-radius: 50%;
    color: var(--accent-ink);
    background: var(--accent);
    cursor: pointer;
  }

  /* Schmale Karte: Verbindungslinie weg, damit TV und Handy nebeneinander bleiben */
  @container (max-width: 500px) {
    .demo-sync {
      gap: 16px;
      padding: 20px;
    }
    .link {
      display: none;
    }
    .screen-clock {
      font-size: 40px;
    }
    .demo-ki {
      gap: 12px;
      padding: 16px 20px;
    }
  }

  .phone-btn.paused {
    background: var(--rest);
  }

  .stage-actions {
    display: flex;
    justify-content: flex-end;
    margin-right: -16px;
  }

  .demo-toggle {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: var(--tap);
    padding: 0 16px;
    font-family: var(--font-mono);
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent-tint-text);
    background: var(--accent-tint-bg);
    border: 1px solid var(--accent-tint-line);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .demo-toggle:hover {
    border-color: var(--accent);
  }

  /* Orange heißt pausiert: der Button lädt zum Fortsetzen ein */
  .demo-toggle.paused {
    color: var(--rest);
    background: transparent;
    border-color: var(--rest);
  }

  .stage-tabs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    border-top: 1px solid var(--line);
  }

  .stage-tab {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    min-height: 64px;
    padding: 16px 18px;
    text-align: left;
    font-family: var(--font-ui);
    background: transparent;
    border: none;
    border-top: 2px solid transparent;
    margin-top: -1px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .stage-tab:hover {
    background: var(--surface-hover);
  }

  .stage-tab.active {
    background: var(--surface-hover);
    border-top-color: var(--accent);
  }

  .tab-title {
    font-weight: 600;
    font-size: 14px;
    color: var(--text-muted);
  }

  .stage-tab.active .tab-title {
    color: var(--text);
  }

  .tab-short {
    font-size: 12px;
    color: var(--text-faint);
  }

  @media (max-width: 479px) {
    .stage-tab {
      padding: 12px 10px;
    }
    .tab-short {
      display: none;
    }
  }

  /* ---------- Preset-Ticker ---------- */
  .ticker {
    background: var(--bg-band);
    border-top: 1px solid var(--line-soft);
    border-bottom: 1px solid var(--line-soft);
  }

  .ticker-inner {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 14px 32px;
    padding-top: 22px;
    padding-bottom: 22px;
    font-family: var(--font-display);
    font-style: italic;
    font-weight: 800;
    font-size: 26px;
    line-height: 1.2;
    text-transform: uppercase;
    color: var(--text-ghost);
  }

  .slash {
    color: var(--accent);
  }

  /* ---------- So funktioniert's ---------- */
  .steps-section {
    padding-top: 112px;
    padding-bottom: 40px;
    scroll-margin-top: 0;
  }

  .steps-title {
    max-width: 760px;
    margin-bottom: 56px;
  }

  .steps {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
    gap: 20px;
    list-style: none;
  }

  .step {
    padding-top: 24px;
    border-top: 2px solid var(--line-strong);
  }

  .step.first {
    border-top-color: var(--accent);
  }

  .step-no {
    display: block;
    font-family: var(--font-mono);
    font-weight: 800;
    font-size: 44px;
    line-height: 1;
  }

  .step.first .step-no {
    color: var(--accent);
  }

  .step h3 {
    margin: 18px 0 8px;
    font-size: var(--fs-h3);
  }

  .step p {
    color: var(--text-muted);
  }

  /* ---------- Features ---------- */
  .features-section {
    padding-top: var(--section-y);
    padding-bottom: var(--section-y);
  }

  .features-head {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-end;
    gap: 24px;
    margin-bottom: 48px;
  }

  .features-head p {
    max-width: 380px;
    color: var(--text-muted);
  }

  .feature {
    min-width: 0;
    padding: 32px;
    background: #0f0f11;
  }

  .feature svg {
    color: var(--accent);
  }

  .feature h3 {
    margin: 18px 0 8px;
  }

  .feature p {
    color: var(--text-muted);
  }

  .feature-big {
    margin-bottom: 16px;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
  }

  .feature-big p {
    max-width: 560px;
    margin-bottom: 22px;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    list-style: none;
    font-family: var(--font-mono);
    font-size: 13px;
  }

  .chips li {
    padding: 7px 12px;
    color: var(--accent-tint-text);
    background: var(--accent-tint-bg);
    border: 1px solid var(--accent-tint-line);
    border-radius: 999px;
  }

  /* 1px-Fugen: gap auf Linienfarbe statt Rahmen pro Karte */
  .feature-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
    gap: 1px;
    background: var(--line);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  /* ---------- Tastatur-Band ---------- */
  .keys-section {
    padding-bottom: var(--section-y);
  }

  .keys {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 24px 40px;
    padding: 32px;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
  }

  .keys h3 {
    margin-bottom: 6px;
  }

  .keys p {
    color: var(--text-muted);
  }

  .key-list {
    display: flex;
    flex-wrap: wrap;
    gap: 14px 28px;
    list-style: none;
    font-size: 14px;
    color: var(--text-2);
  }

  .key-list li {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  kbd {
    padding: 5px 10px;
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--text);
    border: 1px solid #3a3a40;
    border-bottom-width: 3px;
    border-radius: 6px;
  }

  /* ---------- Open Source ---------- */
  .open {
    background: var(--bg-band);
    border-top: 1px solid var(--line-soft);
    border-bottom: 1px solid var(--line-soft);
  }

  .open-inner {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr));
    gap: 48px;
    align-items: start;
    padding-top: var(--section-y);
    padding-bottom: var(--section-y);
  }

  .open-text {
    max-width: 480px;
    margin-top: 24px;
    color: var(--text-muted);
  }

  .gh {
    min-height: 48px;
    margin-top: 28px;
    padding: 14px 22px;
    font-size: 16px;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1px;
    background: var(--line);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .stat {
    padding: 28px;
    background: var(--bg);
  }

  .stat dt {
    font-family: var(--font-mono);
    font-weight: 800;
    font-size: 48px;
    line-height: 1;
  }

  .stat dt.lime {
    color: var(--accent);
  }

  .stat dd {
    margin-top: 10px;
    font-size: 15px;
    color: var(--text-muted);
  }

  /* ---------- Schluss-CTA ---------- */
  .final {
    padding-top: 120px;
    padding-bottom: 120px;
    text-align: center;
  }

  .countdown {
    font-family: var(--font-mono);
    font-weight: 800;
    font-size: clamp(72px, 14vw, 180px);
    line-height: 1;
    letter-spacing: -4px;
    color: var(--line-soft);
    user-select: none;
  }

  .final h2 {
    margin-top: -12px;
    font-size: clamp(44px, 6vw, 80px);
  }

  .final p {
    max-width: 460px;
    margin: 20px auto 0;
    font-size: 18px;
    color: var(--text-muted);
  }

  .final .cta {
    margin-top: 36px;
  }

  /* ---------- Footer ---------- */
  .footer {
    border-top: 1px solid var(--line-soft);
  }

  .footer-inner {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding-top: 20px;
    padding-bottom: 20px;
    font-size: 14px;
    color: var(--text-faint);
  }

  .copy {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: -8px;
  }

  .legal-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0 12px;
  }

  .legal-links button,
  .legal-links a {
    display: inline-flex;
    align-items: center;
    min-height: var(--tap);
    padding: 0 6px;
    font: inherit;
    color: var(--text-muted);
    text-decoration: none;
    background: none;
    border: none;
    cursor: pointer;
    transition: color 0.15s;
  }

  .legal-links button:hover,
  .legal-links a:hover {
    color: var(--text);
  }

  @media (prefers-reduced-motion: reduce) {
    .landing {
      scroll-behavior: auto;
    }
    .pulse {
      animation: none;
    }
    .bar-fill {
      transition: none;
    }
  }
</style>
