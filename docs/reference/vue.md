# `@chat-scroll/vue`

```ts
import { useChatScroll } from '@chat-scroll/vue'
```

Re-exports everything from `@chat-scroll/core`, plus:

## `useChatScroll(options?)`

```ts
function useChatScroll(
  options?: UseChatScrollOptions | Ref<UseChatScrollOptions>,
): UseChatScrollReturn
```

```ts
interface UseChatScrollOptions extends ChatScrollOptions {
  /**
   * Reactive streaming flag. Accepts a plain boolean, a `Ref<boolean>`,
   * or a getter. The adapter mirrors its value into the controller
   * via `setStreaming` whenever it changes. Omit to drive
   * `setStreaming` imperatively from event handlers.
   */
  streaming?: MaybeRefOrGetter<boolean>
}
```

```ts
interface UseChatScrollReturn {
  state: DeepReadonly<Ref<ChatScrollState>>
  containerRef: (el: Element | null) => void
  contentRef: (el: Element | null) => void
  instance: ChatScrollInstance

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
}
```

The composable accepts either a plain options object or a reactive `Ref`.
When given a ref, it sets up a deep watcher that calls `setOptions()` on
the underlying instance whenever the ref value changes.

`instance.destroy()` is registered with `onBeforeUnmount` automatically
when called inside a Vue component setup.

See the [Vue guide](../guide/vue) for usage patterns.
