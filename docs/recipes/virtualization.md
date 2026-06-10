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
    // Opening at the latest message? Tell the virtualizer too, so its
    // init doesn't write offset 0 over the initial bottom position.
    initialOffset: messages.length * 60,
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

(The controller lays the container out as a column flexbox and pins
`flex-shrink: 0` on the content element itself, so the wrapper — whose
absolutely-positioned children give it a min-content height of 0 —
isn't crushed down to the viewport height by default flex shrinking.
No CSS needed on your side.)

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

## Pin-to-top over a window

Pin-to-top works too — it needs two adjustments, because its contract
is anchored to a *specific element*:

1. **The pinned element must stay mounted.** The controller re-reads
   the pinned element's live offset on every resize pass, and the
   gutter math depends on it. Windowing would unmount it the moment
   you scroll away. TanStack already has the primitive for this:
   **`rangeExtractor`** — the same mechanism its sticky rows use —
   forces an index into the rendered range regardless of where the
   viewport is. Force the pinned index; its DOM node persists, so
   element identity, offsets, and the re-anchor all keep working.
2. **Drive pinning by index, not selector.** `pinLatest` /
   `pinRelative` query the DOM, and a windowed DOM only contains the
   rows near the viewport. You have the data, so use it: track the
   pinned index, let the `rangeExtractor` mount it, then hand the
   live row to `pinMessage`. Prev/next navigation is the same idea —
   walk the message array for the adjacent user turn instead of the
   node list.

<VirtualDemo strategy="pin-to-top" caption="Live demo — pin-to-top over the same windowed 5,000-message history. Send: the new turn pins to the top and the reply streams in below (toggle the gutter to watch it absorb the stream). Scroll anywhere mid-stream — the pinned row stays mounted via rangeExtractor, so the pin survives. ‹ Prev / Next › walk user turns from the data, not the DOM." />

```tsx
const [pinnedIndex, setPinnedIndex] = useState<number | null>(null)

const virtualizer = useVirtualizer({
  count: messages.length,
  getScrollElement: () => containerEl.current,
  estimateSize: () => 60,
  overscan: 8,
  // Keep the pinned row mounted wherever the viewport is.
  rangeExtractor: (range) => {
    const def = defaultRangeExtractor(range)
    if (pinnedIndex === null || (pinnedIndex >= def[0] && pinnedIndex <= def.at(-1)))
      return def
    return pinnedIndex < def[0] ? [pinnedIndex, ...def] : [...def, pinnedIndex]
  },
})

function pinIndex(i: number) {
  setPinnedIndex(i) // mounts the row via rangeExtractor
  requestAnimationFrame(() => {
    const el = containerEl.current?.querySelector<HTMLElement>(
      `[data-index="${i}"]`,
    )
    if (el) scroll.pinMessage(el)
  })
}

function handleSend(text: string) {
  sendMessage(text)
  pinIndex(messages.length) // the about-to-append user turn
}
```

Why the rest needs no changes: the gutter is container-level geometry
(it sits below the total-size wrapper and only reads rects), and the
pin's smooth scroll re-reads its target every frame — so when rows
mount and re-measure mid-animation and the estimated offsets shift
under it, the animation lands at the live position. While you're
anchored at the pin during a stream, the rows far above aren't even
mounted, so "content above the pin resizing" mostly stops being a
thing.

One residual honesty note: row offsets above the pin are *estimates*
until those rows have been scrolled past once, so the pinned turn's
absolute offset can shift as estimates refine. The controller
re-reads live offsets on every resize pass and re-anchors while
you're at the pin, so this self-corrects — you may just see the
scrollbar thumb adjust as you cross unmeasured territory, which is
inherent to estimated virtualization, not to the pin.

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
