# `@chat-scroll/core`

The framework-agnostic core. All adapters re-export this.

## `createChatScroll(options?)`

Creates a `ChatScrollInstance`.

```ts
function createChatScroll(
  options?: ChatScrollOptions,
): ChatScrollInstance
```


### Example

```ts
import { createChatScroll } from '@chat-scroll/core'

const scroll = createChatScroll({
  strategy: 'pin-to-top',
  bottomThreshold: 40,
  scrollMargin: 12,
  scrollBehavior: 'auto',
  onScrollChange: (state) => console.log(state),
})

scroll.mount(containerEl, contentEl)
```

## Type exports

The core re-exports its full type surface:

```ts
import type {
  ChatScrollOptions,
  ChatScrollState,
  ChatScrollInstance,
  ChatScrollStrategy,
  ChatScrollBehavior,
  ScrollPosition,
} from '@chat-scroll/core'
```

## Lower-level utilities

For advanced use (custom integrations, instrumentation, behaviors not
covered by the built-in strategies — see [Lower-level
utilities](../guide/lower-level-utilities)), the core also exports:

| Symbol                  | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `createGutter`          | Append a styled gutter element to a container.       |
| `destroyGutter`         | Remove a gutter from the DOM.                        |
| `setGutterHeight`       | Set a gutter's height (clamped to ≥ 0, rounded).     |
| `calcGutterHeight`      | Compute the gutter height that pins `scrollHeight − clientHeight` to `pinnedY`. |
| `isAtBottom`            | Boolean: is container within `threshold` of bottom.  |
| `offsetWithin`          | Geometric offset of an element within a container.   |
| `resolveScrollBehavior` | Resolve `'auto'` against `prefers-reduced-motion`.   |

### `calcGutterHeight`

```ts
function calcGutterHeight(opts: {
  container: HTMLElement
  gutter: HTMLElement
  pinnedY: number
}): number
```

Returns the gutter height that satisfies the **tight-pin contract** —
after applying the result with `setGutterHeight`,
`container.scrollHeight − container.clientHeight === pinnedY` exactly.

The formula derives the gutter's distance from the container's
padding-edge top via `getBoundingClientRect()` (so it works regardless
of the container's `position` style) and reads `container.paddingBottom`
from computed style. It is consumer-CSS-agnostic: any container
padding, content padding, content border, or sibling margins are
absorbed automatically. The gutter must be a direct child of the
container with `margin: 0` (this is what `createGutter` produces).

Passing `pinnedY < 0` returns `0` — convention for "no pin active."

For sub-pixel tightness when the container uses `overflow-y: auto` and
the scrollbar's presence depends on overflow, see the
[tight pin recipe](../recipes/tight-pin).
