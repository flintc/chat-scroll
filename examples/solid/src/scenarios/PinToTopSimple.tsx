import { For } from 'solid-js'
import { createChatScroll } from '@chat-scroll/solid'
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
 * `isStreaming` signal. `createChatScroll` mirrors that signal into the
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

  const scroll = createChatScroll({
    strategy: 'pin-to-top',
    streaming: chat.isStreaming,
  })

  return (
    <div
      class="chat"
      data-scenario="pin-to-top-simple"
      style={{ position: 'relative' }}
    >
      <div class="chat__scroll" data-test="scroll" ref={scroll.containerRef}>
        <div class="chat__list" data-test="list" ref={scroll.contentRef}>
          <For each={chat.messages()}>{(msg) => <MessageView msg={msg} />}</For>
        </div>
      </div>
      <div class="controls">
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
