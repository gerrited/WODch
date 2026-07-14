import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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

describe('WorkoutEditor AI-Generierung', () => {
  beforeEach(() => {
    workouts.applyRemote({ tabs: [{ id: 'w1', title: 'Workout 1', content: 'alt' }], activeTab: 0 })
    component = mount(WorkoutEditor, { target: document.body })
    flushSync()
  })

  afterEach(() => {
    unmount(component)
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('öffnet den Dialog über den Magic-Button', () => {
    expect(document.querySelector('.gen-input')).toBeNull()
    ;(document.querySelector('[data-tour="ai-generate"]') as HTMLButtonElement).click()
    flushSync()
    expect(document.querySelector('.gen-input')).not.toBeNull()
  })

  it('schreibt das generierte Workout in den aktiven Tab', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ phases: [{ title: '', content: 'FRAN\n21-15-9' }] }), { status: 200 }),
      ),
    )
    ;(document.querySelector('[data-tour="ai-generate"]') as HTMLButtonElement).click()
    flushSync()
    const ta = document.querySelector('.gen-input') as HTMLTextAreaElement
    ta.value = 'Fran'
    ta.dispatchEvent(new InputEvent('input', { bubbles: true }))
    flushSync()
    ;(document.querySelector('.btn-generate') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(workouts.tabs[0].content).toBe('\n\nFRAN\n21-15-9\n\n'))
  })

  it('legt für mehrere Phasen zusätzliche Tabs an', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              phases: [
                { title: 'Warm-up', content: 'Run' },
                { title: 'Metcon', content: '21-15-9' },
              ],
            }),
            { status: 200 },
          ),
      ),
    )
    ;(document.querySelector('[data-tour="ai-generate"]') as HTMLButtonElement).click()
    flushSync()
    const ta = document.querySelector('.gen-input') as HTMLTextAreaElement
    ta.value = 'AMRAP mit Warm-up'
    ta.dispatchEvent(new InputEvent('input', { bubbles: true }))
    flushSync()
    ;(document.querySelector('.btn-generate') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(workouts.tabs.length).toBe(2))
    expect(workouts.tabs[0].title).toBe('Warm-up')
    expect(workouts.tabs[1].title).toBe('Metcon')
    expect(workouts.tabs[0].content).toBe('\n\nRun\n\n')
    expect(workouts.tabs[1].content).toBe('\n\n21-15-9\n\n')
  })

  it('lässt den Tab-Inhalt bei Fehler unberührt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'kaputt' }), { status: 500 })),
    )
    ;(document.querySelector('[data-tour="ai-generate"]') as HTMLButtonElement).click()
    flushSync()
    const ta = document.querySelector('.gen-input') as HTMLTextAreaElement
    ta.value = 'Fran'
    ta.dispatchEvent(new InputEvent('input', { bubbles: true }))
    flushSync()
    ;(document.querySelector('.btn-generate') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(document.querySelector('.gen-error')).not.toBeNull())
    expect(workouts.tabs[0].content).toBe('alt')
  })
})
