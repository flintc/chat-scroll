# Server-side rendering

`chat-scroll` is SSR-safe. Construction (`createChatScroll`) doesn't
touch the DOM; only `mount()` does, and `mount()` is called from a
ref callback that fires client-side.

## What runs where

- **`createChatScroll(options)`** — runs in both environments. Holds
  internal state, options, and listener sets. Does not query the DOM.
- **`instance.mount(container, content)`** — wires up the scroll
  listener, the `ResizeObserver`, and the gutter element. **Client
  only.** All three adapters call it from ref callbacks, which fire
  after hydration.
- **`instance.destroy()`** — cleanup hook (`useEffect` cleanup,
  `onBeforeUnmount`, `onCleanup`). Also client only, by virtue of
  when those hooks run.

The two browser-API reads inside the core
(`window.matchMedia('(prefers-reduced-motion: reduce)')` in
`scroll-utils.ts:13` and `smooth-scroll.ts:144`) are guarded by
`typeof window === 'undefined'` and short-circuit to safe defaults
when called from Node.

## Frameworks

### Next.js (App Router) / React Server Components

Mark the chat component as a client component — that's all you need:

```tsx
'use client'

import { useChatScroll } from '@chat-scroll/react'

export function ChatClient({ initialMessages }) {
  const scroll = useChatScroll({ strategy: 'pin-to-top' })
  // ...
}
```

A server component that renders `<ChatClient />` works normally;
React handles the boundary.

### Nuxt / Vue SSR

`useChatScroll` from `@chat-scroll/vue` is safe in `<script setup>`.
The mount runs only after the `:ref` resolves, post-hydration — no
directive or special check needed.

### SolidStart

`createChatScroll` runs on the server (instance construction only).
The mount defers to ref callbacks, which only fire client-side.

## Manual SSR check (vanilla)

If you call the core outside an adapter — e.g. inside a web component
that might be defined on the server — and you want an explicit guard:

```ts
const scroll = createChatScroll(options)

if (typeof window !== 'undefined') {
  scroll.mount(container, content)
}
```

The constructor itself is unconditionally safe; only `mount()` needs
DOM.
