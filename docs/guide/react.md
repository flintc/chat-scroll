# React adapter

```sh
pnpm add @chat-scroll/react
```

`useChatScroll` is the React entry point. It owns a single
`ChatScrollInstance` for the component's lifetime, mirrors the
controller's reactive state through `useSyncExternalStore`, and
destroys the instance on unmount.

## Basic usage

```tsx
import { useChatScroll } from '@chat-scroll/react'

export function Chat({ messages, isLoading, sendMessage }) {
  const scroll = useChatScroll({
    strategy: 'pin-to-top',
    streaming: isLoading, // adapter mirrors this into setStreaming
  })

  function handleSend(text: string) {
    sendMessage(text)
    scroll.pinLatest('[data-role="user"]')
  }

  return (
    <div ref={scroll.containerRef} className="chat">
      <div ref={scroll.contentRef} className="messages">
        {messages.map((m) => (
          <div key={m.id} data-role={m.role}>
            {m.text}
          </div>
        ))}
      </div>

      {!scroll.state.atBottom && (
        <button className="scroll-fab" onClick={scroll.scrollToBottom}>
          ↓
        </button>
      )}

      <Composer onSend={handleSend} />
    </div>
  )
}
```

What's worth noticing:

- **No `useEffect` to detect "user just sent"** — the send handler
  already knows. `pinLatest` runs the same tick, queues for the next
  frame, and finds the appended user bubble.
- **`isLoading` becomes `streaming` for the controller** — the adapter
  watches the option and calls `setStreaming` whenever it changes.
- **`scroll.state.atBottom` is read directly** — no `.value`, no `()`.
  React's `useSyncExternalStore` gives you the latest snapshot on
  every render.

## API surface

```ts
interface UseChatScrollOptions extends ChatScrollOptions {
  /** Forwarded to setStreaming when the value changes. */
  streaming?: boolean
}

function useChatScroll(opts?: UseChatScrollOptions): UseChatScrollReturn
```

```ts
interface UseChatScrollReturn {
  state: ChatScrollState // plain object, accessed directly

  containerRef: (el: HTMLElement | null) => void
  contentRef: (el: HTMLElement | null) => void

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

  /** Underlying core instance — escape hatch. */
  instance: ChatScrollInstance
}
```

## The `streaming` option

`streaming` takes a plain boolean. The adapter installs a `useEffect`
that calls `setStreaming(opts.streaming)` whenever the value changes.

Pass it when an upstream source already owns the request lifecycle —
`useChat`'s `isLoading`, an agent SDK's `isRunning`. Omit it and call
`scroll.setStreaming(true / false)` imperatively from your send /
stream-end handlers when you own the events directly. Both shapes are
valid; pick the one whose source of truth is closer to where the
events fire.

Don't do both on the same instance — the reactive option wins on the
next render and overwrites your imperative call.

## State access

Read state fields directly off `scroll.state`:

```tsx
scroll.state.atBottom
scroll.state.pinActive
scroll.state.streaming
```

State updates flow through `useSyncExternalStore`, so the component
re-renders only on actual transitions (the state object is frozen and
identity-stable). React's batching applies.

## Options

`useChatScroll` calls `instance.setOptions()` whenever a primitive
option field changes (`strategy`, `bottomThreshold`, `scrollMargin`,
`scrollBehavior`, `scrollDurationMs`). Pass options inline:

```tsx
useChatScroll({ strategy: 'pin-to-top', bottomThreshold: 80 })
```

`scrollBehavior` and `scrollDurationMs` are read on every scroll call,
so changes via `setOptions` take effect on the next scroll without
reconstructing the instance — wire them to a UI toggle / slider if you
want users to tune the feel.

## Refs

`containerRef` and `contentRef` are React ref callbacks. The instance
mounts after **both** have been set, so they can attach in any order.

```tsx
<div ref={scroll.containerRef}>
  <div ref={scroll.contentRef}>...</div>
</div>
```

## Thread switching

The cleanest pattern in React is `key`-based remount — a new
`threadId` means a fresh `Chat` component instance, which means a
fresh `ChatScrollInstance`:

```tsx
<Chat key={threadId} threadId={threadId} />
```

If you need to preserve scroll position across visits, keep a single
instance and use the [scroll restoration](./scroll-restoration)
helpers instead — that's what the [multi-thread
recipe](../recipes/multi-thread) shows.

## SSR

Safe on the server. `useChatScroll` calls `createChatScroll(opts)`
inside a `useRef` initializer; the core doesn't touch `document` /
`window` at construction. `mount()` only runs from a ref callback,
which fires client-side after hydration. Use the `'use client'`
directive on the component if you're in a React Server Components
context.
