import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@chat-scroll/core': path.resolve(
        here,
        '../../packages/chat-scroll-core/src/index.ts',
      ),
      '@chat-scroll/react': path.resolve(
        here,
        '../../packages/react-chat-scroll/src/index.ts',
      ),
    },
  },
  server: { port: 3113, strictPort: true, host: '0.0.0.0' },
})
