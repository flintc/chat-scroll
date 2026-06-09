import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@chat-scroll/core': path.resolve(
        here,
        '../../packages/chat-scroll-core/src/index.ts',
      ),
      '@chat-scroll/vue': path.resolve(
        here,
        '../../packages/vue-chat-scroll/src/index.ts',
      ),
    },
  },
  server: { port: 3112, strictPort: true, host: '0.0.0.0' },
})
