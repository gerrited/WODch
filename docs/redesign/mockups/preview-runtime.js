// Mini-Runtime, damit die Mockups (*.html) ohne den Design-Canvas im Browser laufen.
// Unterstützt genau das, was die Mockups nutzen: {{pfad}}-Platzhalter, <sc-if>, <sc-for>,
// on*-Handler und eine DCLogic-Basisklasse mit setState. Nur Referenz, kein Produktivcode.
(function () {
  class DCLogic {
    constructor(props) {
      this.props = props || {}
      this.state = {}
    }
    setState(update) {
      const patch = typeof update === 'function' ? update(this.state) : update
      this.state = Object.assign({}, this.state, patch)
      schedule()
    }
    forceUpdate() {
      schedule()
    }
  }
  window.DCLogic = DCLogic

  const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g
  const WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/
  let root, template, comp, queued = false

  function lookup(path, scope) {
    path = path.trim()
    if (path === 'true') return true
    if (path === 'false') return false
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path)
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), scope)
  }

  function interp(str, scope) {
    return str.replace(HOLE, (_, p) => {
      const v = lookup(p, scope)
      return v == null ? '' : String(v)
    })
  }

  function build(node, scope, out) {
    if (node.nodeType === 3) {
      out.appendChild(document.createTextNode(interp(node.textContent, scope)))
      return
    }
    if (node.nodeType !== 1) return
    const tag = node.localName
    if (tag === 'helmet') return
    if (tag === 'sc-if') {
      const m = WHOLE.exec(node.getAttribute('value') || '')
      if (m && lookup(m[1], scope)) node.childNodes.forEach((c) => build(c, scope, out))
      return
    }
    if (tag === 'sc-for') {
      const m = WHOLE.exec(node.getAttribute('list') || '')
      const list = (m && lookup(m[1], scope)) || []
      const as = node.getAttribute('as') || 'item'
      list.forEach((item, i) => {
        const s = Object.assign(Object.create(scope), { [as]: item, $index: i })
        node.childNodes.forEach((c) => build(c, s, out))
      })
      return
    }
    const el = document.createElementNS(node.namespaceURI, tag)
    for (const a of Array.from(node.attributes)) {
      const m = WHOLE.exec(a.value)
      if (/^on/i.test(a.name)) {
        const fn = m && lookup(m[1], scope)
        if (typeof fn === 'function') el.addEventListener(a.name.slice(2).toLowerCase(), fn)
        continue
      }
      let v = interp(a.value, scope)
      // Verweise zwischen Artboards zeigen in der Vorschau auf die .html-Dateien
      if (a.name === 'href') v = v.replace(/\.dc\.html/, '.html')
      el.setAttribute(a.name, v)
    }
    node.childNodes.forEach((c) => build(c, scope, el))
    out.appendChild(el)
  }

  function render() {
    queued = false
    const frag = document.createDocumentFragment()
    const scope = comp.renderVals() || {}
    template.forEach((n) => build(n, scope, frag))
    root.replaceChildren(frag)
  }

  function schedule() {
    if (!queued && root) {
      queued = true
      requestAnimationFrame(render)
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    root = document.querySelector('x-dc')
    // Schriften und Styles aus <helmet> in den <head> holen
    root.querySelectorAll('helmet > *').forEach((n) => document.head.appendChild(n.cloneNode(true)))
    template = Array.from(root.childNodes).map((n) => n.cloneNode(true))
    const src = document.querySelector('script[data-dc-script]')
    const Component = new Function(src.textContent + '\nreturn Component;')()
    comp = new Component({})
    render()
    if (comp.componentDidMount) comp.componentDidMount()
  })
})()
