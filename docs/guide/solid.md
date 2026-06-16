# Solid adapter

```sh
pnpm add @chat-scroll/solid
```

<LiveDemo scenario="pin-to-top" caption="The Solid adapter wraps the same core — reactive state arrives as signals." />

`createChatScroll` is the Solid entry point. It owns a single
`ChatScrollInstance` per owner scope, exposes state as a signal
accessor, and destroys the instance via `onCleanup`.

## Basic usage

```tsx
import { For } from 'solid-js'
import { createChatScroll } from '@chat-scroll/solid'

export function Chat(props: {
  messages: Message[]
  loading: boolean
  sendMessage: (text: string) => void
}) {
  const scroll = createChatScroll({
    strategy: 'pin-to-top',
    streaming: () => props.loading, // accessor — Solid signal style
  })

  function handleSend(text: string) {
    props.sendMessage(text)
    scroll.pinLatest('[data-role="user"]')
  }

  return (
    <div ref={scroll.containerRef} class="chat">
      <div ref={scroll.contentRef} class="messages">
        <For each={props.messages}>
          {(m) => <div data-role={m.role}>{m.text}</div>}
        </For>
      </div>

      <button
        classList={{
          'scroll-fab': true,
          'scroll-fab--visible': !scroll.state().atBottom,
        }}
        onClick={scroll.scrollToBottom}
      >
        ↓
      </button>

      <Composer onSend={handleSend} />
    </div>
  )
}
```

What's worth noticing:

- **`scroll.state` is an accessor** — call it: `scroll.state().atBottom`.
- **`streaming` takes an `Accessor<boolean>`** — a getter (above) or a
  signal getter. Solid signals are accessors, so passing
  `() => upstream.isRunning` is the idiomatic form.
- **No effect** for the pin call. The send handler runs `pinLatest`
  the same tick it appends; Solid's fine-grained reactivity updates
  the DOM before the rAF fires.

## API surface

```ts
interface CreateChatScrollOptions extends ChatScrollOptions {
  /** Forwarded to setStreaming when the value changes. */
  streaming?: Accessor<boolean>
}

function createChatScroll(
  opts?: CreateChatScrollOptions,
): CreateChatScrollReturn
```

```ts
interface CreateChatScrollReturn {
  state: Accessor<ChatScrollState> // call it: state()

  containerRef: (el: HTMLElement) => void
  contentRef: (el: HTMLElement) => void

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

`streaming` takes an `Accessor<boolean>` — typically a signal getter,
a getter expression, or a prop accessor:

```tsx
createChatScroll({ streaming: () => agent.isRunning })

const [streaming, setStreaming] = createSignal(false)
createChatScroll({ streaming })
```

Internally the adapter wraps the read in a `createRenderEffect`, so
the controller is in sync before the call site returns.

Omit `streaming` and call `scroll.setStreaming(true / false)`
imperatively when you own the start / end events directly. Both
shapes are valid; pick the one whose source of truth is closer to
where the events fire. Don't do both — the render-effect wins on the
next change.

## State access

`state` is a Solid accessor. Call it to read the current snapshot:

```ts
scroll.state().atBottom
scroll.state().pinActive
scroll.state().streaming
```

It updates whenever the underlying core emits a state change. Use it
inside JSX or reactive computations — Solid tracks the call site.

## Refs

`containerRef` and `contentRef` are plain ref-callback functions —
attach via `ref={scroll.containerRef}`. The instance mounts after
**both** elements have been bound.

## Cleanup

`onCleanup(() => instance.destroy())` is registered automatically
when `createChatScroll` runs inside a Solid root or component setup.
Outside any owner (rare — a top-level module call, an isolated
`createRoot` you forgot to scope), call `scroll.instance.destroy()`
yourself.

## Thread switching

The cleanest pattern is keyed remount — a new `threadId` means a
fresh component, which means a fresh `ChatScrollInstance`:

```tsx
<Show keyed when={threadId()}>
  {(id) => <Chat threadId={id} />}
</Show>
```

If you need to preserve scroll position across visits, keep a
single instance and use the [scroll restoration](./scroll-restoration)
helpers instead.

## SSR

Safe on the server. `createChatScroll` constructs the instance during
setup; the core doesn't touch `document` / `window` at construction.
`mount()` runs only after `ref` resolves, which fires client-side.
SolidStart needs no extra setup.
