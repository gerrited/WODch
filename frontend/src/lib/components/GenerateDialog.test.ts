import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, unmount, flushSync } from 'svelte'
import GenerateDialog from './GenerateDialog.svelte'

let component: Record<string, unknown>

afterEach(() => {
  if (component) unmount(component)
  document.body.innerHTML = ''
})

describe('GenerateDialog', () => {
  it('ruft onSubmit mit dem getrimmten Text', () => {
    const onSubmit = vi.fn()
    component = mount(GenerateDialog, { target: document.body, props: { onSubmit, onCancel: () => {} } })
    flushSync()
    const ta = document.querySelector('.gen-input') as HTMLTextAreaElement
    ta.value = '  20 Min AMRAP  '
    ta.dispatchEvent(new InputEvent('input', { bubbles: true }))
    flushSync()
    ;(document.querySelector('.btn-generate') as HTMLButtonElement).click()
    flushSync()
    expect(onSubmit).toHaveBeenCalledWith('20 Min AMRAP')
  })

  it('ruft onSubmit nicht bei leerem Text', () => {
    const onSubmit = vi.fn()
    component = mount(GenerateDialog, { target: document.body, props: { onSubmit, onCancel: () => {} } })
    flushSync()
    ;(document.querySelector('.btn-generate') as HTMLButtonElement).click()
    flushSync()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('ruft onCancel bei Klick auf Abbrechen', () => {
    const onCancel = vi.fn()
    component = mount(GenerateDialog, { target: document.body, props: { onSubmit: () => {}, onCancel } })
    flushSync()
    ;(document.querySelector('.btn-cancel') as HTMLButtonElement).click()
    flushSync()
    expect(onCancel).toHaveBeenCalled()
  })
})
