import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, unmount, flushSync } from 'svelte'
import LegalModal from './LegalModal.svelte'

let component: Record<string, unknown>

function mountModal(kind: 'privacy' | 'imprint', onClose = vi.fn()) {
  component = mount(LegalModal, { target: document.body, props: { kind, onClose } })
  flushSync()
  return onClose
}

describe('LegalModal', () => {
  afterEach(() => {
    unmount(component)
    document.body.innerHTML = ''
  })

  it('zeigt die Datenschutzerklärung mit ihren Abschnitten', () => {
    mountModal('privacy')
    expect(document.querySelector('.legal h2')?.textContent).toBe('Datenschutzerklärung')
    const text = document.querySelector('.legal .body')?.textContent ?? ''
    expect(text).toContain('Verantwortlicher')
    expect(text).toContain('YouTube')
    expect(text).toContain('localStorage')
  })

  it('zeigt das Impressum mit den Pflichtangaben', () => {
    mountModal('imprint')
    expect(document.querySelector('.legal h2')?.textContent).toBe('Impressum')
    const text = document.querySelector('.legal .body')?.textContent ?? ''
    expect(text).toContain('§ 5 DDG')
    expect(text).toContain('Gerrit Edzards')
    expect(text).toContain('Bussardweg 86')
    expect(text).toContain('26133 Oldenburg')
  })

  it('ist als modaler Dialog ausgezeichnet und fokussiert den Schließen-Button', () => {
    mountModal('imprint')
    const dialog = document.querySelector('.legal') as HTMLElement
    expect(dialog.getAttribute('role')).toBe('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(document.querySelector('.close-btn'))
  })

  it('✕ ruft onClose auf', () => {
    const onClose = mountModal('privacy')
    ;(document.querySelector('.close-btn') as HTMLButtonElement).click()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Klick auf das Overlay schließt, Klick in den Dialog nicht', () => {
    const onClose = mountModal('privacy')
    ;(document.querySelector('.legal') as HTMLElement).click()
    expect(onClose).not.toHaveBeenCalled()
    ;(document.querySelector('.legal-overlay') as HTMLElement).click()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Escape schließt', () => {
    const onClose = mountModal('privacy')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
