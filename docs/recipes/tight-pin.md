# Tight pin (sub-pixel)

`pin-to-top` enforces the **tight-pin contract**: at maximum scroll,
the pinned message sits exactly at the top of the viewport (offset by
`scrollMargin`). Concretely:

```
container.scrollHeight - container.clientHeight === pinnedY
```

The gutter math is consumer-CSS-agnostic — container padding, content
padding, borders, and margins are all handled automatically (see
[Pin-to-top › How it works](../guide/pin-to-top#how-it-works)). You do
not need to tell `chat-scroll` about your stylesheet.

There is **one** edge case where the bound can drift by a few pixels:
when the scrollbar appears or disappears between the moment the gutter
is computed and the moment it lands.

## The scrollbar problem

With `overflow-y: auto`, the browser shows a scrollbar only while
content overflows. The scrollbar is part of `clientWidth` / `clientHeight`
— so when it appears, the scroll container's inner height **shrinks
by the scrollbar's width**, and `chat-scroll` measured `clientHeight`
*before* that shrink. The gutter is then off by that much.

Symptoms:

- Pin feels mostly tight but the user can scroll ~15px past it on
  Windows/Linux (the platforms where scrollbars take horizontal space).
- No symptom on macOS with the default "overlay" scrollbar (it floats
  on top of content; no reflow).
- The drift only appears when the gutter is large enough to cause
  overflow that wasn't there before (typically: short responses).

## Recipe: lock the scrollbar's footprint

Pick **one** of these on the container element you pass to `mount()`.

### Option A — `scrollbar-gutter: stable` (preferred)

Reserves space for the scrollbar even when it isn't visible. The
container's `clientHeight` is the same whether overflow is present or
not.

```css
.chat__scroll {
  overflow-y: auto;
  scrollbar-gutter: stable;
}
```

Supported in all evergreen browsers (Chrome 94+, Firefox 97+, Safari
18.2+). On macOS with overlay scrollbars this is a no-op visually but
still stabilizes layout.

### Option B — `overflow-y: scroll`

Always shows the scrollbar. Simpler and works back to IE6, but the
scrollbar is visible even when content fits without overflow.

```css
.chat__scroll {
  overflow-y: scroll;
}
```

### Option C — leave `overflow-y: auto`

If your design can tolerate a few pixels of overshoot when the
scrollbar toggles, the default is fine. The pin is still bounded — it
just isn't sub-pixel exact.

## Verifying

The library's e2e suite (`scroll-bound-tight`) drives this assertion
against a real browser: after pinning and streaming, the pinned
message's top edge sits within 2px of the container's top edge
(accounting for `scrollMargin`). If you want to verify your own app,
the check is:

```ts
container.scrollTop = container.scrollHeight // clamps to max
const cRect = container.getBoundingClientRect()
const pRect = pinnedMessageEl.getBoundingClientRect()
const offset = pRect.top - cRect.top
// `offset` should equal `scrollMargin` (default 12) ± 2px.
```

## See also

- [Pin-to-top guide](../guide/pin-to-top)
- [Overlay composer](./composer-overlay) — reserves a `padding-bottom`
  band for a floating composer; the same gutter contract makes the pin
  stay tight as that band changes
- [`calcGutterHeight` reference](../reference/core#calcgutterheight)
