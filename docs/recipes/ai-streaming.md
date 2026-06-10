# AI chat with streaming

A pin-to-top chat with a streaming response and bulk-load handling.
This is the closest match to how `chat-scroll` is meant to be used in
a real product.

<LiveDemo scenario="pin-to-top" caption="The end shape: Send pins the user message; the response streams below; the gutter shrinks as it fills." />

## The simple version

For the common case — your component owns the send action — there are
no effects:

```tsx
import { useChatScroll } from '@chat-scroll/react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
}

export function ChatView({
  messages,
  loading,
  onSend,
}: {
  messages: Message[]
  loading: boolean
  onSend: (text: string) => void
}) {
  const scroll = useChatScroll({
    strategy: 'pin-to-top',
    streaming: loading, // overflow-anchor on/off, automatically
  })

  function handleSend(text: string) {
    onSend(text)
    scroll.pinLatest('[data-role="user"]')
  }

  return (
    <div className="chat" ref={scroll.containerRef}>
      <div className="messages" ref={scroll.contentRef}>
        {messages.map((m) => (
          <Bubble key={m.id} msg={m} />
        ))}
      </div>

      {!scroll.state.atBottom && (
        <button className="scroll-fab" onClick={scroll.scrollToBottom}>
          ↓
        </button>
      )}

      <Composer onSend={handleSend} disabled={loading} />
    </div>
  )
}

function Bubble({ msg }: { msg: Message }) {
  return (
    <div className={`bubble bubble--${msg.role}`} data-role={msg.role}>
      {msg.text}
    </div>
  )
}
```

What you get:

- User message snaps to the top on send.
- Response streams in below; no scroll movement while it runs.
- User can scroll freely during streaming (the pin only re-anchors
  while they're still at it; wheel / touch / arrow keys release).
- Dynamic gutter holds the user message exactly at the top of the
  viewport when scrolled to the bottom.
- A scroll-to-bottom button when they've drifted away.

## Bulk loads

Loading a thread from history — many messages arriving in one update —
is the case where the send handler isn't the source. The right
plumbing depends on where the load actually happens.

### When a parent owns the data

If `messages` lives in a parent component (route loader, TanStack
Query, etc.), the cleanest pattern is **remount-on-thread** with the
[`key={threadId}`](../guide/pin-to-top#thread-switching) trick:

```tsx
function ChatRoute() {
  const { threadId } = useRouteParams()
  const { data: messages = [] } = useQuery(['thread', threadId], fetchThread)
  return <ChatView key={threadId} messages={messages} ... />
}
```

A new thread → a fresh `ChatScrollInstance` → initial messages render
at mount → the controller settles at the bottom on the first
ResizeObserver fire. No bulk-load case left to handle.

If you can't remount (the chat instance must persist), the parent
owns the bulk-arrival event already (`onSuccess` / `useEffect` on
`messages.length`) — call `scroll.scrollToBottom()` from there, just
the same as the effect-based version below.

### When the chat component owns the data

If the chat fetches its own thread, an effect on `messages.length` is
honest — that's the only signal the component has:

```tsx
const prevLength = useRef(0)

useEffect(() => {
  const cur = messages.length
  const prev = prevLength.current
  prevLength.current = cur

  // Many messages arrived in one update — bulk load. Jump to bottom.
  if (cur > prev + 1) {
    scroll.scrollToBottom()
  }
}, [messages.length, scroll])
```

`pinLatest` still belongs in `handleSend`. Don't pile both into one
effect — the send handler always wins on the read race, and an
effect that does two unrelated things is harder to reason about.

## Thread switching

Use [`key={threadId}`](../guide/pin-to-top#thread-switching) on the
component. A new thread means a fresh instance, no clearing needed.
If you need to preserve scroll positions across visits, see the
[multi-thread recipe](./multi-thread) — that's where the persistent
instance + `savePosition` / `restorePosition` pair earns its keep.

## Expandable blocks (thinking, tool calls)

If your `Bubble` renders collapsible sections — thinking traces, tool
calls, citations, code blocks — the user can expand or collapse them
at any time, including in **prior turns** while the current turn is
streaming. The controller handles this case correctly out of the box:
`pinnedY` is refreshed from the live pinned element on every
`ResizeObserver` fire, and `scrollTop` is restored against the new
value as long as the user is still "at" the pin.

See [Expandable blocks](../guide/pin-to-top#expandable-blocks-thinking-tool-calls)
for the underlying mechanism and the list of input events that DO or
DO NOT release the pin anchor.
