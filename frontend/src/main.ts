import { mount } from 'svelte'
import Root from './Root.svelte'
import './app.css'

const app = mount(Root, { target: document.getElementById('app')! })

export default app
