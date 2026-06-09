# `ChatScrollState`

```ts
interface ChatScrollState {
  atBottom: boolean
  pinActive: boolean
  pinAnchored: boolean
  streaming: boolean
  locked: boolean
  scrollInFlight: boolean
  pinnedY: number
}
```

The state object is **`Object.frozen`** and **identity-stable** —
`instance.state` returns the same reference until something actually
changes, then a new frozen object replaces it. This makes it safe to use
with React's `useSyncExternalStore`, Vue's `watch`, Solid's signals, etc.

## `atBottom`

- **Type:** `boolean`

`true` when the user is within `bottomThreshold` of the bottom of the
content. Use it to show / hide a scroll-to-bottom affordance.

```tsx
{!state.atBottom && <button onClick={scrollToBottom}>↓</button>}
```

## `pinActive`

- **Type:** `boolean`

`true` while a `pin-to-top` message is set — i.e. the controller has a
pinned element it is sizing the gutter around. Becomes `false` after
`reset()` or a strategy switch. Says nothing about whether the user is
currently *at* the pin — see [`pinAnchored`](#pinanchored) for that.

## `pinAnchored`

- **Type:** `boolean`

`true` while the user is still sitting at the pinned message — i.e. the
controller will re-anchor `scrollTop` to `pinnedY` on the next content
resize. Cleared by *scroll-driving* user input (`wheel`, `touchmove`,
ArrowUp/Down, PageUp/Down, Home/End, Space) and by programmatic
`scrollToBottom()`. Not cleared by `pointerdown` / `touchstart` / Tab /
Enter / letter keys — those are interaction events, not scroll events,
and clearing on them would drop the pin when the user taps a thinking /
tool block in the response.

Useful for UI that wants to distinguish "pin exists" (`pinActive`) from
"pin currently controls scroll" (`pinAnchored`) — e.g. greying out a
"jump to pin" affordance while the user is at the pin.

## `streaming`

- **Type:** `boolean`

Mirrors the last `setStreaming()` call — whether driven by the
adapter's reactive `streaming` option or by an imperative
`setStreaming` call. Useful for test assertions or a "…is typing"
indicator. (For UI, an upstream loading flag is usually a cleaner
source — `scroll.state.streaming` just tells you what the controller
believes.)

## `locked`

- **Type:** `boolean`

`true` while the `stick-to-bottom` lock is engaged. Becomes `false` when
the user scrolls up; becomes `true` again on `lock()`.

For `pin-to-top`, this is always `false`.

## `scrollInFlight`

- **Type:** `boolean`

`true` while a controller-owned rAF smooth-scroll animation is running
(e.g. the animation that `pinMessage` or `scrollToBottom` kicks off).
Useful for hiding affordances that would race the animation — e.g.
suppress a "you have new messages" toast until the animation settles.

In `'instant'` mode (or when `prefers-reduced-motion` resolves to
instant), this never flips to `true`: the scroll is a synchronous
write, not an animation.

## `pinnedY`

- **Type:** `number`

The absolute Y offset (in the scroll plane) of the pinned message's top
edge, minus `scrollMargin`. `-1` when no pin is active. Refreshed on
every content resize so it tracks the live element — if a block above
the pin expands, `pinnedY` updates with the new layout before the
gutter is recomputed.

---

## Subscribing

Get notified on state changes via `subscribe()`:

```ts
const off = instance.subscribe((state) => {
  console.log(state)
})

// later
off()
```

Or via `onScrollChange` in the options. Adapters use `subscribe()`
internally to feed their reactive primitives.
