import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Firebase mocken
vi.mock('firebase/database', () => ({
  ref: vi.fn(() => ({})),
  set: vi.fn(() => Promise.resolve()),
  onValue: vi.fn(),
  off: vi.fn(),
}))

vi.mock('../src/lib/firebase', () => ({
  db: {},
}))

beforeEach(() => {
  setActivePinia(createPinia())
  // URL hash zurücksetzen
  window.location.hash = ''
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('extractSessionId', () => {
  it('extrahiert Session-ID aus URL-Hash', async () => {
    const { extractSessionId } = await import('../src/composables/useSession')
    window.location.hash = '#session=Abc123'
    expect(extractSessionId()).toBe('Abc123')
  })

  it('gibt null zurück wenn kein session= im Hash', async () => {
    const { extractSessionId } = await import('../src/composables/useSession')
    window.location.hash = ''
    expect(extractSessionId()).toBeNull()
  })

  it('gibt null zurück für anderen Hash-Inhalt', async () => {
    const { extractSessionId } = await import('../src/composables/useSession')
    window.location.hash = '#other=value'
    expect(extractSessionId()).toBeNull()
  })
})

describe('createSession', () => {
  it('schreibt initialen State und setzt URL-Hash', async () => {
    const { set } = await import('firebase/database')
    const { useSession } = await import('../src/composables/useSession')
    // Clipboard mocken
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(() => Promise.resolve()) },
      writable: true,
    })
    const { createSession, sessionId } = useSession()
    await createSession()
    expect(set).toHaveBeenCalled()
    expect(sessionId.value).toHaveLength(6)
    expect(window.location.hash).toContain(sessionId.value!)
  })
})
