import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, unmount, flushSync, createRawSnippet } from 'svelte'
import SplitPane from './SplitPane.svelte'

const KEY = 'wodch-split-test'

let component: Record<string, unknown>

const pane = (text: string) =>
  createRawSnippet(() => ({ render: () => `<span>${text}</span>` }))

function mountPane(props: Record<string, unknown> = {}) {
  component = mount(SplitPane, {
    target: document.body,
    props: { a: pane('A'), b: pane('B'), ...props },
  })
  flushSync()
}

function firstPane(): HTMLDivElement {
  return document.querySelector('.pane.first') as HTMLDivElement
}

function drag(toClientX: number) {
  const container = document.querySelector('.split') as HTMLDivElement
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 1000,
    height: 1000,
    right: 1000,
    bottom: 1000,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  const divider = document.querySelector('.divider') as HTMLDivElement
  divider.setPointerCapture = () => {}
  divider.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
  divider.dispatchEvent(
    new MouseEvent('pointermove', { bubbles: true, clientX: toClientX, clientY: 0 })
  )
  divider.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))
  flushSync()
}

describe('SplitPane – Persistenz', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    unmount(component)
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('nutzt initial, wenn kein Wert gespeichert ist', () => {
    mountPane({ storageKey: KEY, initial: 50 })
    expect(firstPane().style.flexBasis).toBe('50%')
  })

  it('lädt eine gespeicherte Position aus localStorage', () => {
    localStorage.setItem(KEY, '30')
    mountPane({ storageKey: KEY, initial: 50 })
    expect(firstPane().style.flexBasis).toBe('30%')
  })

  it('ignoriert ungültige gespeicherte Werte', () => {
    localStorage.setItem(KEY, 'kaputt')
    mountPane({ storageKey: KEY, initial: 50 })
    expect(firstPane().style.flexBasis).toBe('50%')
  })

  it('begrenzt gespeicherte Werte auf den min-Bereich', () => {
    localStorage.setItem(KEY, '2')
    mountPane({ storageKey: KEY, initial: 50, min: 10 })
    expect(firstPane().style.flexBasis).toBe('10%')
  })

  it('speichert die Position nach dem Ziehen', () => {
    mountPane({ storageKey: KEY, initial: 50 })
    drag(300)
    expect(localStorage.getItem(KEY)).toBe('30')
  })

  it('speichert nichts ohne storageKey', () => {
    mountPane({ initial: 50 })
    drag(300)
    expect(localStorage.length).toBe(0)
  })
})
