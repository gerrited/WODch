import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, unmount, flushSync } from 'svelte'
import ShareModal from './ShareModal.svelte'
import ShareModalHost from './ShareModalHost.fixture.svelte'

const URL = 'http://localhost/#session=abc123'

let component: Record<string, unknown>

function mountModal(onClose = vi.fn()) {
  component = mount(ShareModal, { target: document.body, props: { url: URL, onClose } })
  flushSync()
  return onClose
}

describe('ShareModal', () => {
  afterEach(() => {
    unmount(component)
    document.body.innerHTML = ''
  })

  it('rendert einen QR-Code als SVG', () => {
    mountModal()
    expect(document.querySelector('.qr svg')).not.toBeNull()
  })

  it('zeigt die Session-URL als Text an', () => {
    mountModal()
    expect(document.querySelector('.link')?.textContent).toBe(URL)
  })

  it('✕ ruft onClose auf', () => {
    const onClose = mountModal()
    ;(document.querySelector('.close-btn') as HTMLButtonElement).click()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Klick auf das Overlay ruft onClose auf', () => {
    const onClose = mountModal()
    ;(document.querySelector('.modal-overlay') as HTMLDivElement).click()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Klick ins Modal selbst schließt nicht', () => {
    const onClose = mountModal()
    ;(document.querySelector('.modal') as HTMLDivElement).click()
    expect(onClose).not.toHaveBeenCalled()
  })

  // Das Modal wird innerhalb der Timer-Leiste gerendert — deren Handler dürfen nicht auslösen.
  // Die Fixture bildet das nach: ein Svelte-Elternelement mit click/pointer/touch-Handlern.
  it('Maus- und Touch-Events blubbern nicht zum Eltern-Element durch', () => {
    const onParentClick = vi.fn()
    const onParentPointerDown = vi.fn()
    const onParentTouchStart = vi.fn()
    component = mount(ShareModalHost, {
      target: document.body,
      props: { url: URL, onClose: vi.fn(), onParentClick, onParentPointerDown, onParentTouchStart },
    })
    flushSync()

    const modal = document.querySelector('.modal') as HTMLDivElement
    const overlay = document.querySelector('.modal-overlay') as HTMLDivElement
    modal.click()
    overlay.click()
    // jsdom kennt PointerEvent/TouchEvent nicht — generische Events reichen für den Bubbling-Test
    modal.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    modal.dispatchEvent(new Event('touchstart', { bubbles: true }))

    expect(onParentClick).not.toHaveBeenCalled()
    expect(onParentPointerDown).not.toHaveBeenCalled()
    expect(onParentTouchStart).not.toHaveBeenCalled()
  })
})
