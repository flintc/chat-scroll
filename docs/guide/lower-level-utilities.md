# Lower-level utilities

`@chat-scroll/core` is more than `createChatScroll`. The same module
exports a handful of utilities used internally by the strategies — and
they're available to consumers who want to build something the
built-in strategies don't cover.

This is the **escape hatch**, not the recommended path. Most apps will
be well served by `pin-to-top` or `stick-to-bottom`. Reach for these
utilities when:

- You're integrating chat-scroll math into a larger scroll-coordination
  system (e.g. virtualization + pin behavior).
- You're building a strategy variant that doesn't quite fit either
  built-in.
- You want to verify a measurement (`isAtBottom`, `offsetWithin`) in
  test code or instrumentation.

## What's exported

```ts
import {
  createGutter,
  destroyGutter,
  setGutterHeight,
  calcGutterHeight,
  isAtBottom,
  offsetWithin,
  resolveScrollBehavior,
} from '@chat-scroll/core'
```

| Symbol                  | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `createGutter`          | Append a styled gutter element to a container.       |
| `destroyGutter`         | Remove a gutter from the DOM.                        |
| `setGutterHeight`       | Set a gutter's height (clamped to ≥ 0, rounded).     |
| `calcGutterHeight`      | Compute the gutter height that satisfies the tight-pin contract. |
| `isAtBottom`            | Within `threshold` of the bottom, minus an optional `endSlack` (e.g. a gutter). |
| `offsetWithin`          | Geometric offset of an element within a container.   |
| `resolveScrollBehavior` | Resolve `'auto'` against `prefers-reduced-motion`.   |

Full signatures live in [`@chat-scroll/core`
reference](../reference/core#lower-level-utilities).

## Example: a minimal pin behavior

Here's the smallest sketch of a pin-and-bound-scroll behavior built
directly from these utilities — closer to what's inside the
`pin-to-top` strategy than to typical consumer code:

```ts
import {
  createGutter,
  destroyGutter,
  setGutterHeight,
  calcGutterHeight,
  offsetWithin,
} from '@chat-scroll/core'

function pinAndBound(
  container: HTMLElement,
  content: HTMLElement,
  pinnedEl: HTMLElement,
) {
  const gutter = createGutter(container)
  const pinnedY = Math.max(0, offsetWithin(pinnedEl, container) - 12)

  const recompute = () => {
    setGutterHeight(gutter, calcGutterHeight({ container, gutter, pinnedY }))
  }
  recompute()

  const ro = new ResizeObserver(recompute)
  ro.observe(content, { box: 'border-box' })
  ro.observe(container, { box: 'border-box' })

  container.scrollTop = pinnedY

  return () => {
    ro.disconnect()
    destroyGutter(gutter)
  }
}
```

The real `pin-to-top` strategy adds re-anchor logic for layout
changes during streaming, smooth-scroll animation that tracks live
`pinnedY`, user-input detection that releases the pin, and a great
deal more. The shape above is enough to demonstrate that the gutter
math and at-bottom detection are usable on their own.

## Pluggable strategies — roadmap

The `Strategy` interface itself isn't exported yet. The internals are
intentionally narrow (three lifecycle hooks: `onContentResize`,
`onScroll`, `reset`), so exposing them in a stable form is mostly a
naming-and-docs exercise. If you have a coherent third pattern that
needs first-class support, [open an
issue](https://github.com/flintc/chat-scroll/issues) — we'd rather
grow the library deliberately than ship an API surface nobody is
using.
