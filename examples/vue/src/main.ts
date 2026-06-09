import { createApp } from 'vue'
import App from './App.vue'
import '@chat-scroll/example-shared/style.css'

const root = document.getElementById('app')
if (!root) throw new Error('#app not found')
createApp(App).mount(root)
