# Streaming mode

Long-running model responses arrive as a stream of tokens — the DOM
mutates dozens of times per second. Browsers respond by **scroll
anchoring**: they try to keep a "stable" node visible across layout
changes. That's helpful for static pages (an image loads, content
above shifts down, the user's reading position doesn't drift), but in
an actively-managed chat it conflicts with both built-in strategies.

`chat-scroll` handles this with a single toggle:

```ts
scroll.setStreaming(true)
// ... assistant streams ...
scroll.setStreaming(false)
```

## What `setStreaming` does

`setStreaming(true)` does two things:

1. Sets `overflow-anchor: none` on the container. The browser stops
   anchoring scroll to arbitrary nodes during DOM mutation, so the
   controller's pin/lock math isn't competing with the browser for
   `scrollTop`.
2. For `stick-to-bottom` specifically, **arms the auto-snap**. The
   strategy only re-pins `scrollTop` to `scrollHeight` when
   `streaming && locked` are both true. Outside a stream, expanding a
   collapsible block in a completed reply doesn't yank the viewport.

`setStreaming(false)` clears both — after a **two-frame grace
period**. The final chunk's growth typically renders *after* your
loading flag flips (the append and the flag change land in the same
tick; the resize fires later), and without the grace stick-to-bottom
would stop following one resize too early, leaving the last chunk
above the bottom. Flip the flag synchronously with the last append —
the controller handles the ordering, and user input during the grace
still wins immediately.

## Two shapes for the same lifecycle

You can drive `setStreaming` two ways. Pick whichever is closer to
your stream's start / end events.

### Reactive: hand the flag to the adapter

When an upstream source already exposes a loading boolean — `useChat`'s
`isLoading`, an agent SDK's `isRunning` — pass it as the `streaming`
option. The adapter installs the watcher and calls `setStreaming` on
change.

::: code-group

```tsx [React]
const scroll = useChatScroll({ streaming: isLoading })
```

```vue [Vue]
const scroll = useChatScroll({ streaming: () => props.loading })
// or pass a Ref / plain value — see the Vue adapter guide.
```

```tsx [Solid]
const scroll = createChatScroll({ streaming: () => agent.isRunning })
```

:::

This is the right shape for **most chat hooks** — they own the
request lifecycle and expose state, but the start/end events are
internal. Reading their loading flag is the only handle you have.

### Imperative: call `setStreaming` at your event sites

When you own the start / end events directly — you wrote the `send`
loop, you're listening to a WebSocket, the events come from a
non-reactive source — call the method at those call sites:

```ts
async function handleSend(text: string) {
  appendUserMessage(text)
  scroll.pinLatest('[data-role="user"]')

  scroll.setStreaming(true)
  await streamAssistant(text)
  scroll.setStreaming(false)
}
```

This is the right shape for **vanilla / custom transports** and any
case where the surrounding code already needs to do other work at the
stream boundaries (focus the composer, log analytics, save a
transcript).

### Don't do both at once

Pick one shape per instance. If you pass a reactive `streaming` option
**and** call `setStreaming` imperatively, the reactive watcher will
clobber your imperative call on the next render / flush. The two
shapes are alternatives, not layers.

## Why not leave `overflow-anchor: none` on permanently?

Browser anchoring is genuinely useful outside a stream. If a
collapsible thinking block in a completed reply expands, anchoring
keeps the reading position stable around it. If a late-arriving image
shifts content down, anchoring keeps your eye on the line you were
reading. We turn it off only while the controller is actively
managing `scrollTop`.

## Reading state

```ts
scroll.state.streaming // boolean
```

Mirrors the last `setStreaming()` call — whether driven by the reactive
`streaming` option or by an imperative call. Useful for a "…is typing"
indicator or test assertions. (For UI, an upstream loading flag is
usually the cleaner source.)
