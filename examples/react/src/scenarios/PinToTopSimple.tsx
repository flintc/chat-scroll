import { useChatScroll } from '@chat-scroll/react'
import {
  ASSISTANT_SEGMENTS,
  PRIOR_TURNS,
  USER_PROMPT,
} from '@chat-scroll/example-shared'
import { MessageView } from '../RichMessageView'
import { seedFromPriorTurns, useRichChat } from '../use-rich-chat'

/**
 * Minimal pin-to-top demo — written the way a host app would write it
 * against a real chat hook (Vercel `useChat`, LangChain `useStream`).
 *
 * The hook owns the stream lifecycle and exposes `messages` + an
 * `isStreaming` flag. `useChatScroll` mirrors that flag into the
 * controller, so overflow-anchor and the gutter release happen
 * automatically. The only thing the strategy needs from the host is one
 * `pinLatest` call at submit time.
 */
export function PinToTopSimple() {
  const chat = useRichChat({
    initial: seedFromPriorTurns(PRIOR_TURNS),
    segments: ASSISTANT_SEGMENTS,
    autoIntervalMs: 100,
  })

  const scroll = useChatScroll({
    strategy: 'pin-to-top',
    streaming: chat.isStreaming,
  })

  return (
    <div
      className="chat"
      data-scenario="pin-to-top-simple"
      style={{ position: 'relative' }}
    >
      <div className="chat__scroll" data-test="scroll" ref={scroll.containerRef}>
        <div className="chat__list" data-test="list" ref={scroll.contentRef}>
          {chat.messages.map((m) => (
            <MessageView key={m.id} msg={m} />
          ))}
        </div>
        <div data-chat-scroll-gutter="" />
      </div>
      <div className="controls">
        <button
          data-test="send"
          onClick={() => {
            chat.submit(USER_PROMPT)
            scroll.pinLatest('[data-test="user-msg"]')
          }}
        >
          Send
        </button>
        <button data-test="finish" onClick={() => chat.stop()}>
          Finish stream
        </button>
        <button
          data-test="prev-user"
          aria-label="Previous user message"
          onClick={() => scroll.pinRelative('[data-test="user-msg"]', -1)}
        >
          ▲ Prev
        </button>
        <button
          data-test="next-user"
          aria-label="Next user message"
          onClick={() => scroll.pinRelative('[data-test="user-msg"]', 1)}
        >
          ▼ Next
        </button>
      </div>
    </div>
  )
}
