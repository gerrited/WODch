import { describe, it, expect, afterEach } from 'vitest'
import { router } from './router.svelte'

describe('router', () => {
  afterEach(() => {
    history.replaceState(null, '', '/')
    router.sync()
  })

  it('startet mit dem aktuellen Pfad', () => {
    history.replaceState(null, '', '/l/abc123')
    router.sync()
    expect(router.pathname).toBe('/l/abc123')
  })

  it('navigate pusht in die History und aktualisiert pathname', () => {
    router.navigate('/l/xyz')
    expect(window.location.pathname).toBe('/l/xyz')
    expect(router.pathname).toBe('/l/xyz')
  })

  it('navigate zum aktuellen Pfad verändert die History nicht', () => {
    router.navigate('/l/same')
    const lengthBefore = history.length
    router.navigate('/l/same')
    expect(history.length).toBe(lengthBefore)
  })

  it('sync liest den Pfad neu ein, ohne die History zu verändern', () => {
    history.replaceState(null, '', '/l/replaced')
    const lengthBefore = history.length
    router.sync()
    expect(router.pathname).toBe('/l/replaced')
    expect(history.length).toBe(lengthBefore)
  })

  it('popstate löst sync aus und übernimmt den aktuellen Pfad', () => {
    history.pushState(null, '', '/l/manual')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(router.pathname).toBe('/l/manual')
  })
})
