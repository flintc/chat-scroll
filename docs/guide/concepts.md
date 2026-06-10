# Concepts

Three concepts are worth understanding before you wire `chat-scroll` into a
component: the **container**, the **content**, and the **gutter**.

## The two elements

`chat-scroll` requires exactly two DOM elements:

```
┌─ container (you provide) ────────────────────┐
│  ┌─ content (you provide) ─────────────────┐ │
│  │                                          │ │
│  │  Your messages render here.              │ │
│  │                                          │ │
│  └──────────────────────────────────────────┘ │
│  ┌─ gutter (chat-scroll appends) ──────────┐  │ ← height computed
│  │                                          │ │   automatically
│  └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

| Element       | Who owns it     | Role                                     |
| ------------- | --------------- | ---------------------------------------- |
| **container** | You             | The scrollable element. Owns overflow.   |
| **content**   | You             | Wraps your messages. The thing that gets observed for resize. |
| **gutter**    | `chat-scroll`   | Inserted as the last child of container. |

You wire both elements via refs / ref callbacks. `chat-scroll` applies the
required styles to the container (`overflow-y: auto`, `display: flex`,
`flex-direction: column`) and inserts the gutter on `mount()`.

## Strategies

A strategy is a behavior policy. Two are built in:

- **`pin-to-top`** — used by AI chat. When you call `pinMessage(el)`, the
  element is anchored to the viewport top, scroll-margin is applied, and the
  gutter grows to fill any space below where the response will eventually
  arrive.
- **`stick-to-bottom`** — used by traditional chat. While `streaming` and
  `locked` are both true, the container stays glued to the bottom as new
  content arrives. User scroll-up breaks the lock; calling `lock()` (e.g.
  on send, alongside `setStreaming(true)`) re-engages it. Outside a stream
  the strategy is inert, so users can expand collapsible blocks without
  being yanked back.

Both share infrastructure: the container styles, the at-bottom detection,
streaming mode, and the gutter element. They differ only in the
`onContentResize` and `onScroll` callbacks they install.

## State

`chat-scroll` exposes a reactive state object. The four fields you'll
read most of the time:

```ts
interface ChatScrollState {
  atBottom: boolean    // user is within `bottomThreshold` of the end
  pinActive: boolean   // a pin-to-top message is currently anchored
  streaming: boolean   // overflow-anchor is disabled
  locked: boolean      // stick-to-bottom lock is engaged
  // ...three more for advanced consumers — see the State reference.
}
```

Three more fields (`pinAnchored`, `scrollInFlight`, `pinnedY`) are
available for UI that needs finer state — e.g. greying out a "jump to
pin" button while the user is still at the pin. The full surface is in
the [State reference](../reference/state).

The state object is **identity-stable** — it only swaps for a new
`Object.frozen` snapshot when something changes. That's what keeps
`useSyncExternalStore`, Vue's `watch`, and Solid's `createEffect` from
firing on every tick.

## Imperative methods

| Method               | What it does                                          |
| -------------------- | ----------------------------------------------------- |
| `pinMessage(el)`     | Anchor an element to the top (pin-to-top only).       |
| `pinLatest(sel)`     | Find the last matching element and pin it.            |
| `pinRelative(sel, ±1)` | Pin the prev (-1) / next (+1) match relative to the pinned turn, or to the turn nearest the viewport top after the user scrolls away. Returns `false` at the ends. |
| `getPinnedElement()` | The pinned element (incl. one pending its measurement frame), or `null`. |
| `referenceMessage(sel)` | The match the user is at — `{ el, index, count, past }` — for counters and disabled states. Both strategies. |
| `relativeMessage(sel, ±1)` | The element a prev/next navigation would target (pure query; `null` at the edges). |
| `scrollToMessage(el)` | Animated scroll bringing `el` to the viewport top; releases the follow first. Both strategies. |
| `scrollToBottom()`   | Smooth-scroll (or instant) to the bottom.             |
| `lock()` / `unlock()`| Engage / release stick-to-bottom lock.                |
| `setStreaming(bool)` | Toggle `overflow-anchor: none`; arms stick-to-bottom's auto-snap. |
| `reset()`            | Clear pin, release lock, reset gutter.                |
| `savePosition()`     | Snapshot scroll position (for tab/route changes).     |
| `restorePosition()`  | Restore a saved position.                             |
| `destroy()`          | Tear down listeners, observer, gutter.                |

## Lifecycle

```
createChatScroll(opts)        ← can run anywhere; no DOM needed yet
       │
       ▼
   instance
       │
       │  mount(container, content)        ← from a ref / effect
       ▼
  ┌───────────────────────────────────┐
  │  scroll listener attached         │
  │  ResizeObserver observes content  │
  │  gutter inserted into container   │
  │  container styles applied         │
  └───────────────────────────────────┘
       │
       │  pinMessage / lock / unlock / setStreaming  ← drive behavior
       ▼
   destroy()
       │
       ▼
  ┌───────────────────────────────────┐
  │  listener detached                │
  │  observer disconnected            │
  │  gutter removed                   │
  │  container styles restored        │
  └───────────────────────────────────┘
```

Adapters call `mount()` from ref callbacks and `destroy()` from cleanup
hooks; you generally never call them yourself.
