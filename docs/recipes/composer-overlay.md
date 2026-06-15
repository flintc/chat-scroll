# Overlay composer (fixed / absolute)

Most chats put the composer **in flow**, below the scroll container —
it shrinks the viewport, and `chat-scroll` measures what's left. But
plenty of designs lift the composer **out of flow** instead: a
`position: absolute` bar floating over the bottom of the messages, or a
`position: fixed` input pinned above the mobile keyboard. Now the
composer overlaps the viewport rather than shortening it, and the
controller still measures the full height — so the newest messages
render *behind* the composer with no way to scroll them clear.

The fix is one line of CSS plus a height measurement. This recipe
covers the layout, why it satisfies both strategies, and the
dynamic-height plumbing.

## The problem, precisely

`chat-scroll` makes the container the scroll port and measures its
`clientHeight`. An overlay composer is **not** part of that
measurement — it sits on top. So:

- **stick-to-bottom** snaps the last message to the bottom of the
  viewport… which is the bottom edge that the composer covers. The
  latest line is hidden.
- **pin-to-top** sizes the gutter so the pinned message can reach the
  top. The top is fine — but as a long response streams past the
  bottom, its newest text scrolls into the band the composer occupies.

Both reduce to the same thing: the bottom *N* pixels of the viewport
are obscured, and nothing reserves them.

## Reserve the band

Give the scroll container a `padding-bottom` equal to the composer's
height. That's it. The gutter math already subtracts container padding
(it's part of the [tight-pin contract](./tight-pin)), so the pin still
lands exactly at the top; and the padding gives the last message
somewhere to scroll so it clears the composer.

```
┌─ chat-shell (position: relative) ─┐
│ ┌─ chat-scroll (the scroll port) ─┐ │
│ │  …messages…                     │ │
│ │  last message                   │ │  ← can now scroll to here
│ │ · · · · · · · · · · · · · · · · │ │  ← padding-bottom (reserved)
│ ├─────────────────────────────────┤ │
│ │  composer  (absolute, bottom:0) │ │  ← overlays the reserved band
│ └─────────────────────────────────┘ │
└──────────────────────────────────────┘
```

The composer is a **sibling** of the scroll container, both children
of a `position: relative` shell — not a child of the scroller (a child
would scroll away with the content). The shell is the composer's
containing block.

## React

```tsx
import { useLayoutEffect, useRef, useState } from 'react'
import { useChatScroll } from '@chat-scroll/react'

export function ChatView({ messages, loading, onSend }: Props) {
  const scroll = useChatScroll({
    strategy: 'pin-to-top', // identical wiring for 'stick-to-bottom'
    streaming: loading,
  })

  // Measure the composer's live height and publish it as a CSS variable.
  // A textarea that wraps to a second line, an attachment row appearing,
  // a safe-area inset — all of it flows through here.
  const composerRef = useRef<HTMLDivElement>(null)
  const [composerH, setComposerH] = useState(0)
  useLayoutEffect(() => {
    const el = composerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) =>
      setComposerH(entry.borderBoxSize?.[0]?.blockSize ?? el.offsetHeight),
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function handleSend(text: string) {
    onSend(text)
    scroll.pinLatest('[data-role="user"]')
  }

  return (
    <div
      className="chat-shell"
      style={{ '--composer-h': `${composerH}px` } as React.CSSProperties}
    >
      <div className="chat-scroll" ref={scroll.containerRef}>
        <div className="chat-messages" ref={scroll.contentRef}>
          {messages.map((m) => (
            <Bubble key={m.id} msg={m} />
          ))}
        </div>
      </div>

      {!scroll.state.atBottom && (
        <button className="scroll-fab" onClick={scroll.scrollToBottom}>
          ↓
        </button>
      )}

      <div className="composer" ref={composerRef}>
        <Composer onSend={handleSend} disabled={loading} />
      </div>
    </div>
  )
}
```

## CSS

```css
.chat-shell {
  position: relative; /* containing block for the absolute composer + FAB */
  display: flex;
  flex-direction: column;
  height: 100%; /* or whatever bounds the chat column */
  min-height: 0;
}

.chat-scroll {
  flex: 1;
  min-height: 0;
  /* Reserve the band the composer overlays. chat-scroll's gutter math
     subtracts this, so the pin still lands exactly at the top, and the
     last message can scroll clear of the composer. */
  padding-bottom: var(--composer-h, 0px);
  /* Exact pin even when the scrollbar toggles — see the tight-pin recipe. */
  scrollbar-gutter: stable;
}

.composer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
}

/* Float the scroll-to-bottom button ABOVE the composer, not behind it. */
.scroll-fab {
  position: absolute;
  right: 1rem;
  bottom: calc(var(--composer-h, 0px) + 1rem);
}
```

## Why it works under both strategies

The reserved band is below the content in scroll space, so the math
falls out of the existing contracts:

- **pin-to-top.** The gutter formula is
  `pinnedY + clientHeight − gutterTop − paddingBottom`. The extra
  `padding-bottom` is subtracted right back out, so
  `scrollHeight − clientHeight === pinnedY` still holds — the pin is
  exactly as tight as before. What changes is that there's now always
  at least the composer's height of scrollable room below the last
  message, so a long streamed response can be scrolled until its tail
  sits just above the composer.
- **stick-to-bottom.** Snapping to the absolute bottom
  (`scrollTop = scrollHeight`) now lands the empty reserved band at the
  bottom of the viewport — i.e. behind the composer — and the last real
  message one band-height up, fully visible above it.

## Dynamic height is automatic

When the composer grows — the textarea wraps, an attachment chip
appears — the `ResizeObserver` updates `--composer-h`, which changes
the container's `padding-bottom`. **You don't need to tell
`chat-scroll`.** It watches the container's content box, so a change to
the container's own padding triggers a gutter recalc (pin-to-top) or a
re-snap (stick-to-bottom) on the same frame. The pin stays tight and
the bottom stays glued while the composer resizes underneath.

::: tip Equivalent: pad the content instead
Putting the `padding-bottom` on the **content** element (`contentRef`)
works identically — it folds into the same math — and some teams prefer
it because the reserved space reads as "after the last message" rather
than "viewport chrome." Pick whichever matches your mental model;
`chat-scroll` reacts to both.
:::

## `position: fixed` variant (mobile, above the keyboard)

For a full-bleed mobile chat you usually want the composer fixed to the
visual viewport so it rides above the on-screen keyboard:

```css
.composer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  /* Don't tuck under the home indicator / gesture bar. */
  padding-bottom: env(safe-area-inset-bottom);
}
```

The reservation is unchanged — the container still gets
`padding-bottom: var(--composer-h)`, and `--composer-h` is measured
from the composer's full height (the safe-area padding included,
because it's part of the element's border box). Two things to keep in
mind, both orthogonal to `chat-scroll`:

- **Width.** A fixed element is positioned against the viewport, not
  the shell — if your chat isn't full-bleed (a centered column, a
  desktop sidebar layout), constrain the composer's `left`/`right` to
  match, or keep `position: absolute` with the shell as its containing
  block. Absolute is the better default whenever the chat lives inside
  an app layout.
- **The keyboard.** Use `<meta name="viewport"
  content="… interactive-widget=resizes-content">` (and/or the
  `visualViewport` API) so the browser resizes the layout when the
  keyboard opens. That resizes the shell, which resizes the scroll
  port — and `chat-scroll`'s observers handle the rest.

## Gotchas

- **Don't nest the composer inside the scroll container.** It would
  become part of the scrollable content and scroll away. Keep it an
  overlay sibling under the positioned shell. (Some other recipes show
  `<Composer>` inside `.chat` for brevity — that assumes an in-flow
  composer; an overlay one belongs outside the scroller.)
- **Mind the FAB.** Offset the scroll-to-bottom button by the composer
  height (`bottom: calc(var(--composer-h) + …)`) so it doesn't hide
  behind it. `state.atBottom` already accounts for the reserved band:
  it measures the end of the *content*, so the button hides exactly
  when the last message has cleared the composer.
- **Stabilize the scrollbar** with `scrollbar-gutter: stable` (or
  `overflow-y: scroll`) for a sub-pixel-exact pin — see
  [Tight pin](./tight-pin).

## See also

- [Pin-to-top guide](../guide/pin-to-top)
- [Tight pin (sub-pixel)](./tight-pin) — the gutter contract this builds on
- [Scroll-to-bottom button](./scroll-fab) — the FAB referenced above
