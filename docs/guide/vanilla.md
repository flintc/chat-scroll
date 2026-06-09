# Vanilla JS

The framework adapters are convenience layers; the core works on its
own in any browser environment — plain JS / TS, web components,
non-React/Vue/Solid frameworks, tests.

```sh
pnpm add @chat-scroll/core
```

## Basic usage

```ts
import { createChatScroll } from '@chat-scroll/core'

const container = document.querySelector('#chat')!
const content = document.querySelector('#messages')!

const scroll = createChatScroll({ strategy: 'pin-to-top' })
scroll.mount(container, content)

// Send handler — call pinLatest the same tick you append.
composer.addEventListener('send', async (e) => {
  appendUserMessage(e.detail.text)
  scroll.pinLatest('[data-role="user"]')

  scroll.setStreaming(true)
  await streamAssistant(e.detail.text)
  scroll.setStreaming(false)
})

// Cleanup on teardown.
window.addEventListener('beforeunload', () => scroll.destroy())
```

The framework adapters do exactly this internally — `createChatScroll`
+ `mount` + state subscription + cleanup. Skipping the adapter is a
real option when you don't have a framework to mediate, or when you're
embedding chat into a web component / custom shell.

## Driving state from outside

If you need state changes (`atBottom`, `pinActive`, etc.) to drive
something — show a button, update a class, fire an analytics event —
subscribe:

```ts
const off = scroll.subscribe((state) => {
  fab.classList.toggle('visible', !state.atBottom)
})

// Later, e.g. on view teardown:
off()
```

`onScrollChange` in the options is the same callback signature, but
it's a single slot — `subscribe()` is the right choice as soon as you
have more than one consumer.

## Web components

```ts
class ChatScrollElement extends HTMLElement {
  private scroll = createChatScroll({ strategy: 'pin-to-top' })

  connectedCallback() {
    const container = this.querySelector<HTMLElement>('[data-container]')
    const content = this.querySelector<HTMLElement>('[data-content]')
    if (container && content) {
      this.scroll.mount(container, content)
    }
  }

  disconnectedCallback() {
    this.scroll.destroy()
  }
}
customElements.define('chat-scroll-host', ChatScrollElement)
```

The instance is constructed once and reused across moves in the DOM
(adoption / disconnection / reconnection), which mirrors how the
framework adapters handle component remounts.
