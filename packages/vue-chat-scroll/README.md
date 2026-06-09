# @chat-scroll/vue

Vue 3 adapter for [`@chat-scroll/core`](https://github.com/flintc/chat-scroll).

Re-exports the full core surface, so you only need this one install.

## Install

```sh
pnpm add @chat-scroll/vue
```

## Quick example

```vue
<script setup>
import { toRef } from 'vue'
import { useChatScroll } from '@chat-scroll/vue'

const props = defineProps(['messages', 'loading'])
const scroll = useChatScroll({
  strategy: 'pin-to-top',
  streaming: toRef(props, 'loading'), // controlled — mirrors upstream prop
})
</script>

<template>
  <div :ref="scroll.containerRef">
    <div :ref="scroll.contentRef">
      <div v-for="m in messages" :key="m.id" :data-role="m.role">
        {{ m.text }}
      </div>
    </div>
  </div>
</template>
```

## Docs

Full guide: [flintc.github.io/chat-scroll/guide/vue](https://flintc.github.io/chat-scroll/guide/vue)

## License

MIT
