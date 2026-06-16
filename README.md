# chat-scroll

> Headless scroll management for chat UIs. Framework-agnostic core with thin
> adapters for React, Vue, and Solid.

[![CI](https://github.com/flintc/chat-scroll/actions/workflows/ci.yml/badge.svg)](https://github.com/flintc/chat-scroll/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-online-3b82f6)](https://flintc.github.io/chat-scroll/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## What is it

Every chat UI reinvents scroll behavior — pin user messages, auto-scroll,
detect user scroll intent, show a scroll-to-bottom affordance, manage a
gutter so the user can't overshoot the last line of a streaming response.

`chat-scroll` extracts that logic into a framework-agnostic core. You bring
the markup; we own the scroll math.

## Strategies

| Strategy           | Behavior                                                  | Use case                           |
| ------------------ | --------------------------------------------------------- | ---------------------------------- |
| `pin-to-top`       | New user message pins to viewport top, gutter prevents overscroll | AI chat (ChatGPT, Claude, etc.)    |
| `stick-to-bottom`  | Container locked to bottom; user scroll-up breaks lock    | Slack, WhatsApp, iMessage          |

## Quick start

```sh
pnpm add @chat-scroll/react   # or /vue, /solid, /core
```

```tsx
import { useChatScroll } from '@chat-scroll/react'

function Chat({ messages, loading, sendMessage }) {
  const scroll = useChatScroll({
    strategy: 'pin-to-top',
    streaming: loading, // adapter mirrors this into setStreaming
  })

  function handleSend(text) {
    sendMessage(text)
    scroll.pinLatest('[data-role="user"]') // pin the turn you just sent
  }

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

See the [docs](https://flintc.github.io/chat-scroll/) for full guides
and recipes.

## Packages

| Package                | Description                                  |
| ---------------------- | -------------------------------------------- |
| `@chat-scroll/core`    | Framework-agnostic core. Zero dependencies.  |
| `@chat-scroll/react`   | React adapter (`useChatScroll`).             |
| `@chat-scroll/vue`     | Vue 3 adapter (`useChatScroll`).             |
| `@chat-scroll/solid`   | Solid adapter (`createChatScroll`).          |

Each adapter re-exports the core, so you only ever install one package.

## Repo structure

```
chat-scroll/
├── packages/
│   ├── chat-scroll-core/        # @chat-scroll/core
│   ├── react-chat-scroll/       # @chat-scroll/react
│   ├── vue-chat-scroll/         # @chat-scroll/vue
│   └── solid-chat-scroll/       # @chat-scroll/solid
├── docs/                        # VitePress docs site (GH Pages)
├── examples/                    # Demo apps (vanilla, React, Vue, Solid)
└── e2e/                         # Playwright suite driving the examples
```

## Development

```sh
# Install
pnpm install

# Build all packages
pnpm build

# Run tests (vitest)
pnpm test

# Typecheck
pnpm typecheck

# Run docs site locally
pnpm docs:dev

# Build docs (output: docs/.vitepress/dist)
pnpm docs:build
```

## Deploying docs

The `docs` site is built with [VitePress](https://vitepress.dev) and is
GitHub Pages-ready out of the box. The workflow at
`.github/workflows/docs.yml` builds and deploys on every push to `main`.

To deploy under a sub-path (project pages):

```yaml
env:
  DOCS_BASE: /chat-scroll/   # adjust to your repo name
```

For a custom domain, leave `DOCS_BASE` unset.

## License

MIT
