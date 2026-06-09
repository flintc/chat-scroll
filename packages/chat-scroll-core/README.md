# @chat-scroll/core

Framework-agnostic core for [`chat-scroll`](https://github.com/flintc/chat-scroll).

Use this directly in vanilla JS, web components, or any non-React/Vue/Solid
framework. For React/Vue/Solid, prefer the matching adapter package.

## Install

```sh
pnpm add @chat-scroll/core
```

## Quick example

```ts
import { createChatScroll } from '@chat-scroll/core'

const scroll = createChatScroll({ strategy: 'pin-to-top' })
scroll.mount(containerEl, contentEl)

scroll.pinLatest('[data-role="user"]')
scroll.setStreaming(true)
// ...
scroll.destroy()
```

## Docs

Full documentation: [flintc.github.io/chat-scroll](https://flintc.github.io/chat-scroll/)

## License

MIT
