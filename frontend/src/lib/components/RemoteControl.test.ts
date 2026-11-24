import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, unmount, flushSync } from 'svelte'
import RemoteControl from './RemoteControl.svelte'
import { timer } from '../stores/timer.svelte'
import { counter } from '../stores/counter.svelte'
import { defaultTimerDoc, type TimerDoc } from '../types'

const { session } = vi.hoisted(() => ({
  session: {
    id: 'k3x9q' as string | null,
    status: 'connected',
    peers: 2,
    copyLink: vi.fn(async () => {}),
    create: vi.fn(async () => {}),
  },
}))
vi.mock('../sync/session.svelte', () => ({ session }))
vi.mock('../audio/beeps.svelte', () => ({ sound: { unlock: vi.fn() } }))

let component: Record<string, unknown>
let onOpenModal: ReturnType<typeof vi.fn>
let onStartTour: ReturnType<typeof vi.fn>

function setTimer(overrides: Partial<TimerDoc>) {
  timer.applyRemote({ ...defaultTimerDoc(), ...overrides })
}

function render() {
  onOpenModal = vi.fn()
  onStartTour = vi.fn()
  component = mount(RemoteControl, { target: document.body, props: { onOpenModal, onStartTour } })
  flushSync()
}

function button(text: string): HTMLButtonElement {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)
  if (!btn) throw new Error(`Button „${text}“ fehlt`)
  return btn as HTMLButtonElement
}

function click(el: Element) {
  ;(el as HTMLElement).click()
  flushSync()
}

describe('RemoteControl (Handy-Fernbedienung)', () => {
  beforeEach(() => {
    setTimer({ mode: 'countdown' })
    counter.applyRemote(3)
  })

  afterEach(() => {
    unmount(component)
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    session.copyLink.mockClear()
    session.create.mockClear()
  })

  it('zeigt Verbindung, Zeit und Rundenzähler', () => {
    render()
    expect(document.querySelector('.conn')?.textContent).toContain('Verbunden · 2 Geräte')
    expect(document.querySelector('.time')?.textContent).toBe(timer.displayTime)
    expect(document.querySelector('.count-value')?.textContent).toBe('3')
  })

  it('Start/Pause ruft timer.toggle()', () => {
    const toggle = vi.spyOn(timer, 'toggle')
    render()
    click(button('Start'))
    expect(toggle).toHaveBeenCalledTimes(1)
  })

  it('zeigt „Pause“, solange der Timer läuft', () => {
    setTimer({ mode: 'countdown', isRunning: true, startedAt: Date.now() })
    render()
    expect(() => button('Pause')).not.toThrow()
  })

  it('im Uhrzeit-Modus öffnet Start die Modus-Wahl statt zu toggeln', () => {
    setTimer({ mode: 'clock' })
    const toggle = vi.spyOn(timer, 'toggle')
    render()
    click(button('Start'))
    expect(toggle).not.toHaveBeenCalled()
    expect(onOpenModal).toHaveBeenCalled()
  })

  it('Reset ohne gestarteten Timer setzt sofort Timer und Zähler zurück', () => {
    const reset = vi.spyOn(timer, 'reset')
    render()
    click(button('Reset'))
    expect(reset).toHaveBeenCalled()
    expect(counter.count).toBe(0)
  })

  it('Reset bei laufendem Timer fragt erst nach', () => {
    setTimer({ mode: 'countdown', isRunning: true, startedAt: Date.now() })
    const reset = vi.spyOn(timer, 'reset')
    render()
    click(button('Reset'))
    expect(reset).not.toHaveBeenCalled()
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Timer zurücksetzen?')
    click(button('Zurücksetzen'))
    expect(reset).toHaveBeenCalled()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('Modus öffnet die Timer-Einstellungen', () => {
    render()
    click(button('Modus'))
    expect(onOpenModal).toHaveBeenCalled()
  })

  it('Rundenzähler: + und − ändern den gemeinsamen Zähler', () => {
    render()
    click(document.querySelector('[aria-label="Runde zählen"]')!)
    expect(counter.count).toBe(4)
    click(document.querySelector('[aria-label="Runde abziehen"]')!)
    click(document.querySelector('[aria-label="Runde abziehen"]')!)
    expect(counter.count).toBe(2)
  })

  it('Schnellstart nutzt die vorhandenen Preset-/Modus-APIs und startet', () => {
    const applyPreset = vi.spyOn(timer, 'applyPreset')
    const setMode = vi.spyOn(timer, 'setMode')
    const start = vi.spyOn(timer, 'start')
    render()

    click(button('Tabata'))
    expect(applyPreset).toHaveBeenLastCalledWith('tabata')
    expect(start).toHaveBeenCalledTimes(1)

    // Tabata läuft jetzt → weitere Schnellstarts erst nach Rückfrage
    click(button('For Time'))
    expect(setMode).not.toHaveBeenCalled()
    click(button('Starten'))
    expect(setMode).toHaveBeenLastCalledWith('countup')
    expect(timer.doc.mode).toBe('countup')
  })

  it('markiert den aktiven Schnellstart', () => {
    setTimer({ mode: 'interval', preset: 'emom' })
    render()
    expect(button('EMOM').classList.contains('active')).toBe(true)
    expect(button('Tabata').classList.contains('active')).toBe(false)
  })

  it('Kopieren kopiert den Session-Link und bestätigt kurz', async () => {
    render()
    expect(document.querySelector('.share-url')?.textContent).toContain('/l/k3x9q')
    button('Kopieren').click()
    await vi.waitFor(() => expect(button('Kopiert')).toBeTruthy())
    expect(session.copyLink).toHaveBeenCalled()
  })

  it('Tour-Ziele für die mobile Tour sind vorhanden', () => {
    render()
    for (const key of ['timer-bar', 'gear', 'share', 'help']) {
      expect(document.querySelector(`[data-tour="${key}"]`)).not.toBeNull()
    }
  })
})
