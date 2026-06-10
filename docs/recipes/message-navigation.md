# Prev / next message navigation

`cmd+↑` / `cmd+↓` to step back and forward through user turns. Useful
for long threads where scrolling between exchanges is tedious. With
`pin-to-top`, `pinRelative()` does it in one call; with
`stick-to-bottom`, the same buttons are a few lines of plain scrolling
— [both below](#stick-to-bottom-same-buttons-no-pin).

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

## Stick-to-bottom: same buttons, no pin

`pinRelative` itself is pin-to-top-only, because it doesn't just
scroll — it **pins**: the gutter manufactures enough scroll room that
*any* turn (including the last) can sit at the viewport top, and the
controller holds it there while content above or below resizes. A
gutter is incompatible with stick-to-bottom by definition — it would
put empty space below the newest message, and "the bottom" would stop
meaning the bottom.

But the navigation UX doesn't need the pin. Under stick-to-bottom,
prev/next is plain container scrolling with the same reference rule:

<LiveDemo scenario="stick-to-bottom" caption="Live demo — the same ‹ Prev / Next › buttons under stick-to-bottom. Each click releases the follow and scrolls the adjacent user turn to the top — try ‹ Prev mid-stream: the reply keeps growing below while you read. At the bottom you're on the latest turn, so Next › disables; the ↓ button re-engages the follow." />

```ts
const MARGIN = 12 // match your scrollMargin

function navTurn(direction: -1 | 1): boolean {
  const turns = [
    ...container.querySelectorAll<HTMLElement>('[data-role="user"]'),
  ]
  const cTop = container.getBoundingClientRect().top
  const st = container.scrollTop
  const tops = turns.map(
    (t) => t.getBoundingClientRect().top - cTop + st - MARGIN,
  )

  // Same reference rule as pinRelative: the turn nearest the viewport
  // top is the one being read; from mid-reply, -1 first snaps back to
  // it, then walks upward.
  let cur = -1
  tops.forEach((t, i) => {
    if (t <= st + 2) cur = i
  })
  const midReply = cur >= 0 && st > tops[cur] + 2

  const target = direction === 1 ? cur + 1 : midReply ? cur : cur - 1
  if (target < 0 || target >= turns.length) return false

  scroll.unlock() // navigating away is explicit intent — release first
  container.scrollTo({ top: tops[target], behavior: 'smooth' })
  return true
}
```

Three things differ from the pinned version, all of them consequences
of having no gutter:

- **Release the lock yourself.** During a stream the controller
  re-snaps to the bottom on every chunk, and a snap write cancels an
  in-flight smooth scroll. `unlock()` before `scrollTo` makes the
  navigation win deterministically. (Input-driven release only covers
  *user* input — wheel, touch, keys — not programmatic scrolls.)
- **The latest turn clamps at the real bottom.** Without synthetic
  scroll room, a turn near the end may not reach the viewport top —
  the scroll stops at `scrollHeight - clientHeight`. Treat "at the
  bottom" as being on the latest turn: disable Next there, and let the
  ↓ affordance (or a send) re-engage the follow. Landing at the bottom
  via Next intentionally does **not** re-lock — reading the latest
  text and following future text are different intents.
- **Rapid clicks need a memo.** `pinRelative` records intent
  synchronously, so two quick `-1`s move two turns. Native smooth
  `scrollTo` doesn't — a second click mid-animation would re-resolve
  against the in-flight position. Remember the pending target index
  and resolve from it until the scroll arrives (`scrollend`) or real
  user input supersedes it; the demo above does exactly this (see
  `ChatPane.vue` in the docs source).

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
