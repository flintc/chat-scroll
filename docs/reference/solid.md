# `@chat-scroll/solid`

```ts
import { createChatScroll } from '@chat-scroll/solid'
```

Re-exports everything from `@chat-scroll/core`, plus:

## `createChatScroll(options?)`

```ts
function createChatScroll(
  options?: CreateChatScrollOptions,
): CreateChatScrollReturn
```

```ts
interface CreateChatScrollOptions extends ChatScrollOptions {
  /**
   * Reactive streaming flag. Pass a Solid accessor — typically a signal
   * getter or `() => upstream.isRunning`. The adapter mirrors its value
   * into the controller via `setStreaming` whenever it changes. Omit to
   * drive `setStreaming` imperatively from event handlers.
   */
  streaming?: Accessor<boolean>
}
```

```ts
interface CreateChatScrollReturn {
  state: Accessor<ChatScrollState>
  containerRef: (el: HTMLElement) => void
  contentRef: (el: HTMLElement) => void
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

The composable wraps the core instance in a Solid signal. Read state via
`scroll.state()`. Updates fire through `subscribe()` and propagate to
Solid's reactive graph.

`instance.destroy()` is registered with `onCleanup` automatically when
called inside a Solid root or component.

See the [Solid guide](../guide/solid) for usage patterns.
