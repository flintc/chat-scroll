# Installation

Install the package for your framework. The adapter packages re-export the
core, so you only need one install.

::: code-group

```sh [pnpm]
# React
pnpm add @chat-scroll/react

# Vue
pnpm add @chat-scroll/vue

# Solid
pnpm add @chat-scroll/solid

# Vanilla / non-framework
pnpm add @chat-scroll/core
```

```sh [npm]
npm install @chat-scroll/react
npm install @chat-scroll/vue
npm install @chat-scroll/solid
npm install @chat-scroll/core
```

```sh [yarn]
yarn add @chat-scroll/react
yarn add @chat-scroll/vue
yarn add @chat-scroll/solid
yarn add @chat-scroll/core
```

:::

## Peer dependencies

Each adapter has a peer dependency on its framework. They are compatible
with the following versions:

| Adapter            | Peer                            |
| ------------------ | ------------------------------- |
| `@chat-scroll/react` | `react@^18 \|\| ^19`            |
| `@chat-scroll/vue`   | `vue@^3.3`                      |
| `@chat-scroll/solid` | `solid-js@^1.8`                 |

## Bundle size

| Package                | min+gzip (adapter alone) | total with core |
| ---------------------- | ------------------------ | --------------- |
| `@chat-scroll/core`    | —                        | ~5 KB           |
| `@chat-scroll/react`   | <1 KB                    | ~5.5 KB         |
| `@chat-scroll/vue`     | <1 KB                    | ~5.5 KB         |
| `@chat-scroll/solid`   | <1 KB                    | ~5.5 KB         |

Sizes measured against the built `dist/index.js` of each package. The
adapter packages re-export the core via `export * from
'@chat-scroll/core'`, so your bundler combines them into a single tree
on import. Tree-shakeable: the unused strategy is dropped when only one
is referenced. Zero runtime dependencies.

## TypeScript

All packages ship with TypeScript declarations. No `@types/*` install
needed.
