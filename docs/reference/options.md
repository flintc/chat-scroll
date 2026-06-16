# `ChatScrollOptions`

```ts
interface ChatScrollOptions {
  strategy?: 'pin-to-top' | 'stick-to-bottom'
  bottomThreshold?: number
  scrollMargin?: number
  bottomInset?: number
  scrollBehavior?: 'auto' | 'smooth' | 'instant'
  scrollDurationMs?: number
  initialPosition?: 'bottom' | 'none'
  onScrollChange?: (state: ChatScrollState) => void
}
```

All options are optional.

## `strategy`

- **Type:** `'pin-to-top' | 'stick-to-bottom'`
- **Default:** `'stick-to-bottom'`

The scroll behavior policy. See [Concepts](../guide/concepts) for the
distinction.

## `bottomThreshold`

- **Type:** `number` (pixels)
- **Default:** `40`

The user is considered "at bottom" when within this many pixels of the
content's end. Used both by `state.atBottom` (so you can show a
scroll-to-bottom button) and by the `stick-to-bottom` strategy (to detect
user scroll-up).

## `scrollMargin`

- **Type:** `number` (pixels)
- **Default:** `12`

The gap kept above a message brought to the viewport top — pins
(`pinMessage` and friends) and `scrollToMessage` landings both honor
it, and the gutter math accounts for it. Live-updatable via
`setOptions`; the [home page demo](/) exposes it as the **Margin**
control.

## `bottomInset`

- **Type:** `number` (pixels)
- **Default:** `0`

Height of an obstruction overlaying the **bottom** of the viewport —
typically a `position: fixed`/`absolute` composer that floats over the
messages instead of sitting in flow below them. The controller reserves
this much space below the content in its own gutter (it does **not**
touch your container's padding), so the last message can scroll clear of
the obstruction and `atBottom` flips only once it has. Works under both
strategies.

Live-updatable via `setOptions`, so feed it the composer's measured
height from a `ResizeObserver` and it tracks growth (a textarea wrapping,
an attachment row) on the same frame. See the
[Overlay composer recipe](../recipes/composer-overlay).

## `scrollBehavior`

- **Type:** `'auto' | 'smooth' | 'instant'`
- **Default:** `'auto'`

Controls programmatic scroll animation:

- `'smooth'` — always smooth.
- `'instant'` — always instant.
- `'auto'` — smooth, unless `prefers-reduced-motion: reduce`. The
  preference is checked at call time, so users can flip it mid-session.

## `scrollDurationMs`

- **Type:** `number` (milliseconds)
- **Default:** `320`

Duration of smooth-scroll animations. Ignored when the resolved
behavior is `'instant'` (or reduced-motion kicks in). Pass `0` to get
an instant write while keeping `'smooth'` selected — useful if you
want to disable the animation per call rather than per instance.

Read on every scroll call, so changes via `setOptions` take effect
immediately — wire it to a slider if you want users to tune the feel.

## `initialPosition`

- **Type:** `'bottom' | 'none'`
- **Default:** `'none'`

Where the viewport opens. `'bottom'` lands at the latest content on
mount (and again on `reset()`), and keeps re-landing there on every
content resize — hydration, web-font swap, late-loading images — until
the first user input, the first upward scroll, or the first
programmatic scroll call. This replaces the mount + rAF + `fonts.ready`
sequence chat UIs usually wire up by hand.

Evaluated at `mount()` / `reset()` time; not live-updatable via
`setOptions`.

## `onScrollChange`

- **Type:** `(state: ChatScrollState) => void`

Called whenever the state object transitions. Framework adapters use this
internally; you generally don't pass it yourself unless you're using the
core directly.

If you need multiple subscribers, use `instance.subscribe()` instead.
