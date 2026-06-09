# `ChatScrollOptions`

```ts
interface ChatScrollOptions {
  strategy?: 'pin-to-top' | 'stick-to-bottom'
  bottomThreshold?: number
  scrollMargin?: number
  scrollBehavior?: 'auto' | 'smooth' | 'instant'
  scrollDurationMs?: number
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

Applied as `scroll-margin-top` to messages pinned via `pinMessage()`. The
gutter math accounts for this offset, so the user never scrolls past where
the response will arrive.

Only used by `pin-to-top`.

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

## `onScrollChange`

- **Type:** `(state: ChatScrollState) => void`

Called whenever the state object transitions. Framework adapters use this
internally; you generally don't pass it yourself unless you're using the
core directly.

If you need multiple subscribers, use `instance.subscribe()` instead.
