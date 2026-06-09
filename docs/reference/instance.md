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
  pinRelative(selector: string, direction: -1 | 1): void
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

Merge new options into the instance. Switching `strategy` will reset the
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

`pin-to-top` only. Anchors `el` to the viewport top:

1. Sets `scroll-margin-top: <scrollMargin>px` on `el`.
2. Measures `el`'s offset within the container; records it as `pinnedY`.
3. Recalculates the gutter so the user can't scroll past where the
   response will arrive.
4. Kicks off an rAF-driven smooth scroll to `pinnedY`. The animation
   re-reads the target every frame, so it tracks live `pinnedY` if
   content above the pin grows or shrinks mid-flight. With
   `prefers-reduced-motion: reduce` (or `scrollBehavior: 'instant'`),
   the write is synchronous.

The work is deferred to the next animation frame so layout has settled.
`pinMessage` is a no-op when strategy is `stick-to-bottom`.

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

`pin-to-top` only. Navigate to the previous (`-1`) or next (`1`) element
matching `selector`, relative to the currently pinned element. Typical
use: prev/next user-message navigation driven by buttons or
`cmd+↑` / `cmd+↓` keybindings.

```ts
prevBtn.onclick = () => instance.pinRelative('[data-role="user"]', -1)
nextBtn.onclick = () => instance.pinRelative('[data-role="user"]', 1)
```

No-ops when:

- no message is currently pinned (call `pinLatest` first to seed),
- the current pin isn't in the matched set (e.g. you pinned an
  assistant message but the selector targets user messages),
- the navigation would move past the start or end of the list.

The matched set is queried fresh on every call, so messages added since
the last `pinRelative` are picked up immediately.

### `scrollToBottom()`

Imperatively scroll the container to the bottom, using the resolved
`scrollBehavior` (which respects `prefers-reduced-motion`).

### `lock()` / `unlock()`

`stick-to-bottom` only. `lock()` engages the bottom-stick (and snaps to
bottom now). `unlock()` releases without scrolling.

You typically don't call `unlock()` yourself — the strategy releases the
lock automatically when the user scrolls up.

### `setStreaming(streaming)`

Toggles `overflow-anchor: none` on the container. Call before / after a
streaming response. See [Streaming mode](../guide/streaming) for why.

### `reset()`

Clears per-thread state — pin, gutter, and (for stick-to-bottom) re-engage
lock and snap to bottom. Listeners and the observer are preserved.

Call this on conversation switch:

```ts
useEffect(() => instance.reset(), [threadId])
```

### `savePosition()` / `restorePosition(pos)`

See [Scroll restoration](../guide/scroll-restoration).

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

The instance is unusable after `destroy()`. Create a new one if you need
to remount.
