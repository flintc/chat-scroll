import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')

/**
 * Playwright config for chat-scroll e2e.
 *
 * Two web servers, two projects — one per framework. Each project sets its
 * own baseURL so specs use plain `page.goto('#/pin-to-top')` style links.
 *
 * Video on every test. The custom reporter at ./reporters/video-rename.ts
 * copies each recorded video to `e2e/videos/<project>__<test>.webm` so
 * the promote script can find them by stable name.
 *
 * Viewport is set deliberately for clean video framing — large enough to
 * read messages, narrow enough that lines wrap naturally in <video>
 * embeds in the docs.
 */
export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['./reporters/video-rename.ts'],
  ],
  outputDir: 'test-results',

  use: {
    viewport: { width: 960, height: 600 },
    deviceScaleFactor: 1,
    video: {
      mode: 'on',
      size: { width: 960, height: 600 },
    },
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
  },

  projects: [
    {
      name: 'vanilla',
      testMatch: /specs\/vanilla\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3110',
        viewport: { width: 960, height: 600 },
      },
    },
    {
      name: 'solid',
      testMatch: /specs\/solid\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3111',
        viewport: { width: 960, height: 600 },
      },
    },
    {
      name: 'vue',
      testMatch: /specs\/vue\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3112',
        viewport: { width: 960, height: 600 },
      },
    },
    /**
     * WebKit project — exercises the iOS Safari smooth-scroll path that
     * shipped broken on 2026-04-28 in main commit 19c2d14, AND the
     * pin-to-top + expandable-blocks code path added in pass 2. WebKit
     * is the canary for scroll bugs; if anything regresses with browser
     * scroll-anchoring or scrollTop-clamping behavior, this is where
     * we'll see it first.
     */
    {
      name: 'webkit',
      testMatch:
        /specs\/vanilla\/(scroll-bound-tight|pin-to-top|pin-expandable-tap|pin-expandable-edges|pin-expandable-stress|pin-expandable-extreme)\.spec\.ts/,
      use: {
        ...devices['Desktop Safari'],
        baseURL: 'http://localhost:3110',
        viewport: { width: 960, height: 600 },
      },
    },
    /**
     * Mobile-Safari project — emulates an iPhone running the demo. This
     * is the closest CI-reachable approximation of the PWA case where
     * the original Safari race was reported. Runs the same scroll/pin
     * specs as desktop webkit.
     */
    {
      name: 'mobile-safari',
      testMatch:
        /specs\/vanilla\/(scroll-bound-tight|pin-to-top|pin-expandable-tap|pin-expandable-extreme)\.spec\.ts/,
      use: {
        ...devices['iPhone 14'],
        baseURL: 'http://localhost:3110',
      },
    },
  ],

  webServer: [
    {
      command: 'pnpm --filter @chat-scroll/example-vanilla dev',
      cwd: ROOT,
      url: 'http://localhost:3110',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'pnpm --filter @chat-scroll/example-solid dev',
      cwd: ROOT,
      url: 'http://localhost:3111',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'pnpm --filter @chat-scroll/example-vue dev',
      cwd: ROOT,
      url: 'http://localhost:3112',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})
