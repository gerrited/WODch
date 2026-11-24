import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, unmount, flushSync } from 'svelte'
import LandingPage from './LandingPage.svelte'

const { create } = vi.hoisted(() => ({ create: vi.fn(async () => {}) }))
vi.mock('../sync/session.svelte', () => ({ session: { create } }))

let component: Record<string, unknown>

function render() {
  component = mount(LandingPage, { target: document.body })
  flushSync()
}

function iframes() {
  return Array.from(document.querySelectorAll('iframe')) as HTMLIFrameElement[]
}

function tabs() {
  return Array.from(document.querySelectorAll('.stage-tab')) as HTMLButtonElement[]
}

function videoToggle() {
  return document.querySelector('.video-toggle') as HTMLButtonElement
}

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }))
}

describe('LandingPage', () => {
  afterEach(() => {
    unmount(component)
    document.body.innerHTML = ''
    vi.useRealTimers()
    vi.unstubAllGlobals()
    create.mockClear()
  })

  it('zeigt die Headline und den Produktnamen im Logo-Link', () => {
    render()
    expect(document.querySelector('h1')?.textContent).toContain('Die Uhr')
    expect(document.querySelector('a.brand')?.getAttribute('aria-label')).toBe('WODch Startseite')
  })

  it('beide Primär-Buttons starten eine Session', async () => {
    render()
    const ctas = Array.from(document.querySelectorAll('button.cta')) as HTMLButtonElement[]
    expect(ctas.map((b) => b.textContent?.trim())).toEqual(['Session starten', 'Jetzt starten'])

    ctas[0].click()
    flushSync()
    expect(create).toHaveBeenCalledTimes(1)
    expect(ctas[0].disabled).toBe(true)
    expect(ctas[0].textContent).toContain('Session wird erstellt…')
    await vi.waitFor(() => expect(ctas[0].disabled).toBe(false))

    ctas[1].click()
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('lädt ohne Klick kein Video-IFrame', () => {
    render()
    expect(iframes()).toHaveLength(0)
    for (const tab of tabs()) {
      tab.click()
      flushSync()
      expect(iframes()).toHaveLength(0)
    }
  })

  it('„Video ansehen“ lädt genau ein IFrame mit dem Video des aktiven Tabs', () => {
    render()
    videoToggle().click()
    flushSync()
    expect(iframes()).toHaveLength(1)
    expect(iframes()[0].src).toBe('https://www.youtube-nocookie.com/embed/oSdlbRmrgNw?rel=0')

    tabs()[1].click()
    flushSync()
    expect(iframes()).toHaveLength(1)
    expect(iframes()[0].src).toBe('https://www.youtube-nocookie.com/embed/0CU6XrGlTbw?rel=0')
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true')

    tabs()[2].click()
    flushSync()
    expect(iframes()).toHaveLength(1)
    expect(iframes()[0].src).toBe('https://www.youtube-nocookie.com/embed/zgr379mhAPQ?rel=0')

    // Zurück zur Live-Demo entfernt das IFrame wieder
    videoToggle().click()
    flushSync()
    expect(iframes()).toHaveLength(0)
    expect(document.querySelector('.demo-sync')).not.toBeNull()
  })

  it('die Tabs wechseln die Live-Demo', () => {
    render()
    expect(document.querySelector('.demo-timer')).not.toBeNull()
    tabs()[1].click()
    flushSync()
    expect(document.querySelector('.demo-ki')).not.toBeNull()
    tabs()[2].click()
    flushSync()
    expect(document.querySelector('.demo-sync')).not.toBeNull()
  })

  it('die Timer-Demo tickt lokal', () => {
    vi.useFakeTimers()
    mockReducedMotion(false)
    render()
    const clock = () => document.querySelector('.demo-clock')?.textContent
    expect(clock()).toBe('00:15')
    vi.advanceTimersByTime(3000)
    flushSync()
    expect(clock()).toBe('00:12')
  })

  it('bei reduzierter Bewegung steht die Demo still', () => {
    vi.useFakeTimers()
    mockReducedMotion(true)
    render()
    vi.advanceTimersByTime(5000)
    flushSync()
    expect(document.querySelector('.demo-clock')?.textContent).toBe('00:15')
  })

  it('zeigt die Feature-Überschriften', () => {
    render()
    const headings = Array.from(document.querySelectorAll('.feature h3')).map((h) => h.textContent)
    expect(headings).toEqual([
      'Intervall-Timer mit 5 Modi',
      'KI-Workouts',
      'Fernsteuerung per Link',
      'Workout-Board',
      'Video daneben',
      'Ansagen & Vibration',
      'Läuft auch offline',
    ])
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
