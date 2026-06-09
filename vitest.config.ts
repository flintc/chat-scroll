import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    // Resolve Solid's client build under jsdom — without `browser` /
    // `development`, Node's export condition wins and we load `dist/server.js`,
    // where `createEffect` is a no-op.
    conditions: ['browser', 'development'],
    alias: {
      // Run adapter tests against the core *source*, not its dist —
      // `pnpm test` then works on a clean checkout without a build, and
      // coverage attributes core lines exercised via adapters correctly.
      '@chat-scroll/core': fileURLToPath(
        new URL('./packages/chat-scroll-core/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['packages/*/tests/**/*.test.{ts,tsx,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: ['**/*.d.ts', '**/index.ts', '**/types.ts'],
    },
  },
})
