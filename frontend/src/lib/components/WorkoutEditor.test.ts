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

describe('WorkoutEditor Dauer-Schätzung', () => {
  beforeEach(() => {
    workouts.applyRemote({
      tabs: [
        { id: 'w1', title: 'Warmup', content: '3 Runden' },
        { id: 'w2', title: 'MetCon', content: 'Fran' },
      ],
      activeTab: 0,
    })
    component = mount(WorkoutEditor, { target: document.body })
    flushSync()
  })

  afterEach(() => {
    unmount(component)
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('zeigt das Popover mit Gesamtdauer und Segmenten nach Klick', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              estimate: { totalMinutes: 18, segments: [{ label: 'MetCon', minutes: 18 }] },
            }),
            { status: 200 },
          ),
      ),
    )
    ;(document.querySelector('[data-tour="estimate"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(document.querySelector('.estimate-popover')).not.toBeNull())
    expect(document.querySelector('.estimate-total')?.textContent).toContain('18')
    expect(document.querySelector('.estimate-popover')?.textContent).toContain('MetCon')
  })

  it('sendet alle nicht-leeren Tabs an den Endpoint', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ estimate: { totalMinutes: 5, segments: [] } }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    ;(document.querySelector('[data-tour="estimate"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.tabs).toEqual([
      { title: 'Warmup', content: '3 Runden' },
      { title: 'MetCon', content: 'Fran' },
    ])
  })

  it('deaktiviert den Button, wenn alle Tabs leer sind', () => {
    workouts.applyRemote({ tabs: [{ id: 'w1', title: 'Warmup', content: '   ' }], activeTab: 0 })
    flushSync()
    const btn = document.querySelector('[data-tour="estimate"]') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('zeigt eine Fehlermeldung im Popover bei Fehler-Status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'kaputt' }), { status: 500 })),
    )
    ;(document.querySelector('[data-tour="estimate"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(document.querySelector('.estimate-error')).not.toBeNull())
    expect(document.querySelector('.estimate-error')?.textContent).toContain('kaputt')
  })

  it('schließt das Popover bei Klick außerhalb', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ estimate: { totalMinutes: 18, segments: [] } }), {
            status: 200,
          }),
      ),
    )
    ;(document.querySelector('[data-tour="estimate"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(document.querySelector('.estimate-popover')).not.toBeNull())

    const editor = document.querySelector('.workout-editor') as HTMLElement
    editor.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    flushSync()

    expect(document.querySelector('.estimate-popover')).toBeNull()
  })

  it('schließt das Popover NICHT bei erneutem Klick auf den Uhr-Button', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ estimate: { totalMinutes: 18, segments: [] } }), {
            status: 200,
          }),
      ),
    )
    const btn = document.querySelector('[data-tour="estimate"]') as HTMLButtonElement
    btn.click()
    await vi.waitFor(() => expect(document.querySelector('.estimate-popover')).not.toBeNull())

    btn.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    flushSync()

    expect(document.querySelector('.estimate-popover')).not.toBeNull()
  })
})
