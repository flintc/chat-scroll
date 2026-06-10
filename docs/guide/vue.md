# Vue adapter

```sh
pnpm add @chat-scroll/vue
```

`useChatScroll` is the Vue entry point. It owns a single
`ChatScrollInstance` per setup scope, mirrors state through a Vue
ref, and tears down the instance via `onBeforeUnmount`.

## Basic usage

```vue
<script setup lang="ts">
import { useChatScroll } from '@chat-scroll/vue'

const props = defineProps<{
  messages: Message[]
  loading: boolean
  sendMessage: (text: string) => void
}>()

const scroll = useChatScroll({
  strategy: 'pin-to-top',
  streaming: () => props.loading, // getter — re-reads on access
})

function handleSend(text: string) {
  props.sendMessage(text)
  scroll.pinLatest('[data-role="user"]')
}
</script>

<template>
  <div :ref="scroll.containerRef" class="chat">
    <div :ref="scroll.contentRef" class="messages">
      <div
        v-for="m in messages"
        :key="m.id"
        :data-role="m.role"
      >
        {{ m.text }}
      </div>
    </div>

    <button
      v-if="!scroll.state.value.atBottom"
      class="scroll-fab"
      @click="scroll.scrollToBottom"
    >
      ↓
    </button>

    <Composer @send="handleSend" />
  </div>
</template>
```

What's worth noticing:

- **`scroll.state` is a `Ref`** — read it as `scroll.state.value.X` in
  `<script>` or `<template>`. (Don't unwrap to a plain object — the
  reactivity dies.)
- **`streaming` takes a `MaybeRefOrGetter<boolean>`** — a getter
  (above), a `Ref`, or a plain boolean. The adapter uses `toValue` so
  all three work. Pick the one that matches your upstream.
- **No effect** for the pin call — the send handler runs `pinLatest`
  the same tick it appends, and Vue's reactive update flushes before
  the next animation frame.

## API surface

```ts
interface UseChatScrollOptions extends ChatScrollOptions {
  /** Mirrors an upstream ref / getter / value into setStreaming. */
  streaming?: MaybeRefOrGetter<boolean>
}

function useChatScroll(
  opts?: UseChatScrollOptions | Ref<UseChatScrollOptions>,
): UseChatScrollReturn
```

```ts
interface UseChatScrollReturn {
  state: DeepReadonly<Ref<ChatScrollState>> // .value to read

  containerRef: (el: Element | null) => void
  contentRef: (el: Element | null) => void

  pinMessage: (el: HTMLElement) => void
  pinLatest: (selector: string) => void
  pinRelative: (selector: string, direction: -1 | 1) => boolean
  getPinnedElement: () => HTMLElement | null
  referenceMessage: (selector: string) => ReferenceMessage
  relativeMessage: (selector: string, direction: -1 | 1) => HTMLElement | null
  scrollToMessage: (el: HTMLElement) => void
  scrollToBottom: () => void
  lock: () => void
  unlock: () => void
  setStreaming: (streaming: boolean) => void
  reset: () => void
  savePosition: () => ScrollPosition
  restorePosition: (pos: ScrollPosition) => void

  instance: ChatScrollInstance
}
```

## The `streaming` option

```ts
// Getter — most common with props
useChatScroll({ streaming: () => props.loading })

// Ref — when your loading flag is already a ref
const isLoading = ref(false)
useChatScroll({ streaming: isLoading })

// Plain value — frozen at construction; rarely what you want
useChatScroll({ streaming: false })
```

Internally the adapter calls `toValue(opts.streaming)` inside a
`watchEffect`. Changes propagate to `instance.setStreaming` on the
next flush.

Omit `streaming` and call `scroll.setStreaming(true / false)`
imperatively when you own the start / end events directly. Both
shapes are valid; pick the one whose source of truth is closer to
where the events fire. Don't do both — the watcher wins on the next
flush.

## State access

`state` is a `Ref`, so you read it as `scroll.state.value.X` in
script, and the same in templates (Vue doesn't auto-unwrap refs that
arrive via a composable return). To `watch`:

```ts
watch(
  () => scroll.state.value.atBottom,
  (atBottom) => {
    if (atBottom) clearUnreadCount()
  },
)
```

If you'd rather destructure into individual refs, use `toRefs`:

```ts
import { toRefs } from 'vue'
const { atBottom, pinActive } = toRefs(scroll.state.value)
```

## Reactive options

`useChatScroll` accepts either a plain object or a `Ref<Options>`.
When a ref is passed, the adapter installs a deep watcher that calls
`instance.setOptions()` on change — useful for strategy switching or
threshold tuning:

```ts
const opts = ref({ strategy: 'pin-to-top', bottomThreshold: 40 })
useChatScroll(opts)

// later:
opts.value.bottomThreshold = 100
```

## Refs

`containerRef` and `contentRef` are functions you bind via
`:ref="..."`. The instance mounts after **both** elements have been
bound, so order doesn't matter.

## Cleanup

`onBeforeUnmount(() => instance.destroy())` is registered
automatically when the composable runs inside a Vue setup. If you
call it outside a component (rare — a Pinia store, an isolated
effect scope), call `scroll.instance.destroy()` yourself.

## Thread switching

The cleanest pattern is `:key`-based remount — a new `threadId`
means a fresh `Chat` component instance, which means a fresh
`ChatScrollInstance`:

```vue
<Chat :key="threadId" :thread-id="threadId" />
```

If you need to preserve scroll position across visits, keep a
single instance and use the [scroll restoration](./scroll-restoration)
helpers instead.

## SSR

Safe on the server. `useChatScroll` constructs the instance inside
`<script setup>`; the core doesn't touch `document` / `window` at
construction. `mount()` runs only after `:ref` resolves, which fires
client-side. Nuxt and any Vue SSR framework work without ceremony.
