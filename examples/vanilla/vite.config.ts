import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))

// Alias the workspace package straight to source so edits to the lib
// reflect immediately — no rebuild between runs.
export default defineConfig({
  resolve: {
    alias: {
      '@chat-scroll/core': path.resolve(
        here,
        '../../packages/chat-scroll-core/src/index.ts',
      ),
    },
  },
  server: { port: 3110, strictPort: true, host: '0.0.0.0' },
})
