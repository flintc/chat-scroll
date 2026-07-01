# Pin-to-top strategy

The pattern from ChatGPT, Claude, and Gemini: when the user sends a
message, it pins to the top of the viewport and the response streams in
below it.

<LiveDemo scenario="pin-to-top" caption="Send a message: it pins to the top while the reply streams in below the way an LLM delivers it — reasoning first, then a tool call (watch its arguments assemble), then the answer. Expand a Tool call / Reasoning block in an earlier reply mid-stream — the pin holds. ‹ Prev / Next › hop the pin between turns." />

## When to use it

- AI chat where each turn is large (a question plus a long response).
- Scroll position should be _stable_ during streaming — no auto-scroll,
  no movement under the cursor.
- The user reads the response top-down at their own pace.

## How it works

1. You call `scroll.pinMessage(el)` (or `pinLatest`) on the just-sent
   user message.
2. The controller measures the element's offset and remembers it as
   `pinnedY`.
3. A **gutter** below the content is sized so that, at maximum scroll,
   the pinned message sits exactly at the top of the viewport (minus
   [`scrollMargin`](../reference/options#scrollmargin)) — the
   **tight-pin contract**:

   ```
   container.scrollHeight - container.clientHeight === pinnedY
   ```

   The gutter is measured from live layout, so your padding, margins,
   and borders are accounted for automatically. For a sub-pixel-tight
   pin under `overflow-y: auto`, see the
   [tight pin recipe](../recipes/tight-pin).

4. An rAF-driven smooth scroll moves the container to the pin. The
   target is re-read every frame, so content resizing mid-animation
   doesn't make it land short. With `prefers-reduced-motion: reduce`
   (or `scrollBehavior: 'instant'`) it's a synchronous write.
5. As the response streams in, the gutter shrinks toward zero. Once it
   reaches zero, natural scrolling takes over.

<LiveDemo scenario="pin-to-top" caption="The striped band below the response is the gutter shrinking as the assistant fills space." />

## Wiring

The send handler is the natural home for `pinLatest` — it's the one
place that knows a new turn just started:

```tsx
const scroll = useChatScroll({
  strategy: 'pin-to-top',
  streaming: isLoading, // adapter mirrors this into setStreaming
})

function handleSend(text: string) {
  sendMessage(text)
  scroll.pinLatest('[data-role="user"]')
}
```

`pinLatest(selector)` finds the last matching element and pins it on
the next animation frame, so you can call it in the same tick you append
the message. If you already have the element, use
`scroll.pinMessage(el)`.

::: tip If you can't hook the send
When messages arrive from a source you don't control (a chat hook, a
WebSocket push), the signal lives in the data: an effect watching
`messages.at(-1)?.role === 'user'` is the right fit. Prefer the
handler when you have one.
:::

## Streaming

Set `streaming` while the assistant is generating — while the pin is
held it disables the browser's `overflow-anchor`, which otherwise
fights the strategy by re-anchoring scroll to arbitrary nodes during
DOM mutation (and restores it if the reader scrolls away). Passing
your loading flag as the adapter's `streaming` option is all it takes.
See [Streaming mode](./streaming).

For very tall prompts — a pasted log, a long code block — the
[`pinClamp` option](../reference/options#pinclamp) over-scrolls the
pinned message so only a slice of it stays at the top and the response
keeps the room.

## Multi-turn

Call `pinLatest()` again on every send — the old pin is replaced, the
gutter recalculates, and the previous exchange scrolls up out of view.

## Prev / next navigation

`pinRelative(selector, direction)` pins the neighbor of the turn the
user is currently at:

```ts
prevBtn.onclick = () => scroll.pinRelative('[data-role="user"]', -1)
nextBtn.onclick = () => scroll.pinRelative('[data-role="user"]', 1)

window.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey)) return
  // Don't steal modifier+arrow from text fields (macOS caret jumps).
  const t = e.target as HTMLElement | null
  if (t?.closest('input, textarea, select, [contenteditable]')) return
  if (e.key === 'ArrowUp') scroll.pinRelative('[data-role="user"]', -1)
  if (e.key === 'ArrowDown') scroll.pinRelative('[data-role="user"]', 1)
})
```

The reference point follows the user: relative to the pinned turn
while they're anchored at it, relative to the turn nearest the
viewport top once they've scrolled away. At the ends of the list
`pinRelative` returns `false` and pins nothing — wire that to your
disabled states. Full semantics in the
[message-navigation recipe](../recipes/message-navigation).

## Bulk loads

When a thread loads from history, skip the pin and show the latest
content: call `scroll.scrollToBottom()` once when the data lands (in
the parent's success callback, or an effect comparing
`messages.length` to its previous value — see the
[AI chat recipe](../recipes/ai-streaming)).

## Expandable blocks (thinking, tool calls)

Users can expand or collapse blocks in **prior turns** — above the
pin — mid-stream. No configuration needed: the controller tracks the
pinned element (not a frozen offset), re-reads its position on every
resize, and re-anchors while the user is still at the pin. Animated
collapses work too — each animation frame re-anchors.

Whether the user is "still at the pin" is the
[`pinAnchored`](../reference/state#pinanchored) flag. It's cleared by
scroll intent — wheel, touch pan, scroll keys, `scrollToBottom()`, or
a programmatic scroll of the container — and deliberately **not** by
interaction: tapping a block, pressing Enter, Space on a
button/`<summary>`/link, or scroll keys inside an editable all leave
the pin in place, the same as a mouse click does.

## Thread switching

The simplest pattern is to remount the chat component on thread
change — the controller is fresh per mount:

::: code-group

```tsx [React]
<Chat key={threadId} threadId={threadId} />
```

```vue [Vue]
<Chat :key="threadId" :thread-id="threadId" />
```

```tsx [Solid]
<Show keyed when={threadId()}>
  {(id) => <Chat threadId={id} />}
</Show>
```

:::

To preserve scroll position across visits, keep one instance and use
`savePosition` / `restorePosition` — see the
[multi-thread recipe](../recipes/multi-thread). `scroll.reset()`
clears pin, gutter, and state without remounting (e.g. a "new chat"
button).
