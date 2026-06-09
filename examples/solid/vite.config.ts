import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      '@chat-scroll/core': path.resolve(
        here,
        '../../packages/chat-scroll-core/src/index.ts',
      ),
      '@chat-scroll/solid': path.resolve(
        here,
        '../../packages/solid-chat-scroll/src/index.ts',
      ),
    },
  },
  server: { port: 3111, strictPort: true, host: '0.0.0.0' },
})
