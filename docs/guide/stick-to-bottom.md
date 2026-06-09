# Stick-to-bottom strategy

The classic chat scroll behavior: stay glued to the bottom as new messages
arrive, but get out of the way when the user scrolls up to read history.

<DemoVideo name="vanilla__stick-to-bottom" caption="Auto-follow on append. Scrolling up releases the lock — new content no longer disturbs scroll. Re-lock snaps back to the bottom." />

## When to use it

- Group chat / DM (Slack, WhatsApp, iMessage).
- Log viewers where the latest line is the most important.
- Anywhere new messages should _push_ older ones out of view by default.

## How it works

Two pieces of state combine: `locked: boolean` and `streaming: boolean`. The
strategy only re-pins `scrollTop` to `scrollHeight` when **both** are true.

- **Streaming + locked** — every content resize snaps to bottom.
- **Not streaming** — content can grow freely (e.g., the user expands a tool
  block in a completed reply) without the controller yanking them back. The
  browser's native `overflow-anchor` handles whatever stability the layout
  asks for.
- **Not locked** — same: a user who scrolled up to read history is left alone.

The lifecycle:

1. **Mount.** `locked = true`, container scrolled to bottom. `streaming` is
   still `false`, so the strategy is inert.
2. **Consumer starts a stream.** Call `scroll.setStreaming(true)`. Now any
   ResizeObserver fire while locked snaps to bottom — perfect for the new
   tokens arriving from the model.
3. **User scrolls up mid-stream.** Scroll handler detects we're no longer
   within `bottomThreshold` and sets `locked = false`. Subsequent content
   growth no longer disturbs scroll.
4. **Consumer ends the stream.** Call `scroll.setStreaming(false)`. The lock
   may still be `true` (if the user never scrolled away), but the resize
   handler is now inert. The user can interact with completed content — tap
   to expand a tool-call block, copy a code span — without the controller
   fighting them.
5. **User sends a new message.** Consumer calls `scroll.lock()` and
   `scroll.setStreaming(true)`. Both flags are true again, we snap to bottom,
   and the cycle repeats.

::: warning Why the streaming gate matters
Without it, expanding a collapsible block in a past reply (a tool-call body,
a thinking block) would yank the user to the bottom by the block's full
expanded height. They tapped a summary at viewport-Y=250, and 200ms of
animated resize later, that summary is at Y=37 — visibly fighting their
intent. The gate makes "the controller follows the stream; the user owns
post-stream interaction" the explicit contract.
:::

## Wiring

The minimum surface — pass `streaming` so the adapter handles the
`setStreaming` lifecycle, and call `lock()` from your send handler:

```tsx
const scroll = useChatScroll({
  strategy: 'stick-to-bottom',
  streaming: isLoading, // adapter mirrors into setStreaming
})

function handleSend(text: string) {
  sendMessage(text)
  scroll.lock() // see below
}
```

You typically don't call `unlock()` yourself — the scroll handler
releases the lock automatically when the user scrolls up.

### Why call `lock()` on send?

`lock()` re-engages the bottom-stick and snaps the container to the
bottom now. You need it in the case where the user has scrolled up to
read history, then types a reply and hits send — without `lock()`, the
new send and the streamed response land below the viewport, and the
user has to scroll down to see their own message.

If the user is already at the bottom, `lock()` is a no-op for them
visually (already locked, already there) — so it's safe to call
unconditionally from the send handler.

### Why an upstream `streaming` flag and not just `setStreaming`?

You can drop the `streaming` option and call `scroll.setStreaming(true
/ false)` imperatively at the start/end of your stream — same effect.
The reactive option is the shorter form when your data source already
exposes a loading boolean (`useChat`'s `isLoading`, an agent SDK's
`isRunning`, a `useQuery`'s `isFetching`). See [Streaming
mode](./streaming) for the trade-offs between the two shapes.

## Showing a "scroll to bottom" affordance

Use `state.atBottom` to drive a button:

```tsx
{!scroll.state.atBottom && (
  <button onClick={scroll.scrollToBottom}>↓ New messages</button>
)}
```

The threshold for "at bottom" is configurable:

```ts
useChatScroll({
  strategy: 'stick-to-bottom',
  bottomThreshold: 100, // default 40
})
```

## Streaming

The streaming flag is **load-bearing** for this strategy — without it,
the auto-snap is permanently disarmed. See the gate logic in
[How it works](#how-it-works). [Streaming mode](./streaming) covers
the broader `overflow-anchor` story that applies to both strategies.

## Difference from pin-to-top

| Property              | pin-to-top              | stick-to-bottom            |
| --------------------- | ----------------------- | -------------------------- |
| Scroll position       | Stable during streaming | Glued to bottom            |
| Anchor reference      | User message            | Bottom of content          |
| Gutter usage          | Yes — bounds scroll     | None                       |
| User scroll-up        | Free                    | Releases lock              |
| Re-engagement         | New `pinMessage()` call | `lock()` (typically on send) |
| Default for           | AI chat                 | Group / traditional chat   |
