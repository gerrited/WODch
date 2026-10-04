import { mount } from 'svelte'
import Root from './Root.svelte'
import './app.css'
import { registerServiceWorker } from './lib/pwa/register'

const app = mount(Root, { target: document.getElementById('app')! })
registerServiceWorker()

export default app
