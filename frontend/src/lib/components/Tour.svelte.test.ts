import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, unmount, flushSync } from 'svelte'
import Tour from './Tour.svelte'
import type { TourStep } from './tour'

const steps: TourStep[] = [
  { target: null, title: 'Start', body: 'Erster Schritt' },
  { target: 'ziel-a', tab: 1, title: 'Mitte', body: 'Zweiter Schritt' },
  { target: 'ziel-b', title: 'Ende', body: 'Letzter Schritt' },
]

let component: Record<string, unknown>

function mountTour(props: { onClose?: () => void; onTab?: (tab: number) => void } = {}) {
  component = mount(Tour, {
    target: document.body,
    props: { steps, onClose: props.onClose ?? (() => {}), onTab: props.onTab },
  })
  flushSync()
}

function click(selector: string) {
  ;(document.querySelector(selector) as HTMLButtonElement).click()
  flushSync()
}

describe('Tour', () => {
  afterEach(() => {
    unmount(component)
    document.body.innerHTML = ''
  })

  it('zeigt den ersten Schritt mit Titel, Text und Schrittanzeige', () => {
    mountTour()
    expect(document.querySelector('.tour-title')?.textContent).toBe('Start')
    expect(document.querySelector('.tour-body')?.textContent).toBe('Erster Schritt')
    expect(document.querySelector('.tour-progress')?.textContent).toBe('1/3')
  })

  it('blendet Zurück im ersten Schritt aus und zeigt es danach', () => {
    mountTour()
    expect(document.querySelector('.tour-back')).toBeNull()
    click('.tour-next')
    expect(document.querySelector('.tour-back')).not.toBeNull()
  })

  it('navigiert mit Weiter und Zurück durch die Schritte', () => {
    mountTour()
    click('.tour-next')
    expect(document.querySelector('.tour-title')?.textContent).toBe('Mitte')
    click('.tour-back')
    expect(document.querySelector('.tour-title')?.textContent).toBe('Start')
  })

  it('zeigt im letzten Schritt Fertig und ruft onClose', () => {
    const onClose = vi.fn()
    mountTour({ onClose })
    click('.tour-next')
    click('.tour-next')
    const next = document.querySelector('.tour-next') as HTMLButtonElement
    expect(next.textContent?.trim()).toBe('Fertig')
    next.click()
    flushSync()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('ruft onClose bei Überspringen', () => {
    const onClose = vi.fn()
    mountTour({ onClose })
    click('.tour-skip')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('ruft onClose bei Escape', () => {
    const onClose = vi.fn()
    mountTour({ onClose })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    flushSync()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('meldet den Tab des Schritts über onTab', () => {
    const onTab = vi.fn()
    mountTour({ onTab })
    click('.tour-next')
    expect(onTab).toHaveBeenCalledWith(1)
  })

  it('zeigt die Karte zentriert, wenn der Schritt kein Ziel hat', () => {
    mountTour()
    expect(document.querySelector('.tour-card.center')).not.toBeNull()
  })
})
