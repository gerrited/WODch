import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, unmount, flushSync } from 'svelte'
import ShareModal from './ShareModal.svelte'

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
})
