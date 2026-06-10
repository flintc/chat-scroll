# Introduction

`chat-scroll` is a headless library for managing scroll behavior in chat
interfaces. It does not render messages or supply UI — it owns the scroll
container, the dynamic gutter, the at-bottom detection, and the imperative
methods you need to drive the conversation experience your design calls for.

## What it solves

Every chat UI reinvents the same handful of behaviors:

- **Pin to top** — when the user sends a message, anchor it to the top of the
  viewport so the response streams in below. Most modern AI chat (ChatGPT,
  Claude, Gemini) uses this pattern.
- **Stick to bottom** — when new messages arrive, auto-scroll the container.
  When the user scrolls up to read history, release the lock so they aren't
  forced back. Re-engage when they send. Slack, WhatsApp, iMessage.
- **Bounded scroll** — when a message is pinned, the user must never
  be able to scroll past it. This requires a dynamic spacer (gutter)
  beneath the content while the response is still filling in.
- **At-bottom detection** — to show a "scroll to bottom" affordance, fade
  unread badges, etc.
- **Streaming-safe** — disable browser `overflow-anchor` while the assistant
  is streaming, so layout doesn't fight the strategy.

These are mostly framework-agnostic concerns: `getBoundingClientRect`,
`ResizeObserver`, `scrollTop`, and a handful of DOM mutations. There's no
reason to re-derive them in every framework, and no reason to inline them
into your components.

## How it's structured

```
@chat-scroll/core        ← framework-agnostic — works in any browser
  └── createChatScroll()    ChatScroll instance
       ├── pin-to-top       strategy
       └── stick-to-bottom  strategy

@chat-scroll/react        ← thin adapter — useChatScroll hook
@chat-scroll/vue          ← thin adapter — useChatScroll composable
@chat-scroll/solid        ← thin adapter — createChatScroll composable
```

You install one package — the framework adapter — and it re-exports
everything from the core. Vanilla / non-framework users can install
`@chat-scroll/core` directly.

## Design principles

**Modeled on TanStack.** The same options-and-instance pattern that powers
[`@tanstack/virtual`](https://tanstack.com/virtual),
[`@tanstack/table`](https://tanstack.com/table), and friends:

- A core class is fully usable without any framework.
- Options are passed at construction and updatable at any time via
  `setOptions()`.
- Internal state is exposed as a stable, identity-comparable snapshot for
  framework reactivity systems (React's `useSyncExternalStore`, Vue's
  `ref`, Solid's signals).
- Framework adapters are tiny — they create the instance, wire refs,
  subscribe to state, and clean up on unmount.

**Headless.** No styling, no markup, no message rendering. The library wires
your two elements (container + content) and otherwise stays out of your way.

**One install.** The framework package re-exports the core. You don't need
to add `@chat-scroll/core` separately; it ships with the adapter.

## Next steps

- [Installation](./installation) — pick the package for your framework.
- [Concepts](./concepts) — the container, content, and gutter; the
  state object; the lifecycle.
- [Pin-to-top](./pin-to-top) / [Stick-to-bottom](./stick-to-bottom) —
  pick the strategy your app needs.
- [Framework adapter](./react) (or [Vue](./vue) / [Solid](./solid) /
  [Vanilla](./vanilla)) — wire up the controller.
- [Recipes](../recipes/) — end-to-end patterns: AI chat, Slack-style,
  scroll-to-bottom FAB, multi-thread, tight pin.

## What about virtualization?

`chat-scroll` and [`@tanstack/virtual`](https://tanstack.com/virtual)
solve different problems and compose cleanly: the virtualizer owns the
visible-row math, `chat-scroll` owns scroll position semantics. See
the [virtualization recipe](../recipes/virtualization) — both
strategies, with live demos over a 5,000-message history.
