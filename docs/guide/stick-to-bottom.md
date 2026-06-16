# Stick-to-bottom strategy

The classic chat scroll behavior: stay glued to the bottom as new
messages arrive, but get out of the way when the user scrolls up to
read history.

<LiveDemo scenario="stick-to-bottom" caption="Auto-follow on append. Scrolling up releases the lock; the ↓ button (or a new send) re-engages it. ‹ Prev / Next › step between turns with plain scrolling." />

## When to use it

- Group chat / DM (Slack, WhatsApp, iMessage).
- Log viewers where the latest line is the most important.
- Anywhere new messages should _push_ older ones out of view by default.

## How it works

Two flags combine: `locked` and `streaming`. The strategy re-pins
`scrollTop` to the bottom on content resize only when **both** are
true.

1. **Mount.** `locked = true`, container at the bottom. `streaming` is
   `false`, so the strategy is inert.
2. **Stream starts.** With `streaming` set, every content resize while
   locked snaps to the bottom — the viewport follows the tokens.
3. **User scrolls up mid-stream.** The lock releases the moment the
   _input_ arrives (wheel-up, downward touch pan, ArrowUp / PageUp /
   Home), so the lock releases before the next stream resize can re-pin
   the viewport and override the user's scroll.
   A position check backs this up for inputs that emit no events, like
   scrollbar drags.
4. **Stream ends.** Flip your flag synchronously with the last append —
   the controller follows resizes for a two-frame grace so the final
   chunk still lands at the bottom, then goes inert.
5. **User sends.** Call `scroll.lock()` — both flags are true again and
   the cycle repeats.

::: warning Why the streaming gate matters
Without it, expanding a collapsible block in a past reply would jump
the user to the bottom by the block's expanded height. The gate makes
the contract explicit: the controller follows the stream; the user
owns post-stream interaction.
:::

## Wiring

Pass `streaming` so the adapter handles the `setStreaming` lifecycle,
and call `lock()` from your send handler:

```tsx
const scroll = useChatScroll({
  strategy: 'stick-to-bottom',
  streaming: isLoading, // adapter mirrors this into setStreaming
})

function handleSend(text: string) {
  sendMessage(text)
  scroll.lock()
}
```

You don't call `unlock()` yourself — the controller releases the lock
on upward scroll input.

`lock()` on send covers the user who scrolled up to read history, then
typed a reply: without it, their own message lands below the viewport.
If they're already at the bottom it changes nothing, so call it
unconditionally.

Prefer the reactive `streaming` option when your data source already
exposes a loading boolean; `scroll.setStreaming(true/false)` is the
imperative equivalent. See [Streaming mode](./streaming).

## Showing a "scroll to bottom" affordance

Drive a button with `state.atBottom`:

```tsx
{!scroll.state.atBottom && (
  <button onClick={scroll.scrollToBottom}>↓ New messages</button>
)}
```

`scrollToBottom()` re-engages the lock once the scroll completes, so a
mid-stream click resumes following — no separate `lock()` needed. If
the user aborts the animation with a wheel or touch, the lock stays
released. Manually scrolling back to the bottom does **not** re-lock;
only the explicit affordances do (`scrollToBottom()`, `lock()`,
`reset()`).

The threshold is configurable:

```ts
useChatScroll({
  strategy: 'stick-to-bottom',
  bottomThreshold: 100, // default 40
})
```

## Difference from pin-to-top

| Property        | pin-to-top              | stick-to-bottom                                   |
| --------------- | ----------------------- | ------------------------------------------------- |
| Scroll position | Stable during streaming | Glued to bottom                                   |
| Anchor          | User message            | Bottom of content                                 |
| Gutter          | Yes — bounds scroll     | None                                              |
| User scroll-up  | Free                    | Releases lock                                     |
| Re-engagement   | New `pinMessage()` call | `lock()` on send, or the FAB's `scrollToBottom()` |
| Default for     | AI chat                 | Group / traditional chat                          |
