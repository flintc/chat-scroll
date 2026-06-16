# `ChatScrollInstance`

The object returned by `createChatScroll()`. Adapters wrap it; you also
use it directly when consuming the core.

```ts
interface ChatScrollInstance {
  readonly state: ChatScrollState
  readonly options: Required<Omit<ChatScrollOptions, 'onScrollChange'>>

  mount(container: HTMLElement, content: HTMLElement): void
  setOptions(opts: Partial<ChatScrollOptions>): void

  pinMessage(el: HTMLElement): void
  pinLatest(selector: string): void
  pinRelative(selector: string, direction: -1 | 1): boolean
  getPinnedElement(): HTMLElement | null
  referenceMessage(selector: string): ReferenceMessage
  relativeMessage(selector: string, direction: -1 | 1): HTMLElement | null
  scrollToMessage(el: HTMLElement): void
  scrollToBottom(): void

  lock(): void
  unlock(): void

  setStreaming(streaming: boolean): void
  reset(): void

  savePosition(): ScrollPosition
  restorePosition(pos: ScrollPosition): void

  subscribe(listener: (state: ChatScrollState) => void): () => void
  destroy(): void
}
```

## Methods

### `mount(container, content)`

Wires up listeners, the ResizeObserver, and the gutter element. Required
before any other DOM-touching method does anything useful.

Idempotent — calling with the same elements is a no-op. Calling with
different elements tears down the previous mount before re-mounting.

### `setOptions(partial)`

Merge new options into the instance. Keys whose value is `undefined` are
ignored (they keep their current value), so adapters can safely pass
every key on every render. Switching `strategy` will reset the
prior strategy's transient state (clearing pins / releasing locks).

```ts
instance.setOptions({ bottomThreshold: 80 })
instance.setOptions({ strategy: 'stick-to-bottom' })
instance.setOptions({ scrollBehavior: 'smooth' })
```

`scrollBehavior` is read on every scroll call, so changes take
effect immediately — useful for letting users flip between smooth
and instant from a UI toggle without reconstructing the instance.

### `pinMessage(el)`

`pin-to-top` only. Anchors `el` to the viewport top: measures its
offset (`pinnedY`), recalculates the gutter so the user can't scroll
past where the response will arrive, and smooth-scrolls to the pin.
The animation re-reads its target every frame, so content resizing
mid-animation doesn't leave it short of the pin; with
`prefers-reduced-motion: reduce` (or `scrollBehavior: 'instant'`) the
write is synchronous. Work is deferred to the next animation frame so
layout has settled. No-op under `stick-to-bottom`.

### `pinLatest(selector)`

`pin-to-top` only. Convenience for the most common pin call:

```ts
instance.pinLatest('[data-role="user"]')
```

Equivalent to:

```ts
const matches = container.querySelectorAll(selector)
const last = matches[matches.length - 1]
if (last) instance.pinMessage(last)
```

### `pinRelative(selector, direction)`

`pin-to-top` only. Pin the previous (`-1`) or next (`1`) element
matching `selector`. Returns `true` when a target was pinned, `false`
at the edges (or when nothing matches) — wire it straight into your
buttons' disabled handling.

```ts
prevBtn.onclick = () => instance.pinRelative('[data-role="user"]', -1)
nextBtn.onclick = () => instance.pinRelative('[data-role="user"]', 1)
```

The reference point adapts to where the user is: relative to the
pinned element while they're anchored at it (calls resolve
synchronously, so rapid presses accumulate), and relative to the match
nearest the viewport top once they've scrolled away — where `-1` first
re-pins the turn being read, then walks upward. It therefore works
before any pin exists. The matched set is queried fresh on every call.

For the same UX under `stick-to-bottom`, see the
[message-navigation recipe](../recipes/message-navigation#stick-to-bottom-same-buttons-no-pin).

### `getPinnedElement()`

The element currently pinned — including one whose `pinMessage` call is
still waiting on its measurement frame — or `null` when no pin is
active. For navigation UI, prefer [`referenceMessage`](#referencemessage-selector)
/ [`relativeMessage`](#relativemessage-selector-direction), which cover
the scrolled-away case too.

### `referenceMessage(selector)`

The match the user is currently "at", resolved with the same rule
`pinRelative` uses: the pinned element while anchored at it (or a pin /
`scrollToMessage` still in flight), otherwise the match nearest the
viewport top. Works under both strategies. Returns:

```ts
interface ReferenceMessage {
  el: HTMLElement | null // null when the viewport is above every match
  index: number //          -1 when el is null
  count: number //          total matches (0: selector matched nothing)
  past: boolean //          viewport sits below el's top ("mid-reply")
}
```

Built for disabled states and "turn x/y" counters — re-evaluate it from
the container's scroll event:

```ts
const ref = instance.referenceMessage('[data-role="user"]')
counter.textContent = ref.index >= 0 ? `${ref.index + 1}/${ref.count}` : ''
```

### `relativeMessage(selector, direction)`

The element `pinRelative(selector, direction)` *would* navigate to — a
pure query, nothing scrolls. `null` at the edges or when the selector
matches nothing, so it doubles as the disabled-state check. Combine
with `scrollToMessage` for prev/next under `stick-to-bottom`:

```ts
const target = instance.relativeMessage('[data-role="user"]', -1)
if (target) instance.scrollToMessage(target)
```

### `scrollToMessage(el)`

Animated scroll that brings `el`'s top to the viewport top (minus
`scrollMargin`), under either strategy. It releases the stick lock
first — programmatic scrolls don't get the input-driven release, so a
mid-stream snap would otherwise cancel the animation — and clears
`pinAnchored`. It does **not** pin, resize the gutter, or re-engage the
lock on arrival (use `scrollToBottom()` to follow again).

The target is re-read every frame, so it tracks content resizing above
the element mid-animation, and back-to-back calls are last-call-wins:
the in-flight target is what `relativeMessage` navigates from, so rapid
prev/prev moves two steps.

### `scrollToBottom()`

Imperatively scroll the container to the bottom, using the resolved
`scrollBehavior` (which respects `prefers-reduced-motion`). The target
is re-read every animation frame, so content streaming in mid-scroll
doesn't leave you short of the real bottom.

Strategy-aware side effects:

- `pin-to-top`: clears `pinAnchored` — jumping to the bottom is the
  user's explicit "move away from the pin" affordance, so subsequent
  resizes won't re-anchor them to the pin.
- `stick-to-bottom`: re-engages the lock once the scroll completes
  (skipped if the user aborts the animation with a wheel/touch). A FAB
  wired to `scrollToBottom()` therefore resumes following the stream —
  no separate `lock()` call needed.

### `lock()` / `unlock()`

`stick-to-bottom` only. `lock()` engages the bottom-stick (and snaps to
bottom now). `unlock()` releases without scrolling.

You typically don't call `unlock()` yourself — the strategy releases the
lock automatically when the user scrolls up.

### `setStreaming(streaming)`

Toggles `overflow-anchor: none` on the container. Call before / after
a streaming response. See [Streaming mode](../guide/streaming).

Turning streaming OFF keeps the follow alive for a two-frame grace
period, so the final chunk's growth — which typically renders after
you flip your loading flag — isn't orphaned above the bottom. Flip the
flag synchronously with the last append; user input during the grace
still wins immediately.

### `reset()`

Clears per-thread state — pin, gutter, and (for stick-to-bottom) re-engage
lock and snap to bottom. Listeners and the observer are preserved.

Call this on conversation switch:

```ts
useEffect(() => instance.reset(), [threadId])
```

### `savePosition()` / `restorePosition(pos)`

See [Scroll restoration](../guide/scroll-restoration).

Unless saved at the bottom, the snapshot anchors to the message at the
reading position (the content child nearest the viewport top), so the
restore survives content changes above the reader — history prepends,
expandable blocks — while that element is in the DOM. When it's gone
(a re-rendered thread, a JSON-round-tripped token), restoration falls
back to the saved top offset.

`restorePosition` is self-sufficient: it releases the stick lock (so
the content swap's resize can't snap to the bottom over the restore),
applies immediately, and re-applies on the next frame in case the
destination content hadn't finished laying out. A `wasAtBottom`
snapshot restores to the *new* bottom and re-engages the follow. No
`unlock()` / `requestAnimationFrame` wrapping needed.

### `subscribe(listener)`

Register a listener for state changes. Returns an unsubscribe function.

```ts
const off = instance.subscribe((state) => {
  console.log(state.atBottom)
})
```

### `destroy()`

Tear down everything: scroll listener, ResizeObserver, gutter element,
container styles, pending animation frames, all subscribers.

Subscribers are dropped, so re-subscribe if you need state updates
afterwards. Calling `mount()` again rewires the DOM bindings — the
React adapter uses this to survive StrictMode's simulated
unmount/remount cycle.
