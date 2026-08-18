import { describe, it, expect, afterEach } from 'vitest'
import { mount, unmount, flushSync } from 'svelte'
import LandingPage from './LandingPage.svelte'

let component: Record<string, unknown>

function render() {
  component = mount(LandingPage, { target: document.body })
  flushSync()
}

function stageIframe() {
  return document.querySelector('.video iframe') as HTMLIFrameElement | null
}

describe('LandingPage', () => {
  afterEach(() => {
    unmount(component)
    document.body.innerHTML = ''
  })

  it('zeigt den Produktnamen und den CTA-Button', () => {
    render()
    expect(document.querySelector('h1')?.textContent).toBe('WODch')
    expect(document.querySelector('.cta')?.textContent).toContain('Jetzt starten')
  })

  it('zeigt im Hero genau ein großes Video — das erste Feature', () => {
    render()
    expect(document.querySelectorAll('.video iframe')).toHaveLength(1)
    expect(stageIframe()?.src).toBe('https://www.youtube-nocookie.com/embed/oSdlbRmrgNw?rel=0')
  })

  it('die Tabs wechseln das Video in der Bühne', () => {
    render()
    const tabs = Array.from(document.querySelectorAll('.stage-tab')) as HTMLButtonElement[]
    expect(tabs).toHaveLength(3)

    tabs[1].click()
    flushSync()
    expect(stageIframe()?.src).toBe('https://www.youtube-nocookie.com/embed/0CU6XrGlTbw?rel=0')
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')

    tabs[2].click()
    flushSync()
    expect(stageIframe()?.src).toBe('https://www.youtube-nocookie.com/embed/zgr379mhAPQ?rel=0')
  })

  it('"Video ansehen" in einer Feature-Karte wählt das passende Video', () => {
    render()
    const playButtons = Array.from(document.querySelectorAll('.play')) as HTMLButtonElement[]
    playButtons[2].click()
    flushSync()
    expect(stageIframe()?.src).toBe('https://www.youtube-nocookie.com/embed/zgr379mhAPQ?rel=0')
  })

  it('zeigt die drei Feature-Überschriften', () => {
    render()
    const headings = Array.from(document.querySelectorAll('.feature h2')).map((h) => h.textContent)
    expect(headings).toEqual(['Intervall-Timer', 'KI-generierte Workouts', 'Fernsteuerung per Link'])
  })

  it('Datenschutz und Impressum öffnen je ein Modal und schließen wieder', () => {
    render()
    const [datenschutz, impressum] = Array.from(
      document.querySelectorAll('.legal-links button'),
    ) as HTMLButtonElement[]

    expect(document.querySelector('.legal')).toBeNull()

    datenschutz.click()
    flushSync()
    expect(document.querySelector('.legal h2')?.textContent).toBe('Datenschutzerklärung')
    ;(document.querySelector('.legal .close-btn') as HTMLButtonElement).click()
    flushSync()
    expect(document.querySelector('.legal')).toBeNull()

    impressum.click()
    flushSync()
    expect(document.querySelector('.legal h2')?.textContent).toBe('Impressum')
  })
})
