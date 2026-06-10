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

Visual prev/next controls wire to the same call. For disabled states
and a "turn x/y" counter, ask the library instead of re-deriving the
reference rule: `relativeMessage(selector, dir)` returns the element a
navigation *would* go to (`null` at the edges), and
`referenceMessage(selector)` returns the turn the user is at. Add
`aria-label`s so screen readers announce the affordance:

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

Re-evaluate on scroll (the demos bump a counter from the container's
scroll event) so the states track the user's reading position.

## Stick-to-bottom: same buttons, no pin

`pinRelative` itself is pin-to-top-only, because it doesn't just
scroll — it **pins**: the gutter manufactures enough scroll room that
*any* turn (including the last) can sit at the viewport top, and the
controller holds it there while content above or below resizes. A
gutter is incompatible with stick-to-bottom by definition — it would
put empty space below the newest message, and "the bottom" would stop
meaning the bottom.

But the navigation UX doesn't need the pin. Under stick-to-bottom,
prev/next is two calls — `relativeMessage` resolves the target with
the same reference rule `pinRelative` uses, and `scrollToMessage`
brings it to the top:

<LiveDemo scenario="stick-to-bottom" caption="Live demo — the same ‹ Prev / Next › buttons under stick-to-bottom, via relativeMessage + scrollToMessage. Each click releases the follow and scrolls the adjacent user turn to the top — try ‹ Prev mid-stream: the reply keeps growing below while you read. At the bottom you're on the latest turn, so Next › disables; the ↓ button re-engages the follow." />

```ts
function navTurn(direction: -1 | 1): boolean {
  const target = scroll.relativeMessage('[data-role="user"]', direction)
  if (!target) return false
  scroll.scrollToMessage(target)
  return true
}
```

`scrollToMessage` handles the parts that used to need hand-rolling:
it releases the lock first (programmatic scrolls don't get the
input-driven release, so a mid-stream snap would otherwise cancel the
animation), and rapid clicks resolve against the in-flight target —
two quick `-1`s move two turns, same as `pinRelative`.

Two stick-specific conventions remain yours, both consequences of
having no gutter:

- **The latest turn clamps at the real bottom.** Without synthetic
  scroll room, a turn near the end may not reach the viewport top —
  the scroll stops at `scrollHeight - clientHeight`. Treat "at the
  bottom" as being on the latest turn: disable Next there
  (`state.atBottom`), and let the ↓ affordance (or a send) re-engage
  the follow.
- **Landing at the bottom via Next does not re-lock** — reading the
  latest text and following future text are different intents; use
  `scrollToBottom()` to follow.

For disabled states and a "turn x/y" counter, `referenceMessage`
returns the turn the user is at (`{ el, index, count, past }`) under
either strategy — no geometry to re-derive.

## Keyboard & screen readers

Shortcuts are an **accelerator, not the accessible path** — the
buttons are. Keep them focusable, in the tab order, with `aria-label`s
(as above), and treat the keybindings as a bonus for power users.
Three things to know:

- **Every modifier+arrow combo collides with something.** `Cmd+↑/↓`
  is the browser's page-top/bottom on macOS and caret-to-start/end
  inside text fields (hence the editable guard in the snippet);
  `Ctrl+↑/↓` is NVDA's paragraph navigation in browse mode, so screen
  reader users typically never reach your handler — the buttons are
  their path. Guard editables, don't fight the screen reader, and
  accept that the shortcut is best-effort.
- **Make the chat container focusable** (`tabindex="0"`, a visible
  `:focus-visible` style, and `role="log"` with an `aria-label` for a
  live transcript) so native keyboard scrolling works everywhere —
  Safari doesn't focus scrollable regions on its own. The library's
  input-driven lock/pin release listens on the container, so once
  it's focusable, ArrowUp releases the follow for keyboard users
  exactly like wheel-up does for mouse users.
- **In-chat interactions are keyboard/mouse symmetric.** Space on a
  focused tool-block `<summary>` (or any button/link), and scroll
  keys inside an editable, are treated as interaction — they don't
  drop the pin or release the lock, matching what a mouse click does.

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
