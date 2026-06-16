# Virtualized lists (TanStack Virtual)

A chat with years of history can't render every message. Windowing
libraries like [TanStack Virtual](https://tanstack.com/virtual) mount
only the rows near the viewport, and `chat-scroll` composes with them
without any special mode — **the virtualizer decides which rows exist;
`chat-scroll` decides where the viewport sits.**

<VirtualDemo caption="stick-to-bottom over a 5,000-message history windowed by @tanstack/vue-virtual. Send a message and the follow tracks the stream; wheel up mid-stream and the lock releases instantly." />

## The wiring

Three bindings:

1. **One scroll element.** The virtualizer's `getScrollElement` and
   `chat-scroll`'s `containerRef` point at the same node.
2. **The total-size wrapper is the content element.** Hand TanStack's
   relative wrapper to `contentRef`: every estimate refinement, row
   re-measure, and streaming grow changes its height, which is exactly
   what the controller's `ResizeObserver` watches.
3. **Rows get `measureElement`** so dynamic heights flow through
   TanStack's measurement into the wrapper height.

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

No CSS needed on your side — the controller pins `flex-shrink: 0` on
the content element, so the wrapper (whose absolutely-positioned
children give it a min-content height of 0) isn't crushed by the
container's flex layout.

Send stays the usual shape:

```ts
function handleSend(text: string) {
  sendMessage(text)
  scroll.lock()
}
```

## Why nothing else is needed

The controller never enumerates messages — it reads container-level
scroll metrics, watches the content element's box size, and listens
for input on the container, all real DOM regardless of how many rows
are mounted. The follow, the input-driven lock release, and
`scrollToBottom()`'s frame-by-frame target all work identically to the
unvirtualized path. Estimate jitter while reading history is the
virtualizer's own compensation job; an unlocked controller leaves the
viewport alone, so the two don't fight.

## Pin-to-top over a window

Pin-to-top needs two adjustments, because its contract is anchored to
a _specific element_:

1. **Keep the pinned row mounted.** The controller re-reads the pinned
   element's offset on every resize pass; windowing would unmount it.
   TanStack's **`rangeExtractor`** — the same primitive its sticky
   rows use — forces an index into the rendered range.
2. **Drive pinning by index, not selector.** `pinLatest` /
   `pinRelative` query the DOM, and a windowed DOM only contains rows
   near the viewport. Track the pinned index, let the `rangeExtractor`
   mount it, then hand the live row to `pinMessage`. Prev/next walks
   the message array instead of the node list.

<VirtualDemo strategy="pin-to-top" caption="pin-to-top over the same windowed history. Scroll anywhere mid-stream — the pinned row stays mounted via rangeExtractor, so the pin survives. ‹ Prev / Next › walk user turns from the data, not the DOM." />

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

Nothing else changes: the gutter is container-level geometry, and the
pin's smooth scroll re-reads its target every frame, so offsets
shifting under it as rows measure don't make it land short.

Row offsets above the pin are estimates until those rows have been
measured once, so the pinned turn's absolute offset can shift as you
cross unmeasured territory. The controller re-anchors on every resize
pass, so this self-corrects — at most the scrollbar thumb adjusts.

## Jumping far away

Use the virtualizer's own `scrollToIndex` / `scrollToOffset` for long
jumps (they know the estimated offsets); call `scroll.unlock()` first
if a stream might be running — programmatic scrolls don't get the
input-driven release, and a mid-stream snap would otherwise cancel the
jump:

```ts
scroll.unlock()
virtualizer.scrollToIndex(0, { align: 'start' })
```

Prev/next under stick-to-bottom is the same idea as the
[message-navigation recipe](./message-navigation#stick-to-bottom-same-buttons-no-pin),
resolved in index space: find the adjacent user turn in the data, then
`unlock()` and scroll to `getOffsetForIndex(target, 'start')` minus
your margin.

The demos on this page are built exactly this way with
`@tanstack/vue-virtual` — source:
[`VirtualDemo.vue`](https://github.com/flintc/chat-scroll/blob/main/docs/.vitepress/theme/demo/VirtualDemo.vue).
