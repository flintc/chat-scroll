# @chat-scroll/react

React adapter for [`@chat-scroll/core`](https://github.com/flintc/chat-scroll).

Re-exports the full core surface, so you only need this one install.

## Install

```sh
pnpm add @chat-scroll/react
```

## Quick example

```tsx
import { useChatScroll } from '@chat-scroll/react'

function Chat({ messages, isLoading }) {
  const scroll = useChatScroll({
    strategy: 'pin-to-top',
    streaming: isLoading, // controlled — mirrors upstream loading flag
  })

  return (
    <div ref={scroll.containerRef}>
      <div ref={scroll.contentRef}>
        {messages.map((m) => (
          <div key={m.id} data-role={m.role}>{m.text}</div>
        ))}
      </div>
    </div>
  )
}
```

## Docs

Full guide: [flintc.github.io/chat-scroll/guide/react](https://flintc.github.io/chat-scroll/guide/react)

## License

MIT
