# Infinite history (TanStack Query)

Real chats don't load the whole transcript. Fetch the newest page,
open at the bottom, and page older history in as the reader scrolls
up. [TanStack Query's](https://tanstack.com/query)
bidirectional `useInfiniteQuery` handles the fetching and caching;
this recipe adds the scroll wiring — including the one genuinely
tricky step, keeping the viewport still while older messages prepend.

<InfiniteDemo caption="Scroll to the top to pull older pages from a simulated server (600ms latency). The messages under your eyes never move when a page lands above them. Send a message to see the bottom side keep working at the same time." />

## The shape

A cursor-paged endpoint, newest page first:

```ts
// GET /threads/:id/messages?before=<cursor> — newest page when no cursor.
// Each page's messages are in chronological order.
async function fetchMessages(
  threadId: string,
  before: string | null,
): Promise<{ messages: Message[]; prevCursor: string | null }> {
  /* ... */
}
```

## The wiring

```tsx
import { useLayoutEffect, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useChatScroll } from '@chat-scroll/react'

export function ChatHistory({ threadId }: { threadId: string }) {
  const query = useInfiniteQuery({
    queryKey: ['messages', threadId],
    queryFn: ({ pageParam }) => fetchMessages(threadId, pageParam),
    initialPageParam: null as string | null, // newest page
    getPreviousPageParam: (first) => first.prevCursor, // older history
    getNextPageParam: () => null, // new messages arrive over the socket
  })
  // fetchPreviousPage prepends to data.pages, so this stays chronological.
  const messages = query.data?.pages.flatMap((p) => p.messages) ?? []

  const scroll = useChatScroll({
    strategy: 'stick-to-bottom',
    initialPosition: 'bottom', // open at the latest message
  })

  // The adapter keeps the container element private — hold your own
  // ref alongside its callback ref for the scroll math below.
  const containerEl = useRef<HTMLDivElement | null>(null)
  function setContainer(el: HTMLDivElement | null) {
    containerEl.current = el
    scroll.containerRef(el)
  }

  // 1. Fetch older pages as the reader approaches the top.
  function onScroll() {
    const el = containerEl.current
    if (!el) return
    if (
      el.scrollTop < 100 &&
      query.hasPreviousPage &&
      !query.isFetchingPreviousPage
    ) {
      void query.fetchPreviousPage()
    }
  }

  // 2. Hold the viewport through a prepend. The new page grows the
  // content *above* the reader, but the browser keeps the numeric
  // scrollTop — without this, the reader visually jumps into the new
  // page. Runs on every commit so the height snapshot is always the
  // pre-prepend one; the shift happens before paint.
  const prevFirstId = useRef<string | undefined>(undefined)
  const prevHeight = useRef(0)
  useLayoutEffect(() => {
    const el = containerEl.current
    if (!el) return
    const firstId = messages[0]?.id
    if (firstId !== prevFirstId.current && prevHeight.current > 0) {
      el.scrollTop += el.scrollHeight - prevHeight.current
    }
    prevFirstId.current = firstId
    prevHeight.current = el.scrollHeight
  })

  return (
    <div className="chat" ref={setContainer} onScroll={onScroll}>
      <div ref={scroll.contentRef}>
        {/* Keep this header a constant height: swapping its text then
            never shifts the transcript. */}
        <div className="history-head">
          {query.isFetchingPreviousPage
            ? 'Loading earlier messages…'
            : query.hasPreviousPage
              ? 'Scroll up to load earlier messages'
              : 'Beginning of conversation'}
        </div>
        {messages.map((m) => (
          <div key={m.id} data-role={m.role}>
            {m.text}
          </div>
        ))}
      </div>
    </div>
  )
}
```

## How it behaves

- **Open.** `initialPosition: 'bottom'` lands at the latest message
  and keeps re-landing there through image loads and font swaps until
  the first interaction.
- **Reader scrolls up.** The stick lock releases on the input itself;
  near the top, `fetchPreviousPage` fires.
- **Page lands.** The layout effect shifts `scrollTop` by exactly the
  prepended height, before paint — the messages under the reader's
  eyes don't move.
- **Meanwhile, at the bottom.** Appends are untouched by any of this:
  the lock follows new messages when the reader is at the bottom, and
  leaves them alone when they're up in history.

## Why not let the browser handle it?

CSS scroll anchoring (`overflow-anchor`) can mask prepend jumps, but
not reliably here: the controller disables it during streaming (it
owns the viewport then), and engines disagree about anchoring across
large insertions. The explicit shift is three lines and deterministic.

## Notes

- **Pin-to-top absorbs prepends for free — while pinned.** The
  controller re-reads the pinned element's offset on every resize and
  re-anchors `scrollTop`, so under `pin-to-top` a prepend above the
  pin never moves the viewport. The manual compensation is for the
  *released* state — reading old history with no active pin — which is
  exactly when history fetches happen.
- **Don't double-compensate.** Gate the shift on "the first message
  changed", as above. Keying it on any content growth would also fire
  for appends and streaming chunks.
- **Saved positions don't survive prepends.** `savePosition()` offsets
  are measured from the top of the content, so a prepend invalidates
  them. When combining with
  [multi-thread switching](./multi-thread), restore the position
  first, then resume paging.
- **Sentinel option.** An `IntersectionObserver` on the header (with
  the container as `root`) works instead of the `scrollTop` check —
  same wiring, just make sure the sentinel can't be visible at the
  initial bottom position.
- **Virtualized?** For very large loaded windows, combine with the
  [virtualization recipe](./virtualization) — TanStack Virtual
  measures in index space, so prepends shift offsets there instead of
  `scrollHeight`.
