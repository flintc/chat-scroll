import { createSignal, For, onCleanup, onMount } from 'solid-js'
import { createChatScroll } from '@chat-scroll/solid'
import {
  PRIOR_TURNS,
  TURN_PROMPTS,
  TURN_SEGMENTS,
  USER_PROMPT,
  createBotStreamer,
  expandSegments,
  formatState,
  setBlockOpen,
  showCue,
  type DemoApi,
} from '@chat-scroll/example-shared'
import { PlaybackControls } from '../PlaybackControls'
import { usePlayback } from '../use-playback'

interface PriorTurn {
  role: 'user' | 'bot'
  text: string
}

interface TurnEntry {
  /** Unique key per turn so <For> doesn't recycle bot bubbles. */
  key: number
  prompt: string
}

export function PinToTop() {
  let promptIdx = 0
  const nextPrompt = () =>
    TURN_PROMPTS[promptIdx++ % TURN_PROMPTS.length] ?? USER_PROMPT

  const [turns, setTurns] = createSignal<TurnEntry[]>([])
  let turnKey = 0
  let listEl: HTMLElement | null = null
  let containerEl: HTMLElement | null = null
  const streamer = createBotStreamer()
  let currentBotEl: HTMLElement | null = null

  const scroll = createChatScroll({ strategy: 'pin-to-top' })

  function captureContainer(el: HTMLElement) {
    containerEl = el
    scroll.containerRef(el)
  }
  function captureList(el: HTMLElement) {
    listEl = el
    scroll.contentRef(el)
  }

  const playback = usePlayback({
    initialIntervalMs: 140,
    initialBehavior: 'smooth',
    supportsGutter: true,
    tick: () => api.tick(),
    onBehaviorChange: (b) => scroll.instance.setOptions({ scrollBehavior: b }),
    onDurationChange: (ms) =>
      scroll.instance.setOptions({ scrollDurationMs: ms }),
    isEnabled: () => scroll.state().streaming,
  })

  // Refresh the playback gate every time chat-scroll state changes so
  // the timer pauses when streaming flips off.
  onMount(() => {
    const off = scroll.instance.subscribe(() => playback.refresh())
    onCleanup(off)
  })

  const api: DemoApi = {
    tick(): boolean {
      if (!currentBotEl) return false
      const more = streamer.tick()
      if (!more) scroll.setStreaming(false)
      return more
    },
    sendUserMessage(text?: string): void {
      const prompt = text ?? nextPrompt()
      const segments =
        TURN_SEGMENTS[(promptIdx - 1) % TURN_SEGMENTS.length] ??
        TURN_SEGMENTS[0]!
      const key = ++turnKey
      setTurns((cur) => [...cur, { key, prompt }])
      // Wait one frame so the new turn is in the DOM, then pin the user
      // and start streaming.
      requestAnimationFrame(() => {
        const userEl = listEl?.querySelector<HTMLElement>(
          `[data-turn-key="${key}"] [data-test="user-msg"]`,
        )
        const botEl = listEl?.querySelector<HTMLElement>(
          `[data-turn-key="${key}"] [data-test="bot-msg"]`,
        )
        if (!userEl || !botEl) return
        currentBotEl = botEl
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
      containerEl?.scrollBy({ top: px, behavior: 'smooth' })
    },
    toggleBlock(index: number, open?: boolean): void {
      const el = listEl?.querySelector<HTMLElement>(
        `.block[data-block-index="${index}"]`,
      )
      if (!el) return
      setBlockOpen(el, open ?? el.dataset.open !== 'true')
    },
    expandBlock(index: number): void {
      const el = listEl?.querySelector<HTMLElement>(
        `.block[data-block-index="${index}"]`,
      )
      if (el) setBlockOpen(el, true)
    },
    collapseBlock(index: number): void {
      const el = listEl?.querySelector<HTMLElement>(
        `.block[data-block-index="${index}"]`,
      )
      if (el) setBlockOpen(el, false)
    },
    setScrollBehavior(behavior): void {
      playback.setScrollBehavior(behavior)
    },
    showCue,
  }
  window.__demo = api
  onCleanup(() => {
    delete window.__demo
  })

  // The streaming exchange demonstrates expandable thinking + tool
  // blocks, which need an imperative target element. For prior turns
  // we render plain text reactively; for the live bot bubble we render
  // an empty <div> and let the streamer write into it.
  const priors: PriorTurn[] = [...PRIOR_TURNS]

  return (
    <div
      class="chat"
      classList={{ 'chat--show-gutter': playback.showGutter() }}
      data-scenario="pin-to-top"
      style={{ position: 'relative' }}
    >
      <div class="status" data-test="status">
        {formatState('pin-to-top', scroll.state())}
      </div>
      <div class="chat__scroll" data-test="scroll" ref={captureContainer}>
        <div class="chat__list" data-test="list" ref={captureList}>
          <For each={priors}>
            {(t) => (
              <div
                class={t.role === 'user' ? 'msg msg--user' : 'msg msg--bot'}
                data-test={t.role === 'user' ? 'user-msg' : 'bot-msg'}
              >
                {t.text}
              </div>
            )}
          </For>
          <For each={turns()}>
            {(turn) => (
              <div data-turn-key={turn.key} style={{ display: 'contents' }}>
                <div class="msg msg--user" data-test="user-msg">
                  {turn.prompt}
                </div>
                <div class="msg msg--bot" data-test="bot-msg" />
              </div>
            )}
          </For>
        </div>
        <div data-chat-scroll-gutter="" />
      </div>
      <button
        class="fab"
        classList={{ 'fab--visible': !scroll.state().atBottom }}
        data-test="fab"
        aria-label="Scroll to latest"
        onClick={() => scroll.scrollToBottom()}
      >
        ↓
      </button>
      <div class="controls">
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

// Re-export for clarity — `expandSegments` is part of the public shared
// surface and is referenced by the test setup.
export { expandSegments }
