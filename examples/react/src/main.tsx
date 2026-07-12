import { createRoot } from 'react-dom/client'
import { App } from './App'
import '@chat-scroll/example-shared/style.css'

const root = document.getElementById('app')
if (!root) throw new Error('#app not found')
createRoot(root).render(<App />)
