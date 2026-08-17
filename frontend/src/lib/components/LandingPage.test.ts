import { describe, it, expect, afterEach } from 'vitest'
import { mount, unmount, flushSync } from 'svelte'
import LandingPage from './LandingPage.svelte'

let component: Record<string, unknown>

describe('LandingPage', () => {
  afterEach(() => {
    unmount(component)
    document.body.innerHTML = ''
  })

  it('zeigt den Produktnamen und den CTA-Button', () => {
    component = mount(LandingPage, { target: document.body })
    flushSync()
    expect(document.querySelector('h1')?.textContent).toBe('WODch')
    expect(document.querySelector('.cta')?.textContent).toContain('Jetzt starten')
  })

  it('rendert die drei Feature-Videos mit korrekten YouTube-Embeds', () => {
    component = mount(LandingPage, { target: document.body })
    flushSync()
    const iframes = Array.from(document.querySelectorAll('.video iframe')) as HTMLIFrameElement[]
    expect(iframes).toHaveLength(3)
    expect(iframes.map((f) => f.src)).toEqual([
      'https://www.youtube.com/embed/oSdlbRmrgNw?rel=0',
      'https://www.youtube.com/embed/0CU6XrGlTbw?rel=0',
      'https://www.youtube.com/embed/zgr379mhAPQ?rel=0',
    ])
  })

  it('zeigt die drei Feature-Überschriften', () => {
    component = mount(LandingPage, { target: document.body })
    flushSync()
    const headings = Array.from(document.querySelectorAll('.feature h2')).map((h) => h.textContent)
    expect(headings).toEqual(['Intervall-Timer', 'KI-generierte Workouts', 'Fernsteuerung per Link'])
  })
})
