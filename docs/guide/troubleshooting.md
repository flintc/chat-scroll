# Troubleshooting

Symptoms → causes, in the order we see them reported. Most of these
trace back to the same fact: the library owns exactly two elements (the
scroll container and the content wrapper) and infers everything else
from geometry.

## Nothing scrolls at all

The container must be the **scroll port**: it needs a bounded height
(`height`, `max-height`, or a flex/grid track that constrains it) so
content can overflow it. The library sets `overflow-y: auto` for you at
`mount()`, but it can't invent a height.

```css
.chat {
  height: 100%;     /* or any bounded height */
  min-height: 0;    /* load-bearing inside flex/grid parents! */
}
```

`min-height: 0` is the classic culprit inside flex columns — without it
the container grows to fit its content and never overflows.

## The pin sits a few pixels off

Two known geometry leaks:

- **Scrollbar appearing/disappearing.** With `overflow-y: auto`, the
  scrollbar's arrival changes `clientHeight` mid-calculation. Set
  `scrollbar-gutter: stable` (or `overflow-y: scroll`) on the
  container. See [Tight pin](/recipes/tight-pin) for the full story.
- **CSS transforms.** The gutter math reads `getBoundingClientRect()`,
  which returns *visual* pixels, while `scrollTop` is in *layout*
  pixels. A `transform: scale(...)` on the container or any ancestor
  makes those disagree. Animate with opacity/translate instead of
  scale, or scope scale animations to elements inside the content.

## Stick-to-bottom stopped following the stream

The auto-snap is gated on `locked && streaming` — both must be true.
The usual miss is the streaming flag: pass the adapter's reactive
`streaming` option or call `setStreaming(true)` when the request
starts. The gate exists so post-stream interactions (expanding a
tool-call block) don't yank the user to the bottom — see
[Stick to bottom](./stick-to-bottom#how-it-works).

Also remember the lock releases when the user scrolls up (by design)
and re-engages via `lock()` on send or `scrollToBottom()` (the FAB).
Manually wheeling back to the bottom does *not* re-lock.

## Arrow keys / PageDown don't move the chat

Keyboard scrolling requires the container to be focusable — give it
`tabindex="0"` (and a visible focus style). The library listens for
scroll-driving keys on the container itself; without focus the events
never reach it.

```html
<div class="chat" tabindex="0" role="log" aria-label="Conversation">
```

## The page behind the chat scrolls when I hit the edge

That's browser scroll chaining, not the library. Contain it:

```css
.chat {
  overscroll-behavior: contain;
}
```

## The pin drops when users interact with content

Check *what kind* of event the interaction produces:

- Taps (`pointerdown`) and non-scroll keys deliberately do **not**
  clear the pin — expanding a thinking block keeps the user anchored.
- Wheel / touchmove / scroll keys *do* clear it — unless the event is
  absorbed by a nested scrollable (a horizontally-pannable code block,
  an inner panel), which the controller detects by walking up from
  `event.target`.
- Your own `container.scrollTo()` / `scrollIntoView()` calls clear it
  too (in either direction away from the pin). If you want to move the
  viewport *and keep* the pin armed, re-pin afterwards with
  `pinMessage()`.

See [`pinAnchored`](/reference/state#pinanchored) for the complete
clear/preserve matrix.

## Restored scroll position is wrong after new messages

`restorePosition()` measures from the **top** of content when the saved
position wasn't at the bottom — the messages the user was reading keep
their offset. If you expected "same distance from the end", that's
`wasAtBottom: true` behavior only. Also make sure the thread's content
is fully rendered *before* restoring (defer with `nextTick` /
`requestAnimationFrame` after async loads); restoring against
half-rendered content clamps to the shorter height.

## Images make the layout jump

Always give images / embeds an intrinsic size (`width`/`height`
attributes or `aspect-ratio`). The controller compensates for content
resizing above the pin, but a page full of zero-height-then-tall images
churns the geometry on every load and makes any scroll logic feel
jittery — that's true with or without this library.

## React: it worked, then died in development

Old versions of the adapter broke under `<StrictMode>` (React 18
simulates an unmount that destroyed the instance without a re-mount
path). Fixed — the mount effect now re-mounts from the stored refs. If
you see this, update `@chat-scroll/react`.

## Multiple chats on one page

Fully supported — every `createChatScroll()` / hook call is an
independent instance, and instances don't share state. Nested chats
(a chat preview rendered inside a message) are fine too: each instance
manages its own gutter and ignores descendants'.
