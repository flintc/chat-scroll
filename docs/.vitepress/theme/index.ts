import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import './custom.css'
import AgentDemo from './demo/AgentDemo.vue'
import ComposerDemo from './demo/ComposerDemo.vue'
import DemoVideo from './DemoVideo.vue'
import InfiniteDemo from './demo/InfiniteDemo.vue'
import LiveDemo from './demo/LiveDemo.vue'
import VirtualDemo from './demo/VirtualDemo.vue'

const theme: Theme = {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    // Interactive in-page demos driven by the real library (via the Vue
    // adapter). Preferred over recorded videos everywhere.
    app.component('LiveDemo', LiveDemo)
    // chat-scroll + @tanstack/vue-virtual (virtualization recipe).
    app.component('VirtualDemo', VirtualDemo)
    // Server-paged history with prepend compensation (infinite-history
    // recipe).
    app.component('InfiniteDemo', InfiniteDemo)
    // Cycling agent status lines in a fixed-height slot (agent-status
    // recipe).
    app.component('AgentDemo', AgentDemo)
    // Overlay composer + `bottomInset` reservation (composer-overlay
    // recipe).
    app.component('ComposerDemo', ComposerDemo)
    // Recorded e2e videos — kept for the promote pipeline (`pnpm
    // e2e:promote`) and any page that wants a non-interactive capture.
    app.component('DemoVideo', DemoVideo)
  },
}

export default theme
