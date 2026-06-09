# @chat-scroll/solid

Solid adapter for [`@chat-scroll/core`](https://github.com/flintc/chat-scroll).

Re-exports the full core surface, so you only need this one install.

## Install

```sh
pnpm add @chat-scroll/solid
```

## Quick example

```tsx
import { For } from 'solid-js'
import { createChatScroll } from '@chat-scroll/solid'

function Chat(props) {
  const scroll = createChatScroll({
    strategy: 'pin-to-top',
    streaming: () => props.loading, // controlled — mirrors upstream signal
  })

  return (
    <div ref={scroll.containerRef}>
      <div ref={scroll.contentRef}>
        <For each={props.messages}>
          {(m) => <div data-role={m.role}>{m.text}</div>}
        </For>
      </div>
    </div>
  )
}
```

## Docs

Full guide: [flintc.github.io/chat-scroll/guide/solid](https://flintc.github.io/chat-scroll/guide/solid)

## License

MIT
