# Recipes

Worked patterns end-to-end. Each shows how a real product uses one
strategy plus the surrounding wiring (compose, FAB, restore, …).

All examples are written in React. Vue and Solid translate one-for-one;
see the framework guides ([React](../guide/react) / [Vue](../guide/vue)
/ [Solid](../guide/solid)) for the per-framework state-access /
streaming-option syntax.

| Recipe                                                  | What it shows                                |
| ------------------------------------------------------- | -------------------------------------------- |
| [AI chat with streaming](./ai-streaming)                | Pin-to-top, streaming, bulk loads, no effects in the happy path. |
| [Slack-style scroll lock](./slack-style)                | Stick-to-bottom with unread indicator and `lock` on send. |
| [Scroll-to-bottom button](./scroll-fab)                 | Floating action button driven by `state.atBottom`. |
| [Multi-thread switching](./multi-thread)                | `key` remount vs persistent instance + save/restore. |
| [Tight pin (sub-pixel)](./tight-pin)                    | Stabilize the scrollbar for an exact pin under `overflow-y: auto`. |
| [Prev / next navigation](./message-navigation)          | `cmd+↑` / `cmd+↓` to step between user turns with `pinRelative`. |
| [Virtualized lists (TanStack)](./virtualization)        | Stick-to-bottom and pin-to-top over a windowed 5,000-message history with `@tanstack/virtual`. |
| [Infinite history (TanStack Query)](./infinite-history) | Bidirectional `useInfiniteQuery` paging with prepend scroll compensation. |
