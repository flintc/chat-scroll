import pluginVue from 'eslint-plugin-vue'
import {
  defineConfigWithVueTs,
  vueTsConfigs,
} from '@vue/eslint-config-typescript'

export default defineConfigWithVueTs(
  { files: ['.vitepress/**/*.{ts,vue}'] },
  { ignores: ['.vitepress/cache', '.vitepress/dist'] },
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,
)
