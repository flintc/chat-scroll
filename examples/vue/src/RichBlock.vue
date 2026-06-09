<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ThinkingPart, ToolPart } from './use-rich-chat'

const props = defineProps<{
  part: ThinkingPart | ToolPart
  index: number
}>()

const open = ref(props.part.defaultOpen)
const title = computed(() =>
  props.part.type === 'thinking' ? props.part.summary : props.part.name,
)
const args = computed(() =>
  props.part.type === 'tool' ? props.part.args : '',
)
const body = computed(() =>
  props.part.type === 'thinking' ? props.part.body : props.part.result,
)
</script>

<template>
  <div
    :class="
      part.type === 'thinking' ? 'block block--thinking' : 'block block--tool'
    "
    data-test="expand-block"
    :data-block-index="index"
    :data-open="open ? 'true' : 'false'"
  >
    <button
      class="block__summary"
      type="button"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="block__icon" aria-hidden="true">
        {{ part.type === 'thinking' ? '💭' : '🛠' }}
      </span>
      <span class="block__title">
        {{ title }}
        <span v-if="part.type === 'tool'" class="block__args">{{ args }}</span>
      </span>
      <span class="block__chev" aria-hidden="true">▾</span>
    </button>
    <div class="block__wrap">
      <div class="block__body">
        <pre v-if="part.type === 'tool'" class="block__pre">{{ body }}</pre>
        <template v-else>{{ body }}</template>
      </div>
    </div>
  </div>
</template>
