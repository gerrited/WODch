import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Lädt die Routing-Funktion aus public/sw.js, ohne die SW-Listener zu registrieren.
type Strategy = 'network-first' | 'cache-first' | 'stale-while-revalidate' | null
const src = readFileSync(resolve(__dirname, '../../../public/sw.js'), 'utf8')
const strategyFor = new Function('self', `${src}\nreturn strategyFor`)({
  addEventListener: () => {},
}) as (req: { method: string; url: string; mode?: string }, origin: string) => Strategy

const ORIGIN = 'https://wodch.com'
const get = (path: string, mode = 'no-cors') => ({ method: 'GET', url: ORIGIN + path, mode })

describe('sw.js strategyFor', () => {
  it('Navigationen (Landing und Sessions) gehen network-first', () => {
    expect(strategyFor(get('/', 'navigate'), ORIGIN)).toBe('network-first')
    expect(strategyFor(get('/l/abc123', 'navigate'), ORIGIN)).toBe('network-first')
  })

  it('gehashte Assets cache-first, Icons/Manifest stale-while-revalidate', () => {
    expect(strategyFor(get('/assets/index-abc.js'), ORIGIN)).toBe('cache-first')
    expect(strategyFor(get('/icon-192.png'), ORIGIN)).toBe('stale-while-revalidate')
    expect(strategyFor(get('/manifest.webmanifest'), ORIGIN)).toBe('stale-while-revalidate')
  })

  it('lässt Backend-Routen, POSTs, fremde Origins und Unbekanntes in Ruhe', () => {
    expect(strategyFor(get('/ws'), ORIGIN)).toBeNull()
    expect(strategyFor(get('/estimate'), ORIGIN)).toBeNull()
    expect(strategyFor({ method: 'POST', url: `${ORIGIN}/timerize` }, ORIGIN)).toBeNull()
    expect(strategyFor(get('/healthz'), ORIGIN)).toBeNull()
    expect(strategyFor({ method: 'GET', url: 'https://www.youtube.com/iframe_api' }, ORIGIN)).toBeNull()
    expect(strategyFor(get('/robots.txt'), ORIGIN)).toBeNull()
  })
})
