import { describe, it, expect, afterEach } from 'vitest'
import { mount, unmount, flushSync } from 'svelte'
import Logo from './Logo.svelte'

let component: Record<string, unknown>

describe('Logo', () => {
  afterEach(() => {
    unmount(component)
    document.body.innerHTML = ''
  })

  it('rendert ein quadratisches SVG mit dem Wch-Schriftzug', () => {
    component = mount(Logo, { target: document.body })
    flushSync()
    const svg = document.querySelector('svg.logo') as SVGSVGElement
    expect(svg).not.toBeNull()
    expect(svg.getAttribute('viewBox')).toBe('0 0 48 48')
    expect(svg.textContent).toContain('W')
    expect(svg.textContent).toContain('ch')
  })

  it('wächst standardmäßig mit der Container-Höhe bis auf das 3-Fache mit', () => {
    component = mount(Logo, { target: document.body })
    flushSync()
    const svg = document.querySelector('svg.logo') as SVGSVGElement
    expect(svg.style.width).toBe('clamp(36px, 55cqh, 108px)')
    expect(svg.style.height).toBe(svg.style.width)
  })

  it('übernimmt die size-Prop für Breite und Höhe', () => {
    component = mount(Logo, { target: document.body, props: { size: '48px' } })
    flushSync()
    const svg = document.querySelector('svg.logo') as SVGSVGElement
    expect(svg.style.width).toBe('48px')
    expect(svg.style.height).toBe('48px')
  })
})
