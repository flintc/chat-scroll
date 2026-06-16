# `@chat-scroll/react`

```ts
import { useChatScroll } from '@chat-scroll/react'
```

Re-exports everything from `@chat-scroll/core`, plus:

## `useChatScroll(options?)`

```ts
function useChatScroll(
  options?: UseChatScrollOptions,
): UseChatScrollReturn
```

```ts
interface UseChatScrollOptions extends ChatScrollOptions {
  /**
   * Reactive streaming flag. The adapter mirrors its value into the
   * controller via `setStreaming` whenever it changes.
   * Use when an upstream source already owns the request lifecycle
   * (e.g. `useChat`'s `isLoading`, an agent SDK's `isRunning`). Omit to
   * drive `setStreaming` imperatively from event handlers.
   */
  streaming?: boolean
}
```

```ts
interface UseChatScrollReturn {
  state: ChatScrollState
  containerRef: (el: HTMLElement | null) => void
  contentRef: (el: HTMLElement | null) => void
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

State updates flow through `useSyncExternalStore`, so re-renders only fire
on actual state transitions.

The hook calls `instance.setOptions()` whenever option fields change, and
`instance.destroy()` on unmount.

See the [React guide](../guide/react) for usage patterns.
