<script setup lang="ts">
import type { Part, RichMessage, ThinkingPart, ToolPart } from './use-rich-chat'
import RichBlock from './RichBlock.vue'

defineProps<{ msg: RichMessage }>()

// Narrowing helpers used in the template. `v-if="part.type === 'text'"`
// keeps Vue's template type narrowing inside that branch.
const isText = (p: Part): p is Extract<Part, { type: 'text' }> =>
  p.type === 'text'
const isBlock = (p: Part): p is ThinkingPart | ToolPart =>
  p.type === 'thinking' || p.type === 'tool'
</script>

<template>
  <div
    :class="msg.role === 'user' ? 'msg msg--user' : 'msg msg--bot'"
    :data-test="msg.role === 'user' ? 'user-msg' : 'bot-msg'"
  >
    <!--
      `:key="i"` keeps each slot stable across streaming updates. The
      part object at index N is replaced on every chunk (immutable
      update), but the DOM node and the child component instance — and
      its local `open` ref — survive.
    -->
    <template v-for="(part, i) in msg.parts" :key="i">
      <div v-if="isText(part)" class="msg__text">{{ part.text }}</div>
      <RichBlock v-else-if="isBlock(part)" :part="part" :index="i" />
    </template>
  </div>
</template>
