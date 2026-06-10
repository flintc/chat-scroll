# Prev / next message navigation

`cmd+↑` / `cmd+↓` to step through user turns. With `pin-to-top`,
`pinRelative()` does it in one call; with `stick-to-bottom`, the same
buttons are [a few lines of plain scrolling](#stick-to-bottom-same-buttons-no-pin).

<LiveDemo scenario="pin-to-top" caption="‹ Prev / Next › drive pinRelative(): each click smooth-scrolls the adjacent turn to the top. Scroll away mid-reply and ‹ first snaps back to the turn you're reading." />

```tsx
import { useEffect } from 'react'
import { useChatScroll } from '@chat-scroll/react'

export function ChatWithNavigation({ messages }: { messages: Message[] }) {
  const scroll = useChatScroll({ strategy: 'pin-to-top' })

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey)) return
      // Never steal modifier+arrow from an editable: on macOS,
      // Cmd+↑/↓ in a text field is caret-to-start/end — including in
      // your own composer.
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, select, [contenteditable]')) return
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

`pinRelative(selector, ±1)` pins the neighbor of the turn the user is
at — same machinery as `pinMessage`: smooth scroll, gutter, anchored
state. It returns `false` at the edges. The selector decides what
counts as a turn; `[data-role="user"]` is the typical choice.

## The reference point

Navigation is relative to where the user actually is:

- **Anchored at a pinned turn** — relative to that turn. Calls resolve
  synchronously, so rapid presses accumulate: two quick `-1`s move two
  turns.
- **Scrolled away** — relative to the match nearest the viewport top,
  the turn whose reply they're reading. From mid-reply, `-1` first
  snaps back to that turn, then walks upward (the editor
  go-to-previous-change convention); `+1` goes to the next turn below.

This also means `pinRelative` works with no pin at all — a fresh mount
navigates from the turn being read.

## Buttons

For disabled states and a "turn x/y" counter, ask the library instead
of re-deriving the rule: `relativeMessage(selector, dir)` returns the
element a navigation _would_ go to (`null` at the edges), and
`referenceMessage(selector)` returns the turn the user is at:

```tsx
const ref = scroll.referenceMessage('[data-role="user"]')
const canPrev = scroll.relativeMessage('[data-role="user"]', -1) !== null

<button
  onClick={() => scroll.pinRelative('[data-role="user"]', -1)}
  disabled={!canPrev}
  aria-label="Previous user message"
>
  ↑
</button>
<span>{ref.index >= 0 ? `${ref.index + 1}/${ref.count}` : ''}</span>
<button
  onClick={() => scroll.pinRelative('[data-role="user"]', 1)}
  disabled={ref.index + 1 >= ref.count}
  aria-label="Next user message"
>
  ↓
</button>
```

Re-evaluate on the container's scroll event so the states track the
user's reading position.

## Stick-to-bottom: same buttons, no pin

`pinRelative` is pin-to-top-only because it doesn't just scroll — it
pins, and the pin's guarantee needs the gutter, which contradicts a
real bottom. The navigation UX itself is two calls:

<LiveDemo scenario="stick-to-bottom" caption="The same buttons under stick-to-bottom, via relativeMessage + scrollToMessage. Each click releases the follow and scrolls the adjacent turn to the top. At the bottom you're on the latest turn, so Next › disables." />

```ts
function navTurn(direction: -1 | 1): boolean {
  const target = scroll.relativeMessage('[data-role="user"]', direction)
  if (!target) return false
  scroll.scrollToMessage(target)
  return true
}
```

`scrollToMessage` releases the lock first (so a mid-stream snap can't
cancel the animation) and resolves rapid clicks against the in-flight
target — two quick `-1`s move two turns, same as `pinRelative`.

Two stick-specific conventions, both consequences of having no gutter:

- **The latest turn clamps at the real bottom.** A turn near the end
  may not reach the viewport top. Treat being at the bottom
  (`state.atBottom`) as being on the latest turn: disable Next there.
- **Landing at the bottom via Next does not re-lock** — use
  `scrollToBottom()` (or a send) to resume following.

## Keyboard & screen readers

Shortcuts are an accelerator, not the accessible path — the buttons
are. Keep them focusable with `aria-label`s, and know three things:

- **Every modifier+arrow combo collides with something.** `Cmd+↑/↓` is
  page-top/bottom on macOS and caret movement in text fields (hence
  the editable guard above); `Ctrl+↑/↓` is NVDA paragraph navigation,
  so screen-reader users typically never reach your handler.
- **Make the chat container focusable** — `tabindex="0"`, a
  `:focus-visible` style, and `role="log"` with an `aria-label` for a
  live transcript. Safari doesn't focus scrollable regions on its own.
  Once focusable, ArrowUp releases the follow for keyboard users
  exactly like wheel-up does for mouse users.
- **In-chat interactions are keyboard/mouse symmetric.** Space on a
  focused `<summary>`/button/link, and scroll keys inside an editable,
  count as interaction — they don't drop the pin or release the lock.

## Beyond user messages

Any selector works — every message, or only flagged ones:

```ts
scroll.pinRelative('[data-test="msg"]', 1)
scroll.pinRelative('.msg--bookmarked', 1)
```

The matched set is queried fresh on every call, so additions and
removals are picked up automatically.
