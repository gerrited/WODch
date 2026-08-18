<script lang="ts">
  // Datenschutz und Impressum als Overlay — die Landing-Page bleibt damit eine
  // einzige Route, der Minimal-Router (nur '/' und App) muss nichts lernen.
  let { kind, onClose }: { kind: 'privacy' | 'imprint'; onClose: () => void } = $props()

  // Anbieterkennzeichnung nach § 5 DDG — identisch zum Impressum von foreversports.cc
  const anbieter = {
    name: 'Gerrit Edzards',
    strasse: 'Bussardweg 86',
    ort: '26133 Oldenburg',
    email: 'hi@wodch.com',
    webseite: 'www.wodch.com',
  }

  const title = $derived(kind === 'privacy' ? 'Datenschutzerklärung' : 'Impressum')

  let closeBtn: HTMLButtonElement | undefined = $state()

  // Erst der Fokus im Dialog macht Escape und Tab-Navigation nutzbar
  $effect(() => {
    closeBtn?.focus()
  })

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
    }
  }

  function onOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="legal-overlay" onclick={onOverlayClick} role="presentation">
  <div class="legal" role="dialog" aria-modal="true" aria-label={title}>
    <header>
      <h2>{title}</h2>
      <button class="close-btn" bind:this={closeBtn} onclick={onClose} aria-label="Schließen">✕</button>
    </header>

    <div class="body">
      {#if kind === 'privacy'}
        <p class="stand">Stand: August 2026</p>

        <h3>1. Verantwortlicher</h3>
        <p>
          {anbieter.name}<br />
          {anbieter.strasse}<br />
          {anbieter.ort}<br />
          E-Mail: <a href={`mailto:${anbieter.email}`}>{anbieter.email}</a>
        </p>

        <h3>2. Grundsatz</h3>
        <p>
          WODch braucht kein Benutzerkonto, keine Anmeldung und keine Datenbank. Es werden keine
          Profile gebildet, kein Tracking und keine Web-Analyse eingesetzt und keine Daten zu
          Werbezwecken ausgewertet oder verkauft.
        </p>

        <h3>3. Session-Daten</h3>
        <p>
          Für die Fernsteuerung per Link hält der Server den Zustand einer Session (Timer-Einstellungen,
          Workout-Texte, Video-Link) ausschließlich im Arbeitsspeicher. Diese Daten werden nicht auf
          Datenträger geschrieben und gehen beim Beenden der Session bzw. bei einem Neustart des Dienstes
          verloren. Wer die Session-URL kennt, kann den Inhalt sehen und ändern — bitte gib dort keine
          personenbezogenen oder vertraulichen Daten ein. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO
          (Bereitstellung der angeforderten Funktion).
        </p>

        <h3>4. Verbindungsdaten und Missbrauchsschutz</h3>
        <p>
          Beim Abruf der Seite und beim Verbinden zum Sync-Dienst wird deine IP-Adresse technisch
          übertragen. Sie wird kurzzeitig im Arbeitsspeicher gehalten, um Zugriffe zu begrenzen
          (Rate-Limits gegen Missbrauch), und nicht dauerhaft gespeichert. Rechtsgrundlage:
          Art. 6 Abs. 1 lit. f DSGVO (Sicherheit und Stabilität des Dienstes).
        </p>

        <h3>5. Speicherung im Browser</h3>
        <p>
          WODch setzt keine Cookies. Einige Einstellungen — etwa der zuletzt aktive Tab, ein eigenes
          Intervall-Programm und der Hinweis, dass die Tour bereits gesehen wurde — werden lokal im
          <code>localStorage</code> deines Browsers abgelegt. Diese Daten verlassen dein Gerät nicht und
          können jederzeit über die Browser-Einstellungen gelöscht werden.
        </p>

        <h3>6. KI-generierte Workouts</h3>
        <p>
          Nutzt du die Workout-Generierung oder die Zeitschätzung, wird dein Prompt bzw. der Workout-Text
          zur Verarbeitung an Anthropic PBC (Claude API) übermittelt und das Ergebnis an dich
          zurückgegeben. Übermittelt wird nur der eingegebene Text. Details:
          <a href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noopener noreferrer">
            Datenschutzhinweise von Anthropic
          </a>. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.
        </p>

        <h3>7. YouTube-Videos</h3>
        <p>
          Die Videos auf dieser Seite und im Video-Tab werden über YouTube eingebettet (Google Ireland
          Limited, Gordon House, Barrow Street, Dublin 4, Irland) — im erweiterten Datenschutzmodus über
          die Domain <code>youtube-nocookie.com</code>. In diesem Modus setzt YouTube erst dann Cookies,
          wenn du ein Video tatsächlich abspielst. Beim Laden des Players baut dein Browser dennoch eine
          Verbindung zu Google-Servern auf; dabei werden IP-Adresse und Geräteinformationen an Google
          übertragen und je nach Anmeldestatus deinem Google-Konto zugeordnet. Darauf haben wir keinen
          Einfluss. Details:
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
            Datenschutzerklärung von Google
          </a>.
        </p>

        <h3>8. Deine Rechte</h3>
        <p>
          Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
          Datenübertragbarkeit sowie Widerspruch gegen Verarbeitungen auf Grundlage von
          Art. 6 Abs. 1 lit. f DSGVO. Wende dich dazu an die oben genannte Adresse. Außerdem kannst du
          dich bei einer Datenschutz-Aufsichtsbehörde beschweren.
        </p>

        <h3>9. Änderungen</h3>
        <p>
          Ändert sich der Funktionsumfang von WODch, wird diese Erklärung angepasst. Es gilt jeweils die
          hier abrufbare Fassung.
        </p>
      {:else}
        <h3>Anbieterkennzeichnung gemäß § 5 DDG</h3>
        <p>
          {anbieter.name}<br />
          {anbieter.strasse}<br />
          {anbieter.ort}
        </p>

        <h3>Kontakt</h3>
        <p>
          E-Mail: <a href={`mailto:${anbieter.email}`}>{anbieter.email}</a><br />
          Webseite:
          <a href={`https://${anbieter.webseite}/`} target="_blank" rel="noopener noreferrer">
            {anbieter.webseite}
          </a>
        </p>

        <h3>Verantwortlich für den Inhalt</h3>
        <p>{anbieter.name} (Anschrift wie oben)</p>

        <h3>Art des Angebots</h3>
        <p>
          WODch ist ein privates, nicht-kommerzielles Hobby-Projekt. Der Quellcode steht unter der
          MIT-Lizenz auf
          <a href="https://github.com/gerrited/WODch" target="_blank" rel="noopener noreferrer">GitHub</a>
          zur Verfügung.
        </p>

        <h3>Haftungsausschluss</h3>
        <p>
          Die Inhalte werden mit Sorgfalt erstellt, eine Gewähr für Richtigkeit und Vollständigkeit wird
          jedoch nicht übernommen. Trotz sorgfältiger technischer Umsetzung erfolgt die Nutzung auf eigene
          Gefahr; für Datenverluste im Rahmen der Nutzung wird keine Haftung übernommen.
        </p>
        <p>
          WODch ist kein medizinischer Ratgeber: Trainingsinhalte — insbesondere KI-generierte Workouts —
          sind unverbindliche Vorschläge und ersetzen keine fachliche Beratung. Für die Inhalte verlinkter
          externer Seiten sind ausschließlich deren Betreiber verantwortlich.
        </p>

        <h3>Streitschlichtung</h3>
        <p>
          Zur Teilnahme an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle sind
          wir nicht verpflichtet und nicht bereit.
        </p>
      {/if}
    </div>
  </div>
</div>

<style>
  .legal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.82);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    z-index: 200;
    overscroll-behavior: contain;
  }

  .legal {
    background: #0d0d0d;
    border: 1px solid #333;
    border-radius: 12px;
    width: min(720px, 100%);
    max-height: min(80vh, 900px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 20px;
    border-bottom: 1px solid #222;
    flex-shrink: 0;
  }

  header h2 {
    font-size: 1rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #fff;
  }

  .close-btn {
    background: none;
    border: none;
    color: #666;
    font-family: monospace;
    font-size: 16px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .close-btn:hover,
  .close-btn:focus-visible {
    color: #fff;
    outline: none;
    background: #1a1a1a;
  }

  .body {
    overflow-y: auto;
    padding: 20px 24px 28px;
  }

  .stand {
    color: #666;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 20px;
  }

  .body h3 {
    font-size: 0.9rem;
    color: #a8d129;
    margin: 22px 0 8px;
  }

  .body h3:first-of-type {
    margin-top: 0;
  }

  .body p {
    color: #aaa;
    font-size: 0.85rem;
    line-height: 1.65;
  }

  .body a {
    color: #2dc653;
  }

  .body code {
    font-family: monospace;
    color: #ccc;
  }
</style>
