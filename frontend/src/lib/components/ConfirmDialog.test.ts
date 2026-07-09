import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, unmount, flushSync } from 'svelte'
import ConfirmDialog from './ConfirmDialog.svelte'

let component: Record<string, unknown>

function mountDialog(props: Record<string, unknown> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  component = mount(ConfirmDialog, {
    target: document.body,
    props: { title: 'Workout löschen?', onConfirm, onCancel, ...props },
  })
  flushSync()
  return { onConfirm, onCancel }
}

describe('ConfirmDialog', () => {
  afterEach(() => {
    unmount(component)
    document.body.innerHTML = ''
  })

  it('zeigt Titel und Meldung an', () => {
    mountDialog({ message: 'wird entfernt.' })
    expect(document.querySelector('.title')?.textContent).toBe('Workout löschen?')
    expect(document.querySelector('.message')?.textContent).toBe('wird entfernt.')
  })

  it('Bestätigen-Button ruft onConfirm auf', () => {
    const { onConfirm, onCancel } = mountDialog()
    ;(document.querySelector('.btn-confirm') as HTMLButtonElement).click()
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('Abbrechen-Button ruft onCancel auf', () => {
    const { onConfirm, onCancel } = mountDialog()
    ;(document.querySelector('.btn-cancel') as HTMLButtonElement).click()
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('✕ ruft onCancel auf', () => {
    const { onCancel } = mountDialog()
    ;(document.querySelector('.close-btn') as HTMLButtonElement).click()
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('Klick auf das Overlay ruft onCancel auf', () => {
    const { onCancel } = mountDialog()
    ;(document.querySelector('.modal-overlay') as HTMLDivElement).click()
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('Klick ins Modal selbst löst nichts aus', () => {
    const { onConfirm, onCancel } = mountDialog()
    ;(document.querySelector('.modal') as HTMLDivElement).click()
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('Escape ruft onCancel, Enter ruft onConfirm auf', () => {
    const { onConfirm, onCancel } = mountDialog()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onCancel).toHaveBeenCalledOnce()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })
})
