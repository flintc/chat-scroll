# Slack-style scroll lock

Traditional chat: stay glued to the bottom by default; release when
the user scrolls up to read history; re-engage on send.

<LiveDemo scenario="stick-to-bottom" caption="Live demo — auto-follow on append, release on scroll-up, snap back via the ↓ button." />

```tsx
import { useEffect } from 'react'
import { useChatScroll } from '@chat-scroll/react'

export function GroupChat({
  messages,
  unreadCount,
  onSend,
  markRead,
  streaming,
}: {
  messages: Message[]
  unreadCount: number
  onSend: (text: string) => void
  markRead: () => void
  streaming: boolean
}) {
  const scroll = useChatScroll({
    strategy: 'stick-to-bottom',
    streaming,
  })

  function handleSend(text: string) {
    onSend(text)
    scroll.lock() // re-engage if user had scrolled up
  }

  // Mark as read when the user lands at the bottom.
  useEffect(() => {
    if (scroll.state.atBottom && unreadCount > 0) markRead()
  }, [scroll.state.atBottom, unreadCount, markRead])

  return (
    <div className="chat" ref={scroll.containerRef}>
      <div className="messages" ref={scroll.contentRef}>
        {messages.map((m) => <Message key={m.id} msg={m} />)}
      </div>

      {!scroll.state.atBottom && (
        <button
          className="new-messages-pill"
          onClick={scroll.lock}
        >
          {unreadCount > 0
            ? `${unreadCount} new ${unreadCount === 1 ? 'message' : 'messages'}`
            : '↓ Jump to latest'}
        </button>
      )}

      <Composer onSend={handleSend} />
    </div>
  )
}
```

## How it behaves

- **Default.** Locked. Container scrolled to bottom; new messages push
  older ones up.
- **User scrolls up.** Lock releases on the input itself (wheel-up,
  touch pan, ArrowUp/PageUp/Home — scrollbar drags are caught by a
  position check). Subsequent messages no longer push the reading
  position.
- **`atBottom` flips to `false`.** Show a "new messages" pill.
- **User taps pill.** Call `scroll.lock()` — snaps to bottom and
  re-engages.
- **User sends a message.** Call `scroll.lock()` from the send
  handler.

## What `streaming` adds

For traditional group chat the model is "new messages arrive," not "a
single response streams in token by token" — so it's tempting to skip
`streaming` entirely. Skip it and the strategy is **permanently
disarmed**: the lock state is still tracked, but new content doesn't
auto-snap. Two cases where you want it:

- **Typing previews / live token streams** — "Alice is typing…" with
  the partial message visible. Set `streaming: true` while a member
  is typing so the auto-snap follows the stream.
- **Slow message batches** — if your transport delivers a burst of
  messages with delays between (a backfill, a slow socket reconnect),
  flagging the batch as streaming keeps the user at the bottom across
  the whole batch.

Outside these cases — instant chat with no typing previews — you can
leave `streaming` off and `lock()` from the send handler does the
work.

## Tuning

Increase `bottomThreshold` to make the lock more forgiving for users
who micro-scroll while typing:

```ts
useChatScroll({ strategy: 'stick-to-bottom', bottomThreshold: 100 })
```
