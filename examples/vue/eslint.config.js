import pluginVue from 'eslint-plugin-vue'
import {
  defineConfigWithVueTs,
  vueTsConfigs,
} from '@vue/eslint-config-typescript'

export default defineConfigWithVueTs(
  { files: ['src/**/*.{ts,vue}'] },
  { ignores: ['dist'] },
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,
)
