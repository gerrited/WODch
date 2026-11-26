import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, unmount, flushSync } from 'svelte'
import LandingPage from './LandingPage.svelte'
import { timer } from '../stores/timer.svelte'
import { defaultTimerDoc } from '../types'

const { create } = vi.hoisted(() => ({ create: vi.fn(async (_prepare?: () => void) => {}) }))
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

function demoToggle() {
  return document.querySelector('.demo-toggle') as HTMLButtonElement
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
    timer.doc = defaultTimerDoc()
  })

  function kinds() {
    return Array.from(document.querySelectorAll('.kind')) as HTMLButtonElement[]
  }

  function stepButton(label: string) {
    return document.querySelector(`.step-btn[aria-label="${label}"]`) as HTMLButtonElement
  }

  // Ruft den prepare-Callback auf, den die Landing Page an session.create übergibt
  async function startAndPrepare(cta: HTMLButtonElement) {
    cta.click()
    flushSync()
    const prepare = create.mock.calls.at(-1)?.[0]
    expect(prepare).toBeTypeOf('function')
    prepare!()
    await vi.waitFor(() => expect(cta.disabled).toBe(false))
  }

  it('WOD-Baukasten: fünf Arten, Tabata vorausgewählt, Start übernimmt den Timer in die Session', async () => {
    render()
    expect(kinds().map((k) => k.textContent?.trim())).toEqual(['Tabata', 'EMOM', 'AMRAP', 'For Time', 'Intervall'])
    expect(kinds()[0].getAttribute('aria-checked')).toBe('true')
    expect(document.querySelector('.preview-clock')?.textContent).toBe('00:20')
    expect(document.querySelector('.preview-total')?.textContent).toContain('04:00')

    await startAndPrepare(document.querySelector('button.cta-block') as HTMLButtonElement)
    expect(timer.doc).toMatchObject({ mode: 'interval', preset: 'tabata', totalRounds: 8, isRunning: false })
  })

  it('AMRAP einstellen: Stepper ändert Dauer, Vorschau und CTA folgen', async () => {
    render()
    kinds()[2].click()
    flushSync()
    expect(document.querySelector('button.cta-block')?.textContent?.trim()).toBe('AMRAP starten')
    stepButton('Dauer verringern').click()
    stepButton('Dauer verringern').click()
    flushSync()
    expect(document.querySelector('.field-value')?.textContent).toBe('18 min')
    expect(document.querySelector('.preview-clock')?.textContent).toBe('18:00')
    expect(document.querySelector('.final-wod')?.textContent).toContain('AMRAP · 18 min')

    // Auch der Schluss-CTA startet mit dem eingestellten WOD
    const ctas = Array.from(document.querySelectorAll('button.cta')) as HTMLButtonElement[]
    await startAndPrepare(ctas[2])
    expect(timer.doc).toMatchObject({ mode: 'countdown', countdownTarget: 18 * 60_000 })
  })

  it('Stepper respektiert Grenzen und sperrt den Button am Rand', () => {
    render()
    const minus = stepButton('Blöcke verringern')
    expect(minus.disabled).toBe(true)
    minus.click()
    flushSync()
    expect(document.querySelector('.field-value')?.textContent).toBe('1')
  })

  it('Pfeiltasten wechseln die Workout-Art wie in einer Radiogroup', () => {
    render()
    kinds()[0].focus()
    kinds()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    flushSync()
    expect(kinds()[4].getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(kinds()[4])
    expect(document.querySelectorAll('.field')).toHaveLength(3)
  })

  it('For Time hat nichts einzustellen und kein Zeitlimit', () => {
    render()
    kinds()[3].click()
    flushSync()
    expect(document.querySelector('.field-empty')).not.toBeNull()
    expect(document.querySelector('.timeline.open-end')).not.toBeNull()
    expect(document.querySelector('.preview-total')?.textContent).toContain('ohne Zeitlimit')
  })

  it('zeigt die Headline und den Produktnamen im Logo-Link', () => {
    render()
    expect(document.querySelector('h1')?.textContent).toContain('Die Uhr')
    expect(document.querySelector('a.brand')?.getAttribute('aria-label')).toBe('WODch Startseite')
  })

  it('alle Primär-Buttons (Navigation, Hero, Schluss) starten eine Session', async () => {
    render()
    const ctas = Array.from(document.querySelectorAll('button.cta')) as HTMLButtonElement[]
    expect(ctas.map((b) => b.textContent?.trim())).toEqual(['Session starten', 'Tabata starten', 'Jetzt starten'])
    expect(ctas[0].closest('nav')).not.toBeNull()

    ctas[0].click()
    flushSync()
    expect(create).toHaveBeenCalledTimes(1)
    expect(ctas[0].disabled).toBe(true)
    expect(ctas[0].textContent).toContain('Session wird erstellt…')
    await vi.waitFor(() => expect(ctas[0].disabled).toBe(false))

    ctas[1].click()
    flushSync()
    expect(create).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(ctas[1].disabled).toBe(false))

    ctas[2].click()
    expect(create).toHaveBeenCalledTimes(3)
  })

  it('lädt keine Videos (kein IFrame, auch nicht nach Tab-Wechsel)', () => {
    render()
    expect(iframes()).toHaveLength(0)
    for (const tab of tabs()) {
      tab.click()
      flushSync()
      expect(iframes()).toHaveLength(0)
    }
  })

  it('Pause hält die Demo an, Fortsetzen lässt sie weiterlaufen', () => {
    vi.useFakeTimers()
    mockReducedMotion(false)
    render()
    const clock = () => document.querySelector('.demo-clock')?.textContent?.trim()

    demoToggle().click()
    flushSync()
    expect(document.querySelector('.phase')?.textContent).toContain('Pausiert')
    expect(demoToggle().getAttribute('aria-pressed')).toBe('true')
    vi.advanceTimersByTime(3000)
    flushSync()
    expect(clock()).toBe('00:15')

    demoToggle().click()
    flushSync()
    vi.advanceTimersByTime(2000)
    flushSync()
    expect(clock()).toBe('00:13')
  })

  it('Klick auf die Zeit pausiert ebenfalls — wie die Timer-Leiste der App', () => {
    vi.useFakeTimers()
    mockReducedMotion(false)
    render()
    ;(document.querySelector('.demo-clock') as HTMLButtonElement).click()
    flushSync()
    vi.advanceTimersByTime(3000)
    flushSync()
    expect(document.querySelector('.demo-clock')?.textContent?.trim()).toBe('00:15')
    expect(document.querySelector('.demo-timer.paused')).not.toBeNull()
  })

  it('der Handy-Button in der Fernsteuerungs-Demo pausiert dieselbe Zeit', () => {
    vi.useFakeTimers()
    mockReducedMotion(false)
    render()
    tabs()[2].click()
    flushSync()
    const phoneBtn = document.querySelector('.phone-btn') as HTMLButtonElement
    expect(phoneBtn.getAttribute('aria-label')).toBe('Demo pausieren')
    phoneBtn.click()
    flushSync()
    vi.advanceTimersByTime(3000)
    flushSync()
    expect(document.querySelector('.screen-clock')?.textContent).toBe('00:15')
    expect(phoneBtn.getAttribute('aria-label')).toBe('Demo fortsetzen')
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
    const clock = () => document.querySelector('.demo-clock')?.textContent?.trim()
    expect(clock()).toBe('00:15')
    vi.advanceTimersByTime(3000)
    flushSync()
    expect(clock()).toBe('00:12')
  })

  it('bei reduzierter Bewegung startet die Demo pausiert', () => {
    vi.useFakeTimers()
    mockReducedMotion(true)
    render()
    vi.advanceTimersByTime(5000)
    flushSync()
    expect(document.querySelector('.demo-clock')?.textContent?.trim()).toBe('00:15')
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
