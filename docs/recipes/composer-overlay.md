# Overlay composer (fixed / absolute)

Most chats put the composer **in flow**, below the scroll container —
it shrinks the viewport, and `chat-scroll` measures what's left. But
plenty of designs lift the composer **out of flow** instead: a
`position: absolute` bar floating over the bottom of the messages, or a
`position: fixed` input pinned above the mobile keyboard. Now the
composer overlaps the viewport rather than shortening it, and the
controller would still measure the full height — so the newest messages
render *behind* the composer with no way to scroll them clear.

Tell the controller how tall the obstruction is with **`bottomInset`**
and it reserves exactly that much room below the content — in its own
gutter, without touching your stylesheet.

<ComposerDemo caption="Toggle “Reserve space” off and the last line ducks behind the composer; on, it sits just above it. Grow the composer and the reservation tracks it — under both strategies." />

## Reserve the band with `bottomInset`

Pass the composer's height as `bottomInset`. The controller folds it
into the gutter it already manages, so:

- the pinned message still lands exactly at the top (the tight-pin
  contract is unchanged);
- there's always at least the composer's height of scrollable room
  below the last message, so it can clear the composer;
- `atBottom` flips only once the last message *has* cleared it.

It works the same under both strategies, and the library never writes to
your container's padding — the reservation lives entirely in its gutter.

```tsx
import { useLayoutEffect, useRef, useState } from 'react'
import { useChatScroll } from '@chat-scroll/react'

export function ChatView({ messages, loading, onSend }: Props) {
  // Measure the composer's live height — a textarea wrapping to a second
  // line, an attachment row appearing, a safe-area inset all flow here.
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

  const scroll = useChatScroll({
    strategy: 'pin-to-top', // identical wiring for 'stick-to-bottom'
    streaming: loading,
    bottomInset: composerH, // ← reserve the band the composer overlays
  })

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

`bottomInset` is a plain reactive option, so the adapters forward it for
you — set the state and the controller re-reserves on the same frame.
(Driving it imperatively instead? `scroll.instance.setOptions({
bottomInset })` does the same thing.)

## Layout

The composer is a **sibling** of the scroll container — not a child (a
child would scroll away with the content) — and both live under a
`position: relative` shell that is the composer's containing block. Note
there's **no `padding-bottom` on the scroller**: `bottomInset` handles
the reservation.

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
  /* Exact pin even when the scrollbar toggles — see the tight-pin recipe. */
  scrollbar-gutter: stable;
}

.composer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
}

/* The CSS var is only here so the FAB can float ABOVE the composer. */
.scroll-fab {
  position: absolute;
  right: 1rem;
  bottom: calc(var(--composer-h, 0px) + 1rem);
}
```

```

┌─ chat-shell (position: relative) ─┐
│ ┌─ chat-scroll (the scroll port) ─┐ │
│ │  …messages…                     │ │
│ │  last message                   │ │  ← reachable: clears the composer
│ │ · · · · · · gutter · · · · · · ·│ │  ← bottomInset reserved here
│ ├─────────────────────────────────┤ │
│ │  composer  (absolute, bottom:0) │ │  ← overlays the reserved band
│ └─────────────────────────────────┘ │
└──────────────────────────────────────┘
```

## Why it works under both strategies

`bottomInset` is reserved as controller-owned slack below the content,
so the math falls out of the existing contracts:

- **pin-to-top.** The gutter is sized to `max(pinReserve, bottomInset)`.
  When the response is short the pin reserve dominates and the pin lands
  tight at the top, exactly as before; when it's long enough that the
  reserve would collapse to zero, the `bottomInset` floor keeps a
  composer's height of room so the tail can scroll out from behind the
  bar.
- **stick-to-bottom.** The gutter is otherwise unused, so it becomes a
  pure `bottomInset`-tall spacer. Snapping to the bottom lands that
  empty band behind the composer and the last real message one
  band-height up, fully visible above it.

## Dynamic height is automatic

When the composer grows — the textarea wraps, an attachment chip
appears — the `ResizeObserver` updates `composerH`, the option changes,
and the controller re-reserves (and re-snaps a locked stick viewport) on
the same frame. The pin stays tight and the bottom stays glued while the
composer resizes underneath. You don't poll or re-measure anything else.

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

`bottomInset` is unchanged — it's still the composer's measured height
(safe-area padding included, since that's part of the element's border
box). Two things to keep in mind, both orthogonal to `chat-scroll`:

- **Width.** A fixed element is positioned against the viewport, not the
  shell — if your chat isn't full-bleed (a centered column, a desktop
  sidebar), constrain the composer's `left`/`right` to match, or keep
  `position: absolute` with the shell as its containing block. Absolute
  is the better default inside an app layout.
- **The keyboard.** Use `<meta name="viewport" content="…
  interactive-widget=resizes-content">` (and/or the `visualViewport`
  API) so the browser resizes the layout when the keyboard opens. That
  resizes the shell, which resizes the scroll port — and `chat-scroll`'s
  observers handle the rest.

## Pure-CSS alternative (no `bottomInset`)

Prefer to keep the reservation in your stylesheet — or not using an
adapter option? Put a `padding-bottom` equal to the composer height on
the **scroll container** instead. The gutter math subtracts container
padding (the [tight-pin contract](./tight-pin)), so the pin stays tight,
and the controller observes the container's content box — so the
reservation still re-tightens when the composer grows.

```css
.chat-scroll {
  padding-bottom: var(--composer-h, 0px);
}
```

```tsx
// …no `bottomInset` option; the CSS var (set from `composerH`) does it.
const scroll = useChatScroll({ strategy: 'pin-to-top', streaming: loading })
```

`bottomInset` and the padding approach are equivalent in the math; the
option just keeps the reservation out of your CSS and doesn't depend on
the controller observing a padding mutation. Use whichever fits.

## Gotchas

- **Don't nest the composer inside the scroll container.** It would
  become part of the scrollable content and scroll away. Keep it an
  overlay sibling under the positioned shell.
- **Mind the FAB.** Offset the scroll-to-bottom button by the composer
  height (`bottom: calc(var(--composer-h) + …)`) so it doesn't hide
  behind it. `state.atBottom` already accounts for the reserved band —
  it measures the end of the *content*, so the button hides exactly when
  the last message has cleared the composer.
- **Stabilize the scrollbar** with `scrollbar-gutter: stable` (or
  `overflow-y: scroll`) for a sub-pixel-exact pin — see
  [Tight pin](./tight-pin).

## See also

- [Pin-to-top guide](../guide/pin-to-top)
- [Tight pin (sub-pixel)](./tight-pin) — the gutter contract this builds on
- [Scroll-to-bottom button](./scroll-fab) — the FAB referenced above
- [`bottomInset` option reference](../reference/options#bottominset)
