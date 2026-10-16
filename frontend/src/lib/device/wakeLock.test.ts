import { describe, it, expect, beforeEach } from 'vitest'
import { WakeLockController, type WakeLockDocument, type WakeLockNavigator } from './wakeLock'

class FakeSentinel extends EventTarget {
  released = false
  async release() {
    this.released = true
    this.dispatchEvent(new Event('release'))
  }
}

class FakeDoc implements WakeLockDocument {
  visibilityState: DocumentVisibilityState = 'visible'
  private cbs: (() => void)[] = []
  addEventListener(_type: 'visibilitychange', cb: () => void) {
    this.cbs.push(cb)
  }
  setVisibility(v: DocumentVisibilityState) {
    this.visibilityState = v
    this.cbs.forEach((cb) => cb())
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('WakeLockController', () => {
  let sentinels: FakeSentinel[]
  let nav: WakeLockNavigator
  let doc: FakeDoc

  beforeEach(() => {
    sentinels = []
    doc = new FakeDoc()
    nav = {
      wakeLock: {
        request: async () => {
          const s = new FakeSentinel()
          sentinels.push(s)
          return s as unknown as WakeLockSentinel
        },
      },
    }
  })

  it('fordert den Lock an, wenn gewünscht, und gibt ihn wieder frei', async () => {
    const c = new WakeLockController(nav, doc)
    c.setWanted(true)
    await flush()
    expect(c.active).toBe(true)
    c.setWanted(false)
    await flush()
    expect(c.active).toBe(false)
    expect(sentinels[0].released).toBe(true)
  })

  it('fordert nach Tab-Wechsel neu an, wenn der Browser den Lock freigegeben hat', async () => {
    const c = new WakeLockController(nav, doc)
    c.setWanted(true)
    await flush()
    // Browser gibt beim Verstecken frei
    doc.visibilityState = 'hidden'
    await sentinels[0].release()
    doc.setVisibility('hidden')
    await flush()
    expect(c.active).toBe(false)
    doc.setVisibility('visible')
    await flush()
    expect(c.active).toBe(true)
    expect(sentinels).toHaveLength(2)
  })

  it('fordert im versteckten Tab nichts an', async () => {
    doc.visibilityState = 'hidden'
    const c = new WakeLockController(nav, doc)
    c.setWanted(true)
    await flush()
    expect(sentinels).toHaveLength(0)
  })

  it('gibt einen Lock frei, der während des Requests nicht mehr gewünscht wurde', async () => {
    const c = new WakeLockController(nav, doc)
    c.setWanted(true)
    c.setWanted(false)
    await flush()
    await flush()
    expect(c.active).toBe(false)
    expect(sentinels[0].released).toBe(true)
  })

  it('ohne Wake-Lock-API oder bei Verweigerung: kein Fehler', async () => {
    const c1 = new WakeLockController({}, doc)
    c1.setWanted(true)
    const c2 = new WakeLockController({ wakeLock: { request: () => Promise.reject(new Error('nein')) } }, doc)
    c2.setWanted(true)
    await flush()
    expect(c1.active).toBe(false)
    expect(c2.active).toBe(false)
  })
})
