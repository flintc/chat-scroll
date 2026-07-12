import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useChatScroll } from '@chat-scroll/react'
import {
  PRIOR_TURNS,
  TURN_PROMPTS,
  TURN_SEGMENTS,
  USER_PROMPT,
  createBotStreamer,
  formatState,
  setBlockOpen,
  showCue,
  type DemoApi,
} from '@chat-scroll/example-shared'
import { PlaybackControls } from '../PlaybackControls'
import { usePlayback } from '../use-playback'

interface PriorTurn {
  id: string
  role: 'user' | 'bot'
  text: string
}

interface TurnEntry {
  /** Unique key per turn so React doesn't recycle bot bubbles. */
  key: number
  prompt: string
}

// The streaming exchange demonstrates expandable thinking + tool
// blocks, which need an imperative target element. For prior turns
// we render plain text reactively; for the live bot bubble we render
// an empty <div> and let the streamer write into it.
const priors: PriorTurn[] = PRIOR_TURNS.map((t, i) => ({ ...t, id: `p${i}` }))

export function PinToTop() {
  const [turns, setTurns] = useState<TurnEntry[]>([])
  const turnKeyRef = useRef(0)
  const promptIdxRef = useRef(0)
  const containerElRef = useRef<HTMLElement | null>(null)
  const listElRef = useRef<HTMLElement | null>(null)
  const currentBotElRef = useRef<HTMLElement | null>(null)
  // Single streamer for the component's lifetime. Construction is inert
  // (it only writes DOM once `reset` hands it a target element).
  const [streamer] = useState(createBotStreamer)

  const nextPrompt = () =>
    TURN_PROMPTS[promptIdxRef.current++ % TURN_PROMPTS.length] ?? USER_PROMPT

  const scroll = useChatScroll({ strategy: 'pin-to-top' })

  const { containerRef, contentRef } = scroll
  const captureContainer = useCallback(
    (el: HTMLElement | null) => {
      containerElRef.current = el
      containerRef(el)
    },
    [containerRef],
  )
  const captureList = useCallback(
    (el: HTMLElement | null) => {
      listElRef.current = el
      contentRef(el)
    },
    [contentRef],
  )

  const playback = usePlayback({
    initialIntervalMs: 140,
    initialBehavior: 'smooth',
    supportsGutter: true,
    tick: () => api.tick(),
    onBehaviorChange: (b) => scroll.instance.setOptions({ scrollBehavior: b }),
    onDurationChange: (ms) =>
      scroll.instance.setOptions({ scrollDurationMs: ms }),
    isEnabled: () => scroll.instance.state.streaming,
  })

  // Refresh the playback gate every time chat-scroll state changes so
  // the timer pauses when streaming flips off.
  const { instance } = scroll
  const { refresh: refreshPlayback } = playback
  useEffect(
    () => instance.subscribe(() => refreshPlayback()),
    [instance, refreshPlayback],
  )

  const api: DemoApi = {
    tick(): boolean {
      if (!currentBotElRef.current) return false
      const more = streamer.tick()
      if (!more) scroll.setStreaming(false)
      return more
    },
    sendUserMessage(text?: string): void {
      const prompt = text ?? nextPrompt()
      const segments =
        TURN_SEGMENTS[(promptIdxRef.current - 1) % TURN_SEGMENTS.length] ??
        TURN_SEGMENTS[0]!
      const key = ++turnKeyRef.current
      // Commit the new turn to the DOM synchronously, then wait one
      // frame so it's painted before we pin the user and start streaming.
      flushSync(() => setTurns((cur) => [...cur, { key, prompt }]))
      requestAnimationFrame(() => {
        const userEl = listElRef.current?.querySelector<HTMLElement>(
          `[data-turn-key="${key}"] [data-test="user-msg"]`,
        )
        const botEl = listElRef.current?.querySelector<HTMLElement>(
          `[data-turn-key="${key}"] [data-test="bot-msg"]`,
        )
        if (!userEl || !botEl) return
        currentBotElRef.current = botEl
        streamer.reset(botEl, segments)
        scroll.setStreaming(true)
        scroll.instance.pinMessage(userEl)
      })
    },
    finishStream(): void {
      streamer.finish()
      scroll.setStreaming(false)
      playback.stop()
    },
    scrollByPx(px: number): void {
      containerElRef.current?.scrollBy({ top: px, behavior: 'smooth' })
    },
    toggleBlock(index: number, open?: boolean): void {
      const el = listElRef.current?.querySelector<HTMLElement>(
        `.block[data-block-index="${index}"]`,
      )
      if (!el) return
      setBlockOpen(el, open ?? el.dataset.open !== 'true')
    },
    expandBlock(index: number): void {
      const el = listElRef.current?.querySelector<HTMLElement>(
        `.block[data-block-index="${index}"]`,
      )
      if (el) setBlockOpen(el, true)
    },
    collapseBlock(index: number): void {
      const el = listElRef.current?.querySelector<HTMLElement>(
        `.block[data-block-index="${index}"]`,
      )
      if (el) setBlockOpen(el, false)
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
      className={playback.showGutter ? 'chat chat--show-gutter' : 'chat'}
      data-scenario="pin-to-top"
      style={{ position: 'relative' }}
    >
      <div className="status" data-test="status">
        {formatState('pin-to-top', scroll.state)}
      </div>
      <div className="chat__scroll" data-test="scroll" ref={captureContainer}>
        <div className="chat__list" data-test="list" ref={captureList}>
          {priors.map((t) => (
            <div
              key={t.id}
              className={t.role === 'user' ? 'msg msg--user' : 'msg msg--bot'}
              data-test={t.role === 'user' ? 'user-msg' : 'bot-msg'}
            >
              {t.text}
            </div>
          ))}
          {turns.map((turn) => (
            <div
              key={turn.key}
              data-turn-key={turn.key}
              style={{ display: 'contents' }}
            >
              <div className="msg msg--user" data-test="user-msg">
                {turn.prompt}
              </div>
              <div className="msg msg--bot" data-test="bot-msg" />
            </div>
          ))}
        </div>
        <div data-chat-scroll-gutter="" />
      </div>
      <button
        className={scroll.state.atBottom ? 'fab' : 'fab fab--visible'}
        data-test="fab"
        aria-label="Scroll to latest"
        onClick={() => scroll.scrollToBottom()}
      >
        ↓
      </button>
      <div className="controls">
        <button
          data-test="send"
          onClick={() => {
            api.sendUserMessage()
            playback.start()
          }}
        >
          Send next prompt
        </button>
        <button data-test="finish" onClick={() => api.finishStream()}>
          Finish stream
        </button>
        <button
          data-test="prev-user"
          aria-label="Previous user message"
          onClick={() =>
            scroll.instance.pinRelative('[data-test="user-msg"]', -1)
          }
        >
          ▲ Prev
        </button>
        <button
          data-test="next-user"
          aria-label="Next user message"
          onClick={() =>
            scroll.instance.pinRelative('[data-test="user-msg"]', 1)
          }
        >
          ▼ Next
        </button>
        <PlaybackControls playback={playback} />
      </div>
    </div>
  )
}
