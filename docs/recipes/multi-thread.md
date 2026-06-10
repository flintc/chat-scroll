# Multi-thread switching

Two flavors of "switching threads," depending on what you want.

| If you want…                                       | Use…                              |
| -------------------------------------------------- | --------------------------------- |
| Fresh state per thread (no position memory)        | `key={threadId}` remount          |
| Preserved scroll position when returning to a thread | One persistent instance + `savePosition` / `restorePosition` |

## The simple case: remount per thread

A new `threadId` means a fresh `ChatScrollInstance` and a clean
slate. No `reset()`, no effects to clear pins:

```tsx
<ChatRouter>
  <ChatView key={threadId} threadId={threadId} />
</ChatRouter>
```

Inside `ChatView`, do what the [AI streaming
recipe](./ai-streaming) does — `pinLatest` from the send handler,
`streaming: loading`, done.

This is the right shape for most apps. The only reason to keep one
instance across threads is if you genuinely want to preserve scroll
position when the user returns to a thread they've already read.

## The preserving case: persistent instance + save/restore

Keep one `ChatScrollInstance` alive across thread changes, and shuttle
positions through `savePosition` / `restorePosition`:

```tsx
import { useEffect, useRef } from 'react'
import {
  useChatScroll,
  type ScrollPosition,
} from '@chat-scroll/react'

export function ChatRouter({
  threadId,
  messages,
  loading,
}: {
  threadId: string
  messages: Message[]
  loading: boolean
}) {
  const scroll = useChatScroll({
    strategy: 'pin-to-top',
    streaming: loading,
  })
  const positions = useRef(new Map<string, ScrollPosition>())
  const lastThread = useRef<string | null>(null)

  // On thread change: save the prior thread's position, reset, then restore.
  useEffect(() => {
    if (lastThread.current && lastThread.current !== threadId) {
      positions.current.set(lastThread.current, scroll.savePosition())
    }

    scroll.reset()

    const saved = positions.current.get(threadId)
    if (saved) scroll.restorePosition(saved)

    lastThread.current = threadId
  }, [threadId, scroll])

  return (
    <div ref={scroll.containerRef} className="chat">
      <div ref={scroll.contentRef} className="messages">
        {messages.map((m) => (
          <Bubble key={m.id} msg={m} />
        ))}
      </div>
    </div>
  )
}
```

The `lastThread` ref is what distinguishes "navigated to a new
thread" from "initial mount" — on mount there's nothing to save.

`scroll.reset()` runs between save and restore: it clears any pin
state from the previous thread (so a stale `pinnedY` doesn't bias the
new thread's `atBottom` measurement) without destroying the instance.

`restorePosition` owns the awkward timing itself: it releases the
stick lock first (otherwise the content swap's resize snaps to the
bottom over your restore), applies immediately, and re-applies on the
next frame in case the destination thread hadn't finished laying out.
A `wasAtBottom` snapshot restores to the *new* bottom and re-engages
the follow.

## Persisting across reload

If you want positions to survive page refresh, persist the map to
`sessionStorage`:

```tsx
useEffect(() => {
  return () => {
    sessionStorage.setItem(
      `chat-scroll:${threadId}`,
      JSON.stringify(scroll.savePosition()),
    )
  }
}, [threadId])

useEffect(() => {
  const raw = sessionStorage.getItem(`chat-scroll:${threadId}`)
  if (raw) {
    try {
      scroll.restorePosition(JSON.parse(raw))
    } catch {}
  }
}, [threadId])
```

`localStorage` works the same way if you want positions to live
longer than a session — trim old keys periodically to avoid unbounded
growth.

Pick based on whether scroll position is part of "thread state" in
your app's model — remount when it isn't, save/restore when it is.
