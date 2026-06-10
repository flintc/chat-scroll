---
layout: home

hero:
  name: chat-scroll
  text: Headless scroll for chat UIs
  tagline: Pin-to-top, stick-to-bottom, dynamic gutters. A framework-agnostic core with thin adapters for React, Vue, and Solid.
  image:
    src: /logo.svg
    alt: chat-scroll
  actions:
    - theme: brand
      text: Get started
      link: /guide/introduction
    - theme: alt
      text: API reference
      link: /reference/core
    - theme: alt
      text: View on GitHub
      link: https://github.com/flintc/chat-scroll

features:
  - icon: 📌
    title: Pin-to-top strategy
    details: Anchor each user message to the viewport top while the assistant streams below — the pattern from ChatGPT, Claude, and Gemini.
  - icon: ⚓
    title: Stick-to-bottom strategy
    details: Auto-scroll while the user is at the bottom; release when they scroll up to read; re-engage on send. Slack, WhatsApp, iMessage.
  - icon: 🪜
    title: Dynamic gutter
    details: A zero-config bound — the user can never scroll past the last line of content, no matter how short or tall the response is.
  - icon: 🧪
    title: Framework-agnostic core
    details: A small ESM core works without any framework. Adapters are thin wrappers that wire up reactivity and cleanup.
  - icon: 🔌
    title: One install, all imports
    details: Each adapter re-exports the core. Install `@chat-scroll/react` once and import everything from the same package.
  - icon: 🎯
    title: Tested across frameworks
    details: 100+ unit tests on the core, parity tests per adapter, and end-to-end specs that drive a real browser with recorded videos.
---

<div style="max-width: 960px; margin: 3rem auto 0;">

<LiveDemo scenario="side-by-side" caption="pin-to-top (left) vs stick-to-bottom (right) — same prompt, same chunks, different scroll behavior. The striped band is the gutter shrinking as the response fills space. Try scrolling mid-stream." />

</div>

## Quick example

A pin-to-top chat. The send handler is the natural home for `pinLatest`
— the host code already has all the context it needs:

::: code-group

```tsx [React]
import { useChatScroll } from '@chat-scroll/react'

export function Chat({ messages, isLoading, sendMessage }) {
  const scroll = useChatScroll({
    strategy: 'pin-to-top',
    streaming: isLoading, // mirrors upstream loading flag
  })

  function handleSend(text: string) {
    sendMessage(text)
    scroll.pinLatest('[data-role="user"]')
  }

  return (
    <div ref={scroll.containerRef} className="chat">
      <div ref={scroll.contentRef}>
        {messages.map((m) => (
          <div key={m.id} data-role={m.role}>{m.text}</div>
        ))}
      </div>
      <Composer onSend={handleSend} />
    </div>
  )
}
```

```vue [Vue]
<script setup lang="ts">
import { useChatScroll } from '@chat-scroll/vue'

const props = defineProps<{
  messages: Message[]
  loading: boolean
  sendMessage: (text: string) => void
}>()

const scroll = useChatScroll({
  strategy: 'pin-to-top',
  streaming: () => props.loading, // getter — re-reads on access
})

function handleSend(text: string) {
  props.sendMessage(text)
  scroll.pinLatest('[data-role="user"]')
}
</script>

<template>
  <div :ref="scroll.containerRef" class="chat">
    <div :ref="scroll.contentRef">
      <div v-for="m in messages" :key="m.id" :data-role="m.role">
        {{ m.text }}
      </div>
    </div>
    <Composer @send="handleSend" />
  </div>
</template>
```

```tsx [Solid]
import { For } from 'solid-js'
import { createChatScroll } from '@chat-scroll/solid'

export function Chat(props: {
  messages: Message[]
  loading: boolean
  sendMessage: (text: string) => void
}) {
  const scroll = createChatScroll({
    strategy: 'pin-to-top',
    streaming: () => props.loading, // accessor — Solid signal style
  })

  function handleSend(text: string) {
    props.sendMessage(text)
    scroll.pinLatest('[data-role="user"]')
  }

  return (
    <div ref={scroll.containerRef} class="chat">
      <div ref={scroll.contentRef}>
        <For each={props.messages}>
          {(m) => <div data-role={m.role}>{m.text}</div>}
        </For>
      </div>
      <Composer onSend={handleSend} />
    </div>
  )
}
```

```ts [Vanilla JS]
import { createChatScroll } from '@chat-scroll/core'

const scroll = createChatScroll({ strategy: 'pin-to-top' })
scroll.mount(
  document.querySelector('#chat')!,
  document.querySelector('#messages')!,
)

composer.addEventListener('send', async (e) => {
  appendUserMessage(e.detail.text)
  scroll.pinLatest('[data-role="user"]')

  scroll.setStreaming(true)
  await streamAssistant(e.detail.text)
  scroll.setStreaming(false)
})
```

:::

Notice what's _not_ there: no `useEffect` watching `messages.length`,
no thread-aware effects to reset state. The send handler is the only
place that knows a new turn is starting, so that's where the pin call
lives. The adapter mirrors `isLoading` into `setStreaming` for you.

## Why?

Every chat UI reinvents scroll behavior — pin messages, auto-scroll,
detect scroll intent, show a scroll-to-bottom affordance — and the
implementations end up inlined into components and coupled to one
framework.

`chat-scroll` extracts the scroll math and DOM orchestration into a
framework-agnostic core. The framework layer is _"give me refs, tell
me when to clean up, expose reactive state"_ — the same
options/instance/adapter pattern as
[`@tanstack/virtual`](https://tanstack.com/virtual) and
[`@tanstack/table`](https://tanstack.com/table).
