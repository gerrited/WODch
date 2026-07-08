import { describe, it, expect, afterEach } from 'vitest'
import { mount, unmount, flushSync, createRawSnippet } from 'svelte'
import MobileTabs from './MobileTabs.svelte'

const snippet = (text: string) =>
  createRawSnippet(() => ({ render: () => `<div class="fixture-${text}">${text}</div>` }))

let component: Record<string, unknown>

function mountTabs() {
  component = mount(MobileTabs, {
    target: document.body,
    props: { video: snippet('video'), workout: snippet('workout'), timer: snippet('timer') },
  })
  flushSync()
}

describe('MobileTabs', () => {
  afterEach(() => {
    unmount(component)
    document.body.innerHTML = ''
    localStorage.clear()
  })

  it('rendert drei Tabs und alle drei Panels gleichzeitig gemountet', () => {
    mountTabs()
    const tabs = [...document.querySelectorAll('[role="tab"]')]
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(['Workout', 'Timer', 'Video'])
    expect(document.querySelector('.fixture-video')).not.toBeNull()
    expect(document.querySelector('.fixture-workout')).not.toBeNull()
    expect(document.querySelector('.fixture-timer')).not.toBeNull()
  })

  it('startet mit Workout als aktivem Tab', () => {
    mountTabs()
    const tabs = [...document.querySelectorAll('[role="tab"]')]
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
  })

  it('markiert nach Tap den gewählten Tab als aktiv', () => {
    mountTabs()
    const tabs = [...document.querySelectorAll('[role="tab"]')] as HTMLButtonElement[]
    tabs[2].click()
    flushSync()
    expect(tabs[2].getAttribute('aria-selected')).toBe('true')
    expect(tabs[0].getAttribute('aria-selected')).toBe('false')
  })

  it('merkt sich den aktiven Tab in localStorage', () => {
    mountTabs()
    const tabs = [...document.querySelectorAll('[role="tab"]')] as HTMLButtonElement[]
    tabs[1].click()
    flushSync()
    expect(localStorage.getItem('wodch.activeTab')).toBe('timer')
  })

  it('stellt den gespeicherten Tab nach Reload wieder her', () => {
    localStorage.setItem('wodch.activeTab', 'video')
    mountTabs()
    const tabs = [...document.querySelectorAll('[role="tab"]')]
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true'])
  })

  it('fällt bei ungültigem gespeicherten Wert auf Workout zurück', () => {
    localStorage.setItem('wodch.activeTab', 'unbekannt')
    mountTabs()
    const tabs = [...document.querySelectorAll('[role="tab"]')]
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
  })
})
