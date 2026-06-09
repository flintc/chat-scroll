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
