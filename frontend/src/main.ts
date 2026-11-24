import { mount } from 'svelte'
import Root from './Root.svelte'
// Schriften selbst gehostet: die CSP (default-src 'self') blockiert Fremd-CDNs, und der
// Service Worker cacht /assets/ — so sind die Fonts auch offline da. Nur das Latin-Subset
// (enthält Umlaute, ß, „“ und −) und nur die tatsächlich genutzten Schnitte.
import '@fontsource/barlow-condensed/latin-800-italic.css'
import '@fontsource/barlow-condensed/latin-900-italic.css'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import '@fontsource/jetbrains-mono/latin-700.css'
import '@fontsource/jetbrains-mono/latin-800.css'
import './app.css'
import { registerServiceWorker } from './lib/pwa/register'

const app = mount(Root, { target: document.getElementById('app')! })
registerServiceWorker()

export default app
