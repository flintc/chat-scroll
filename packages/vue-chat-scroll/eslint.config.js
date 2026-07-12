// The adapter is composables-only (no SFCs or templates), so
// eslint-plugin-vue — whose rules target .vue files — adds nothing here;
// plain typescript-eslint covers it.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
)
