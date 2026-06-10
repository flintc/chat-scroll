# Pin-to-top strategy

The pattern made popular by ChatGPT, Claude, and Gemini: when the user sends
a message, it pins to the top of the viewport so the assistant's response
streams in directly below.

<LiveDemo scenario="pin-to-top" caption="Live demo — send a message: it pins to the top while the response streams in below. Expand the Tool call / Reasoning blocks in earlier replies mid-stream — content above the pin resizes and the pin holds. ‹ Prev / Next › hop the pin between user turns (pinRelative)." />

## When to use it

- AI chat where each turn is large (a question + a paragraph-or-more
  response).
- You want scroll position to be _stable_ during streaming — no auto-scroll,
  no movement under the cursor.
- The user should be able to read the response top-down at their own pace.

## How it works

1. Consumer calls `scroll.pinMessage(el)` on the just-sent user message.
2. `chat-scroll` sets `scroll-margin-top` on the element, measures its
   offset within the container, and remembers it as `pinnedY`.
3. The **gutter** below the content is sized so that, at maximum
   scroll, the pinned message sits exactly at the top of the viewport
   (minus the configured [`scrollMargin`](../reference/options#scrollmargin)).
   This is the **tight-pin contract**:

   ```
   container.scrollHeight - container.clientHeight === pinnedY
   ```

   The math:

   ```
   gutterHeight = max(
     0,
     pinnedY + container.clientHeight - gutterTop - container.paddingBottom,
   )
   ```

   Where `gutterTop` is the gutter's distance from the container's
   padding-edge top, computed from `getBoundingClientRect()` so it
   always references the container regardless of its `position` style
   (a static container would otherwise route `gutter.offsetTop` up to
   the nearest positioned ancestor and the formula would absorb
   unrelated chrome). The gutter is the container's last child, so
   that distance absorbs *everything* the consumer's CSS puts above
   it — container `padding-top`, content `margin`, content `padding`,
   content `border`, any sibling spacing. Container `padding-bottom`
   is the one thing below the gutter inside the scroll plane, so it's
   subtracted explicitly. **You don't have to tell `chat-scroll` about
   your CSS** — the formula reads what the browser laid out and
   adapts. For a sub-pixel-tight pin under `overflow-y: auto`, see the
   [tight pin recipe](../recipes/tight-pin).

4. An rAF-driven smooth scroll moves the container to the pin's
   computed Y. The animation re-reads the target every frame, so if
   content above the pin grows or shrinks mid-animation (a late
   resize, a delayed image, an expanding sibling), the animation
   lands at the live `pinnedY`. With `prefers-reduced-motion: reduce`
   — or with `scrollBehavior: 'instant'` — this is a synchronous
   write. We deliberately do not use `el.scrollIntoView({behavior:
   'smooth'})`: iOS Safari samples a stale `scrollHeight` when the
   gutter resize hits the same frame, and lands the animation at the
   pre-resize maximum.
5. As the response streams in, `ResizeObserver` fires, and the gutter
   shrinks toward zero. Eventually it reaches zero and the conversation
   scrolls naturally.

<LiveDemo scenario="pin-to-top" gutter caption="Live demo — the synthetic gutter (striped band below the response) shrinks as the assistant fills space. When it reaches zero, natural scrolling takes over." />

## Wiring

The send handler is the natural home for `pinLatest`. It's the one
place that knows a new turn just started, so you don't need an effect
to detect "a user message appeared" after the fact:

```tsx
const scroll = useChatScroll({
  strategy: 'pin-to-top',
  streaming: isLoading, // adapter mirrors this into setStreaming
})

function handleSend(text: string) {
  sendMessage(text)
  scroll.pinLatest('[data-role="user"]')
}
```

`pinLatest(selector)` finds the last matching element inside the
container and pins it on the next animation frame, so you can call it
the same tick you append the message — the new bubble is in the DOM by
the time the pin work runs.

If you have the element directly (a ref, a `lastUser` accessor from
your chat hook), use `pinMessage`:

```ts
scroll.pinMessage(userMessageEl)
```

::: tip When you genuinely need an effect
If your message list is populated by an upstream source you don't
control (a chat hook that takes the request out of your hands, a
WebSocket push, a `useChat` clone), the "a user message appeared"
signal lives in the data, not in any handler you wrote. An effect
watching `messages.at(-1)?.role === 'user'` is the honest shape there.
The general guidance still holds: prefer the handler when you have
one; reach for the effect only when the data is the only signal you
have.
:::

## Streaming

Always signal streaming mode while the assistant is generating and
clear it when done — this disables browser `overflow-anchor`, which
otherwise fights the strategy by re-anchoring scroll to arbitrary
nodes during DOM mutation. See [Streaming mode](./streaming) for the
full story.

The shortest path: pass your loading flag as the adapter's `streaming`
option, and the wiring happens for you.

```tsx
const scroll = useChatScroll({
  strategy: 'pin-to-top',
  streaming: isLoading,
})
```

## Multi-turn

On every send, you call `pinLatest()` again — the old pin is replaced
automatically. The gutter recalculates for the new turn. The previous
exchange scrolls up out of view without any other work.

## Prev / next navigation

`pinRelative(selector, direction)` walks the matched node list and pins
the neighbor of the current reference turn. Wire it to buttons or
keyboard shortcuts to give users a quick way to step back through the
conversation:

```ts
prevBtn.onclick = () => scroll.pinRelative('[data-role="user"]', -1)
nextBtn.onclick = () => scroll.pinRelative('[data-role="user"]', 1)

window.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey)) return
  if (e.key === 'ArrowUp') scroll.pinRelative('[data-role="user"]', -1)
  if (e.key === 'ArrowDown') scroll.pinRelative('[data-role="user"]', 1)
})
```

The reference point follows the user: while they're anchored at a
pinned turn, navigation is relative to that turn; once they scroll
away (or before anything is pinned at all), it's relative to the user
turn nearest the viewport top — the one they're reading. Clamping at
the ends is built-in: `pinRelative` returns `false` and pins nothing
when there's no target in that direction. See the
[message-navigation recipe](/recipes/message-navigation) for the full
semantics and disabled-button patterns.

Because the selector is queried fresh on every call, navigation
naturally picks up messages added since the last call.

## Bulk loads

When a thread is loaded from history (many messages arrive at once),
you typically want to skip the pin and just show the latest content.
The clean shape depends on where the load happens:

- **Loaded from a parent query / route loader.** Handle it in the
  parent's success callback (`onSuccess`, `useEffect(() => {...},
  [queryData])`, etc.) — call `scroll.scrollToBottom()` once when the
  data lands. The chat component itself doesn't need to know.
- **Loaded inside the chat component.** An effect comparing the
  current `messages.length` to a `useRef`-tracked previous value is
  the canonical pattern; see the [AI chat
  recipe](../recipes/ai-streaming) for the full version.

## Expandable blocks (thinking, tool calls)

Modern AI chats render parts of the response as collapsible blocks —
thinking traces, tool calls, citations. The user can expand or
collapse these mid-stream. `chat-scroll` pin-to-top handles this
correctly without any extra configuration on the consumer side.

The hard case is when the user expands or collapses a block in a
**prior turn** (above the currently pinned message):

- **During streaming** (`overflow-anchor: none` is set), the browser
  does not auto-anchor and may clamp `scrollTop` to the new
  `scrollHeight - clientHeight`. Naive math would let the pinned
  message drift down (on grow) or up off-screen (on shrink).
- **After streaming ends**, `overflow-anchor` is back to `auto` and
  the browser keeps the visible content stable — the controller
  steps aside.

The controller resolves the streaming case by:

1. Storing the pinned element reference (not just its frozen Y
   offset) on the strategy context.
2. Re-reading the element's live offset on every `ResizeObserver`
   callback so `pinnedY` always reflects the current layout.
3. Re-anchoring `scrollTop = pinnedY` after the gutter resize, but
   **only** while the user is still "at the pin" — tracked via a
   `pinAnchored` flag that's set by `pinMessage()` and cleared by
   real user input (`wheel`, `touchmove`, scroll-driving keys) on
   the container.

The `pinAnchored` flag is cleared by:

- **Scroll-driving user input** — `wheel` (with `deltaY ≠ 0`),
  `touchmove`, and the scroll-driving key set
  (`ArrowUp/Down`, `PageUp/Down`, `Home`, `End`, `Space`). Wheel /
  touch / key events whose `event.target` sits inside a descendant
  scrollable that can absorb the delta (e.g. a horizontally-pannable
  code block, a vertical inner panel) are skipped — the inner
  element handles the scroll, the chat doesn't move, the pin stays.
- **`scrollToBottom()`** — programmatic jump to the bottom is the
  consumer's explicit "move away from the pin" intent.
- **Consumer programmatic scroll** — when the host application
  calls `container.scrollTo()` / `scrollBy()` directly (deep-link to
  top, scroll-to-search-hit, etc.), the controller detects the move
  by watching for a scrollTop transition outside the
  `PIN_AWAY_THRESHOLD` band of `pinnedY` *without* a corresponding
  `scrollHeight` change — which distinguishes consumer scrolls from
  layout-driven browser clamps after a content shrink.

The flag is intentionally NOT cleared by `pointerdown` /
`touchstart` / Tab / Enter / letter keys. Those are interaction
events (a tap on a tool-block summary, a button press inside the
chat) — not scroll intent. If a `pointerdown` interrupts an
in-flight pin smooth-scroll, the controller flags
`pinAnimationInterrupted` so the next content resize animates a
catch-up to `pinnedY` instead of teleporting there in a single
frame.

If you wrap `<details>` or other expandable widgets in collapsible
groups and animate their open/close transitions (e.g. CSS
`grid-template-rows: 0fr → 1fr`), each animation frame fires its
own `ResizeObserver` callback. The re-anchor runs each time, so the
pin stays glued to the top across the entire animation.

The demo pages (vanilla / Solid / Vue) stream thinking and tool
blocks live — their bodies grow chunk-by-chunk over many ticks, so
the pin is exercised against a layout that changes on most frames.
Try opening pin-to-top, clicking Send, then expanding or collapsing
any prior turn's block while the response is mid-stream — the pin
holds. The same UI also exposes a "scroll" select (smooth / instant
/ auto) that calls `scroll.setOptions({ scrollBehavior })` live so
you can compare the two modes without reloading.

## Thread switching

The simplest pattern is to remount the chat component on thread
change. The controller is fresh per mount — no pin, no gutter, no
lingering state to clear:

::: code-group

```tsx [React]
<Chat key={threadId} threadId={threadId} />
```

```vue [Vue]
<Chat :key="threadId" :thread-id="threadId" />
```

```tsx [Solid]
<Show keyed when={threadId()}>
  {(id) => <Chat threadId={id} />}
</Show>
```

:::

If you need to preserve scroll position across visits — so a user
returning to a long thread lands where they left off — keep one
instance and use `savePosition` / `restorePosition` instead. See the
[multi-thread recipe](../recipes/multi-thread).

`scroll.reset()` still exists if you genuinely want to clear state
without remounting (e.g. a "new chat" button inside the same
component): it drops the pin, zeroes the gutter, and recomputes
`atBottom` against the new content.
