import { useCallback, useEffect, useRef } from 'react'
import { useChatScroll } from '@chat-scroll/react'
import {
  ASSISTANT_CHUNKS,
  PRIOR_TURNS,
  USER_PROMPT,
  formatState,
  showCue,
  type DemoApi,
} from '@chat-scroll/example-shared'
import { useFakeChat, type DefaultChatMessage } from '../use-fake-chat'
import { scrollToBottomOnMount, useStickFollow } from '../scroll-helpers'
import { PlaybackControls } from '../PlaybackControls'
import { usePlayback } from '../use-playback'

let seedId = 0
const SEED: DefaultChatMessage[] = PRIOR_TURNS.map((t) => ({
  id: --seedId,
  role: t.role === 'bot' ? 'assistant' : 'user',
  text: t.text,
}))

export function StickToBottom() {
  const chat = useFakeChat({
    initial: SEED,
    responseChunks: ASSISTANT_CHUNKS,
  })

  const scroll = useChatScroll({
    strategy: 'stick-to-bottom',
    scrollBehavior: 'instant',
    streaming: chat.isStreaming,
  })

  scrollToBottomOnMount(scroll)
  const follow = useStickFollow(scroll, { maintainOn: chat.messages })

  const containerElRef = useRef<HTMLElement | null>(null)
  const captureContainer = useCallback(
    (el: HTMLElement | null) => {
      containerElRef.current = el
      scroll.containerRef(el)
    },
    [scroll.containerRef],
  )

  const playback = usePlayback({
    initialIntervalMs: 130,
    initialBehavior: 'instant',
    tick: chat.tick,
    onBehaviorChange: (b) => scroll.instance.setOptions({ scrollBehavior: b }),
    onDurationChange: (ms) => scroll.instance.setOptions({ scrollDurationMs: ms }),
    isEnabled: () => chat.isStreaming,
  })

  // Refresh the playback gate every time chat-scroll state changes so
  // the timer pauses when streaming flips off.
  useEffect(
    () => scroll.instance.subscribe(() => playback.refresh()),
    [scroll.instance, playback.refresh],
  )

  const api: DemoApi = {
    tick: chat.tick,
    sendUserMessage: (text) => chat.submit(text ?? USER_PROMPT),
    finishStream: () => {
      chat.stop()
      playback.stop()
    },
    scrollByPx(px: number) {
      follow.release()
      const c = containerElRef.current
      if (c) c.scrollTop = c.scrollTop + px
    },
    setScrollBehavior: (b) => playback.setScrollBehavior(b),
    showCue,
  }
  // Re-assign every render so the page-global hook sees fresh closures;
  // delete only on unmount.
  useEffect(() => {
    window.__demo = api
  })
  useEffect(
    () => () => {
      delete window.__demo
    },
    [],
  )

  return (
    <div
      className="chat"
      data-scenario="stick-to-bottom"
      style={{ position: 'relative' }}
    >
      <div className="status" data-test="status">
        {formatState('stick-to-bottom', scroll.state)}
      </div>
      <div className="chat__scroll" data-test="scroll" ref={captureContainer}>
        <div className="chat__list" data-test="list" ref={scroll.contentRef}>
          {chat.messages.map((m) => (
            <div
              key={m.id}
              className={m.role === 'user' ? 'msg msg--user' : 'msg msg--bot'}
              data-test={m.role === 'user' ? 'user-msg' : 'bot-msg'}
            >
              {m.text}
            </div>
          ))}
        </div>
        <div data-chat-scroll-gutter="" />
      </div>
      <button
        className={scroll.state.atBottom ? 'fab' : 'fab fab--visible'}
        data-test="fab"
        aria-label="Scroll to bottom"
        onClick={follow.resume}
      >
        ↓
      </button>
      <div className="controls">
        <button
          data-test="send"
          onClick={() => {
            chat.submit(USER_PROMPT)
            playback.start()
          }}
        >
          Append message
        </button>
        <button data-test="scroll-up" onClick={() => api.scrollByPx?.(-300)}>
          Simulate scroll up
        </button>
        <PlaybackControls playback={playback} />
      </div>
    </div>
  )
}
