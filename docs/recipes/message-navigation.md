# Prev / next message navigation

`cmd+↑` / `cmd+↓` to step back and forward through user turns. Useful
for long threads where scrolling between exchanges is tedious. Works
with `pin-to-top` only.

<LiveDemo scenario="pin-to-top" caption="Live demo — ‹ Prev turn / Next turn › drive pinRelative(): each click pins the adjacent user turn to the top. The first click pins the latest turn as the starting point." />

```tsx
import { useEffect } from 'react'
import { useChatScroll } from '@chat-scroll/react'

export function ChatWithNavigation({ messages }: { messages: Message[] }) {
  const scroll = useChatScroll({ strategy: 'pin-to-top' })

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        scroll.pinRelative('[data-role="user"]', -1)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        scroll.pinRelative('[data-role="user"]', 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [scroll])

  return (
    <div className="chat" ref={scroll.containerRef}>
      <div className="messages" ref={scroll.contentRef}>
        {messages.map((m) => (
          <Bubble key={m.id} msg={m} data-role={m.role} />
        ))}
      </div>
    </div>
  )
}
```

## How it works

`pinRelative(selector, ±1)` walks the elements matching `selector` and
pins the neighbor of the currently pinned element. Internally it's
`pinMessage()` applied to the right element, so all the same machinery
runs: smooth scroll, gutter recalculation, pin-anchored state.

The selector controls what counts as "a message" for navigation. Most
apps want user turns only, so `[data-role="user"]` is the typical
choice — assistant turns are scrolled past on the way to the next user
turn, which matches how people skim a transcript.

## No starting position

`pinRelative` no-ops when no message is currently pinned. After a fresh
mount, you need to seed the position with `pinLatest()` or
`pinMessage()` before prev/next can take over:

```ts
// On first send / on thread open, seed the latest turn.
scroll.pinLatest('[data-role="user"]')
// Now prev/next work.
scroll.pinRelative('[data-role="user"]', -1)
```

If you'd rather have a key press auto-seed when nothing is pinned,
fall back to `pinLatest`:

```ts
function step(direction: -1 | 1): void {
  if (scroll.state.pinActive) {
    scroll.pinRelative('[data-role="user"]', direction)
  } else {
    scroll.pinLatest('[data-role="user"]')
  }
}
```

## Buttons instead of (or alongside) shortcuts

Visual prev/next controls wire to the same call. The built-in no-op at
the ends is usually all the disabled-state you need — clicking past
the first/last just does nothing. Add `aria-label`s so screen readers
announce the affordance:

```tsx
<button
  onClick={() => scroll.pinRelative('[data-role="user"]', -1)}
  aria-label="Previous user message"
>
  ↑
</button>
<button
  onClick={() => scroll.pinRelative('[data-role="user"]', 1)}
  aria-label="Next user message"
>
  ↓
</button>
```

## Beyond user messages

Any selector works. To navigate every message:

```ts
scroll.pinRelative('[data-test="msg"]', 1)
```

To navigate only flagged turns:

```ts
scroll.pinRelative('.msg--bookmarked', 1)
```

The matched set is queried fresh on every call, so additions and
removals between calls are picked up automatically.
