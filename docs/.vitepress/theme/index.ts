import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import DemoVideo from './DemoVideo.vue'

const theme: Theme = {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('DemoVideo', DemoVideo)
  },
}

export default theme
