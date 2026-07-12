import js from '@eslint/js'
import playwright from 'eslint-plugin-playwright'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['playwright-report', 'test-results', 'videos'] },
  {
    files: ['**/*.ts', 'scripts/**/*.mjs'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  {
    files: ['specs/**/*.ts', 'fixtures.ts'],
    extends: [playwright.configs['flat/recommended']],
    rules: {
      // This suite tests scroll animation under a simulated streaming bot:
      // specs drive `window.__demo.tick()` on a fixed real-time cadence and
      // sample scroll positions mid-animation. Fixed waits are the mechanism
      // under test, not a synchronization shortcut, and probe assertions are
      // conditioned on measured animation progress by design. Web-first
      // assertions can't express either, so these rules stay off here.
      'playwright/no-conditional-expect': 'off',
      'playwright/no-conditional-in-test': 'off',
      'playwright/no-wait-for-timeout': 'off',
      // Some probes assert through a shared helper the rule can't see into.
      'playwright/expect-expect': [
        'warn',
        { assertFunctionNames: ['assertHeldOrWebkitNoop'] },
      ],
    },
  },
)
