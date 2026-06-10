# Prev / next message navigation

`cmd+↑` / `cmd+↓` to step back and forward through user turns. Useful
for long threads where scrolling between exchanges is tedious. Works
with `pin-to-top` only.

<LiveDemo scenario="pin-to-top" caption="Live demo — ‹ Prev / Next › drive pinRelative(): each click smooth-scrolls the adjacent user turn to the top. Scroll away mid-reply and ‹ first snaps back to the turn you're reading. The buttons disable at the ends." />

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
pins the neighbor of the current reference turn. Internally it's
`pinMessage()` applied to the right element, so all the same machinery
runs: smooth scroll, gutter recalculation, pin-anchored state. It
returns `true` when it pinned something and `false` at the edges.

The selector controls what counts as "a message" for navigation. Most
apps want user turns only, so `[data-role="user"]` is the typical
choice — assistant turns are scrolled past on the way to the next user
turn, which matches how people skim a transcript.

## The reference point

"Previous" and "next" are only meaningful relative to *somewhere*, and
the right somewhere depends on what the user has done:

- **While anchored at a pinned turn**, navigation is relative to that
  turn — and because each call resolves synchronously against the
  rendered DOM, rapid presses accumulate (two quick `-1`s move two
  turns).
- **After the user scrolls away**, the pin no longer describes what
  they're looking at, so navigation switches to the match nearest the
  viewport top — the turn whose reply they're reading. From the middle
  of a long reply, `-1` first snaps back to that turn, then walks
  upward on the next press; `+1` goes to the next turn below. (Editors
  use the same convention for go-to-previous-change.)

The viewport-relative mode also means `pinRelative` works with **no
pin at all** — no `pinLatest()` seeding step is needed before prev/next
take over. A fresh mount at the bottom of a thread navigates from the
turn being read.

## Buttons instead of (or alongside) shortcuts

Visual prev/next controls wire to the same call. For disabled states,
mirror the reference rule with `getPinnedElement()` — or skip disabled
handling entirely and rely on the built-in no-op at the ends. Add
`aria-label`s so screen readers announce the affordance:

```tsx
const turns = [...(container?.querySelectorAll('[data-role="user"]') ?? [])]
const idx = turns.indexOf(scroll.getPinnedElement())

<button
  onClick={() => scroll.pinRelative('[data-role="user"]', -1)}
  disabled={idx === 0}
  aria-label="Previous user message"
>
  ↑
</button>
<button
  onClick={() => scroll.pinRelative('[data-role="user"]', 1)}
  disabled={idx === turns.length - 1}
  aria-label="Next user message"
>
  ↓
</button>
```

(When `idx === -1` — nothing pinned, or the user scrolled away — leave
both enabled and let the viewport-relative resolution decide; the demo
at the top of this page computes the full geometric mirror if you want
exact disabled states in that mode too.)

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
