import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, unmount, flushSync } from 'svelte'
import WorkoutEditor from './WorkoutEditor.svelte'
import { workouts } from '../stores/workouts.svelte'

let component: Record<string, unknown>

function editorEl(): HTMLDivElement {
  return document.querySelector('.workout-editor') as HTMLDivElement
}

describe('WorkoutEditor Fokus-Schutz', () => {
  beforeEach(() => {
    workouts.applyRemote({ tabs: [{ id: 'w1', title: 'Workout 1', content: 'initial' }], activeTab: 0 })
    component = mount(WorkoutEditor, { target: document.body })
    flushSync()
  })

  afterEach(() => {
    unmount(component)
    document.body.innerHTML = ''
  })

  it('rendert Store-Inhalt in den Editor', () => {
    expect(editorEl().textContent).toBe('initial')
  })

  it('Remote-Update ohne Fokus wird sofort angewendet', () => {
    workouts.applyRemoteTabField('w1', 'content', 'remote text')
    flushSync()
    expect(editorEl().textContent).toBe('remote text')
  })

  it('Remote-Update bei Fokus wird gepuffert und bei blur angewendet', () => {
    const el = editorEl()
    el.dispatchEvent(new FocusEvent('focus'))
    flushSync()
    workouts.applyRemoteTabField('w1', 'content', 'remote while typing')
    flushSync()
    expect(el.textContent).toBe('initial') // nicht überschrieben
    el.dispatchEvent(new FocusEvent('blur'))
    flushSync()
    expect(el.textContent).toBe('remote while typing')
  })

  it('Tippen schreibt in den Store', () => {
    const el = editorEl()
    el.dispatchEvent(new FocusEvent('focus'))
    el.textContent = 'getippt'
    el.dispatchEvent(new InputEvent('input', { bubbles: true }))
    flushSync()
    expect(workouts.tabs[0].content).toBe('getippt')
  })
})
