import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useChatScroll } from '@chat-scroll/react'
import {
  ASSISTANT_SEGMENTS,
  PRIOR_TURNS,
  USER_PROMPT,
  createBotStreamer,
  formatState,
  showCue,
  type BotStreamer,
  type DemoApi,
} from '@chat-scroll/example-shared'
import { PlaybackControls } from '../PlaybackControls'
import { usePlayback } from '../use-playback'

interface PriorTurn {
  role: 'user' | 'bot'
  text: string
}

interface TurnEntry {
  key: number
  prompt: string
}

const priors: PriorTurn[] = [...PRIOR_TURNS]

/**
 * Side-by-side strategy comparison: pin-to-top (left) and
 * stick-to-bottom (right) stream the same canonical exchange in
 * parallel so the viewer can see how each renders the same content.
 */
export function SideBySide() {
  const [turns, setTurns] = useState<TurnEntry[]>([])
  const turnKeyRef = useRef(0)
  const pinListElRef = useRef<HTMLElement | null>(null)
  const stickListElRef = useRef<HTMLElement | null>(null)
  const pinContainerElRef = useRef<HTMLElement | null>(null)
  const pinBotElRef = useRef<HTMLElement | null>(null)
  const stickBotElRef = useRef<HTMLElement | null>(null)
  const followingRef = useRef(true)
  const pinStreamerRef = useRef<BotStreamer | null>(null)
  if (pinStreamerRef.current === null) pinStreamerRef.current = createBotStreamer()
  const pinStreamer = pinStreamerRef.current
  const stickStreamerRef = useRef<BotStreamer | null>(null)
  if (stickStreamerRef.current === null) stickStreamerRef.current = createBotStreamer()
  const stickStreamer = stickStreamerRef.current

  const pin = useChatScroll({ strategy: 'pin-to-top' })
  const stick = useChatScroll({
    strategy: 'stick-to-bottom',
    scrollBehavior: 'instant',
  })

  const capturePinContainer = useCallback(
    (el: HTMLElement | null) => {
      pinContainerElRef.current = el
      pin.containerRef(el)
    },
    [pin.containerRef],
  )
  const capturePinList = useCallback(
    (el: HTMLElement | null) => {
      pinListElRef.current = el
      pin.contentRef(el)
    },
    [pin.contentRef],
  )
  const captureStickList = useCallback(
    (el: HTMLElement | null) => {
      stickListElRef.current = el
      stick.contentRef(el)
    },
    [stick.contentRef],
  )

  const playback = usePlayback({
    initialIntervalMs: 140,
    initialBehavior: 'smooth',
    supportsGutter: true,
    tick: () => api.tick(),
    onBehaviorChange: (b) => pin.instance.setOptions({ scrollBehavior: b }),
    onDurationChange: (ms) =>
      pin.instance.setOptions({ scrollDurationMs: ms }),
    isEnabled: () => pin.instance.state.streaming,
  })

  // FAB visibility for the pin panel — driven by both scroll events
  // and content-resize events. Computed from raw measurements so the
  // synthetic gutter (which inflates scrollHeight during the pin
  // animation) doesn't briefly fight us.
  const [pinFabVisible, setPinFabVisible] = useState(false)
  const updatePinFab = useCallback(() => {
    const container = pinContainerElRef.current
    const list = pinListElRef.current
    if (!container || !list) {
      setPinFabVisible(false)
      return
    }
    setPinFabVisible(
      list.scrollHeight > container.scrollTop + container.clientHeight + 40,
    )
  }, [])

  useEffect(() => {
    const off1 = pin.instance.subscribe(() => playback.refresh())
    const off2 = stick.instance.subscribe((s) => {
      if (!s.locked) followingRef.current = false
    })
    const raf = requestAnimationFrame(() => stick.scrollToBottom())
    const container = pinContainerElRef.current
    container?.addEventListener('scroll', updatePinFab, { passive: true })
    let ro: ResizeObserver | null = null
    if (pinListElRef.current) {
      ro = new ResizeObserver(updatePinFab)
      ro.observe(pinListElRef.current)
    }
    updatePinFab()
    return () => {
      off1()
      off2()
      cancelAnimationFrame(raf)
      container?.removeEventListener('scroll', updatePinFab)
      ro?.disconnect()
    }
  }, [pin.instance, stick.instance, playback.refresh, stick.scrollToBottom, updatePinFab])

  const api: DemoApi = {
    tick(): boolean {
      if (!pinBotElRef.current || !stickBotElRef.current) return false
      const pinMore = pinStreamer.tick()
      const stickMore = stickStreamer.tick()
      if (followingRef.current) stick.lock()
      if (!pinMore && !stickMore) {
        pin.setStreaming(false)
        stick.setStreaming(false)
        return false
      }
      return true
    },
    sendUserMessage(text?: string): void {
      const prompt = text ?? USER_PROMPT
      const key = ++turnKeyRef.current
      // Commit the new turn to the DOM synchronously, then wait one
      // frame so it's painted before we pin the user and start streaming.
      flushSync(() => setTurns((cur) => [...cur, { key, prompt }]))
      requestAnimationFrame(() => {
        const pinUser = pinListElRef.current?.querySelector<HTMLElement>(
          `[data-pin-key="${key}"] [data-test="user-msg"]`,
        )
        pinBotElRef.current =
          pinListElRef.current?.querySelector<HTMLElement>(
            `[data-pin-key="${key}"] [data-test="bot-msg"]`,
          ) ?? null
        stickBotElRef.current =
          stickListElRef.current?.querySelector<HTMLElement>(
            `[data-stick-key="${key}"] [data-test="bot-msg"]`,
          ) ?? null
        if (!pinUser || !pinBotElRef.current || !stickBotElRef.current) return
        pinStreamer.reset(pinBotElRef.current, ASSISTANT_SEGMENTS)
        stickStreamer.reset(stickBotElRef.current, ASSISTANT_SEGMENTS)
        pin.setStreaming(true)
        stick.setStreaming(true)
        pin.instance.pinMessage(pinUser)
        if (followingRef.current) stick.lock()
      })
    },
    finishStream(): void {
      pinStreamer.finish()
      stickStreamer.finish()
      pin.setStreaming(false)
      stick.setStreaming(false)
      playback.stop()
    },
    scrollByPx(px: number): void {
      // Stick is the canonical "user scrolled" target since side-by-
      // side's primary asymmetry is on the stick panel.
      // Smooth so motion shows on video.
      const c = document.querySelector<HTMLElement>(
        '[data-test="scroll-stick"]',
      )
      c?.scrollBy({ top: px, behavior: 'smooth' })
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
    <div className="chat" data-scenario="side-by-side">
      <div
        className={
          playback.showGutter ? 'panel chat--show-gutter' : 'panel'
        }
        data-test="panel-pin"
      >
        <div className="panel__title">Pin to top</div>
        <div className="status" data-test="status-pin">
          {formatState('pin-to-top', pin.state)}
        </div>
        <div
          className="chat__scroll"
          data-test="scroll-pin"
          ref={capturePinContainer}
        >
          <div className="chat__list" data-test="list-pin" ref={capturePinList}>
            {priors.map((t, i) => (
              <div
                key={`p${i}`}
                className={t.role === 'user' ? 'msg msg--user' : 'msg msg--bot'}
              >
                {t.text}
              </div>
            ))}
            {turns.map((turn) => (
              <div
                key={turn.key}
                data-pin-key={turn.key}
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
          className={pinFabVisible ? 'fab fab--visible' : 'fab'}
          data-test="fab-pin"
          aria-label="Scroll to latest"
          onClick={() => pin.scrollToBottom()}
        >
          ↓
        </button>
      </div>
      <div className="panel" data-test="panel-stick">
        <div className="panel__title">Stick to bottom</div>
        <div className="status" data-test="status-stick">
          {formatState('stick-to-bottom', stick.state)}
        </div>
        <div
          className="chat__scroll"
          data-test="scroll-stick"
          ref={stick.containerRef}
        >
          <div
            className="chat__list"
            data-test="list-stick"
            ref={captureStickList}
          >
            {priors.map((t, i) => (
              <div
                key={`p${i}`}
                className={t.role === 'user' ? 'msg msg--user' : 'msg msg--bot'}
              >
                {t.text}
              </div>
            ))}
            {turns.map((turn) => (
              <div
                key={turn.key}
                data-stick-key={turn.key}
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
          className={stick.state.atBottom ? 'fab' : 'fab fab--visible'}
          data-test="fab"
          aria-label="Scroll to bottom"
          onClick={() => {
            followingRef.current = true
            stick.lock()
          }}
        >
          ↓
        </button>
      </div>
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
        <PlaybackControls playback={playback} />
      </div>
    </div>
  )
}
