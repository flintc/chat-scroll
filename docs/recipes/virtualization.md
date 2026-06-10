# Virtualized lists (TanStack Virtual)

A chat with years of history can't render every message — at tens of
thousands of rows the DOM itself becomes the bottleneck. Windowing
libraries like [TanStack Virtual](https://tanstack.com/virtual) mount
only the rows near the viewport. The good news: `chat-scroll` composes
with them without any special mode, because the two own different
things — **the virtualizer decides which rows exist; `chat-scroll`
decides where the viewport sits.**

<VirtualDemo caption="Live demo — stick-to-bottom over a 5,000-message history windowed by @tanstack/vue-virtual. Only the rows near the viewport are in the DOM (see the counter). Send a message and the follow tracks the stream; wheel up mid-stream and the lock releases instantly; Jump to #1 crosses the whole list while a couple dozen rows ever exist." />

## The wiring

Three bindings, all of them things you already have:

1. **One scroll element.** The virtualizer's `getScrollElement` and
   `chat-scroll`'s `containerRef` point at the same node.
2. **The total-size wrapper is the content element.** TanStack sizes a
   relative wrapper to `getTotalSize()` and absolutely positions rows
   inside it. Hand that wrapper to `contentRef`: every estimate
   refinement, row re-measure, and streaming grow changes the
   wrapper's height, which is exactly what the controller's
   `ResizeObserver` watches.
3. **Rows get `measureElement`.** Dynamic row heights (and a streaming
   reply growing chunk by chunk) flow through TanStack's measurement
   into the wrapper height — no extra plumbing toward `chat-scroll`.

```tsx
import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useChatScroll } from '@chat-scroll/react'

export function VirtualChat({ messages, isStreaming }: Props) {
  const scroll = useChatScroll({
    strategy: 'stick-to-bottom',
    streaming: isStreaming,
  })
  const containerEl = useRef<HTMLDivElement | null>(null)

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => containerEl.current,
    estimateSize: () => 60,
    overscan: 8,
  })

  return (
    <div
      className="chat"
      ref={(el) => {
        containerEl.current = el
        scroll.containerRef(el) // 1. same scroll element
      }}
    >
      <div
        ref={scroll.contentRef} // 2. total-size wrapper = content
        style={{
          height: virtualizer.getTotalSize(),
          position: 'relative',
          flexShrink: 0, // see note below
        }}
      >
        {virtualizer.getVirtualItems().map((row) => (
          <div
            key={row.key}
            data-index={row.index}
            ref={virtualizer.measureElement} // 3. dynamic heights
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${row.start}px)`,
            }}
          >
            <Bubble msg={messages[row.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

::: warning The one CSS line that matters: `flex-shrink: 0`
The controller lays the container out as a column flexbox (that's how
the pin gutter sits below content). A normal message list survives
that as a flex item because its `min-height: auto` floor is its own
text. The virtualizer's wrapper doesn't — its children are absolutely
positioned, so its min-content height is **0**, and the default
`flex-shrink: 1` silently crushes the 300,000px total size down to
the viewport height. One symptom: the list "ends" after a screenful
and the rendered window never moves. `flex-shrink: 0` on the wrapper
restores the real scroll range.
:::

Send stays the usual shape — append, `lock()`, stream:

```ts
function handleSend(text: string) {
  sendMessage(text)
  scroll.lock()
}
```

## Why nothing else is needed

The controller never enumerates messages. It reads container-level
scroll metrics (`scrollTop`, `scrollHeight`, `clientHeight`), watches
the content element's box size, and listens for user input on the
container — all of which are real DOM regardless of how many rows are
mounted. In particular:

- **The follow** snaps `scrollTop` to `scrollHeight` while locked and
  streaming. The streaming row re-measures → total size grows →
  resize callback → snap. Identical to the unvirtualized path.
- **Input-driven lock release** lives on the container's `wheel` /
  `touch` / key listeners, so scrolling up mid-stream releases
  instantly even while rows mount and unmount under the pointer.
- **`scrollToBottom()`** re-reads its target every animation frame,
  so it lands at the live bottom even while the virtualizer is still
  refining size estimates mid-flight.
- **Estimate jitter while reading history** (total size correcting as
  unmeasured rows scroll in) is the virtualizer's own compensation
  job; an unlocked stick controller deliberately leaves the viewport
  alone, so the two don't fight.

## Caveat: pin-to-top doesn't window

Use **stick-to-bottom** for virtualized transcripts. Pin-to-top's
contract is anchored to a *specific element* — the pinned turn must
stay mounted for the gutter math and the re-anchor pass, and
selector-driven APIs (`pinLatest`, `pinRelative`) only see rendered
rows. Windowing unmounts exactly those elements.

If you need pinning **and** a huge history, split the list: virtualize
the settled history above, render the live exchange (pinned turn +
streaming reply) as ordinary DOM below it. The pinned element then
always exists, and the history above the pin can mount and unmount
freely — content-above-the-pin changes are already re-anchored on
every resize pass.

## Jumping far away

Use the virtualizer's own `scrollToIndex` for long jumps (it knows the
estimated offsets); call `scroll.unlock()` first if a stream might be
running, for the same reason as the
[prev/next stick navigation](/recipes/message-navigation#stick-to-bottom-same-buttons-no-pin):
programmatic scrolls don't get the input-driven release, and a
mid-stream snap would otherwise cancel the jump.

```ts
scroll.unlock()
virtualizer.scrollToIndex(0, { align: 'start' })
```

The demo at the top of this page is built exactly this way with
`@tanstack/vue-virtual` — its source is
[`VirtualDemo.vue`](https://github.com/flintc/chat-scroll/blob/main/docs/.vitepress/theme/demo/VirtualDemo.vue)
in the docs theme.
