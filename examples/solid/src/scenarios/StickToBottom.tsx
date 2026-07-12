import { For, onCleanup, onMount } from 'solid-js'
import { createChatScroll } from '@chat-scroll/solid'
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

  const scroll = createChatScroll({
    strategy: 'stick-to-bottom',
    scrollBehavior: 'instant',
    streaming: chat.isStreaming,
  })

  scrollToBottomOnMount(scroll)
  const follow = useStickFollow(scroll, { maintainOn: chat.messages })

  let containerEl: HTMLElement | null = null
  function captureContainer(el: HTMLElement) {
    containerEl = el
    scroll.containerRef(el)
  }

  const playback = usePlayback({
    initialIntervalMs: 130,
    initialBehavior: 'instant',
    tick: chat.tick,
    onBehaviorChange: (b) => scroll.instance.setOptions({ scrollBehavior: b }),
    onDurationChange: (ms) => scroll.instance.setOptions({ scrollDurationMs: ms }),
    isEnabled: () => chat.isStreaming(),
  })

  onMount(() => {
    const off = scroll.instance.subscribe(() => playback.refresh())
    onCleanup(off)
  })

  const api: DemoApi = {
    tick: chat.tick,
    sendUserMessage: (text) => chat.submit(text ?? USER_PROMPT),
    finishStream: () => {
      chat.stop()
      playback.stop()
    },
    scrollByPx(px: number) {
      follow.release()
      if (containerEl) containerEl.scrollTop = containerEl.scrollTop + px
    },
    setScrollBehavior: (b) => playback.setScrollBehavior(b),
    showCue,
  }
  window.__demo = api
  onCleanup(() => {
    delete window.__demo
  })

  return (
    <div
      class="chat"
      data-scenario="stick-to-bottom"
      style={{ position: 'relative' }}
    >
      <div class="status" data-test="status">
        {formatState('stick-to-bottom', scroll.state())}
      </div>
      <div class="chat__scroll" data-test="scroll" ref={captureContainer}>
        <div class="chat__list" data-test="list" ref={scroll.contentRef}>
          <For each={chat.messages()}>
            {(m) => (
              <div
                class={m.role === 'user' ? 'msg msg--user' : 'msg msg--bot'}
                data-test={m.role === 'user' ? 'user-msg' : 'bot-msg'}
              >
                {m.text}
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
        aria-label="Scroll to bottom"
        onClick={follow.resume}
      >
        ↓
      </button>
      <div class="controls">
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
