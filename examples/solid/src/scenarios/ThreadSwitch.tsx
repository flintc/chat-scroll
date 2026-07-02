import { createSignal, For, onCleanup, onMount } from 'solid-js'
import { createChatScroll } from '@chat-scroll/solid'
import type { ScrollPosition } from '@chat-scroll/core'
import {
  ASSISTANT_CHUNKS,
  PRIOR_TURNS,
  USER_PROMPT,
  formatState,
  showCue,
  type DemoApi,
} from '@chat-scroll/example-shared'
import { scrollToBottomOnMount } from '../scroll-helpers'
import { PlaybackControls } from '../PlaybackControls'
import { usePlayback } from '../use-playback'

interface Msg {
  role: 'user' | 'bot'
  text: string
}

interface Thread {
  id: string
  title: string
  messages: Msg[]
  saved: ScrollPosition | null
}

function makeThreads(): Thread[] {
  const canonical: Msg[] = [
    ...PRIOR_TURNS,
    { role: 'user', text: USER_PROMPT },
    { role: 'bot', text: ASSISTANT_CHUNKS.join('') },
  ]
  return [
    { id: 't1', title: 'About scroll', messages: canonical.slice(), saved: null },
    { id: 't2', title: 'Same convo, retry', messages: canonical.slice(), saved: null },
    { id: 't3', title: 'Yet another', messages: canonical.slice(), saved: null },
  ]
}

export function ThreadSwitch() {
  const scroll = createChatScroll({
    strategy: 'stick-to-bottom',
    scrollBehavior: 'instant',
  })
  const threads = makeThreads()
  const [activeId, setActiveId] = createSignal(threads[0]?.id ?? 't1')
  const [tick, setTick] = createSignal(0)
  let containerEl: HTMLElement | null = null

  function captureContainer(el: HTMLElement) {
    containerEl = el
    scroll.containerRef(el)
  }

  function active(): Thread | undefined {
    const id = activeId()
    return threads.find((t) => t.id === id)
  }

  function switchTo(id: string) {
    const prev = active()
    if (prev) prev.saved = scroll.savePosition()
    if (id === activeId()) return
    setActiveId(id)
    setTick((n) => n + 1)
    scroll.reset()
    const next = threads.find((t) => t.id === id)
    if (!next) return
    if (next.saved && !next.saved.wasAtBottom) {
      scroll.unlock()
      const saved = next.saved
      requestAnimationFrame(() => {
        scroll.restorePosition(saved)
      })
    } else {
      requestAnimationFrame(() => scroll.scrollToBottom())
    }
  }

  scrollToBottomOnMount(scroll)

  // No streaming — playback bar is rendered (so every scenario has the
  // same controls) but tick is a no-op.
  const playback = usePlayback({
    initialIntervalMs: 140,
    initialBehavior: 'instant',
    tick: () => false,
    onBehaviorChange: (b) => scroll.instance.setOptions({ scrollBehavior: b }),
    onDurationChange: (ms) => scroll.instance.setOptions({ scrollDurationMs: ms }),
    isEnabled: () => false,
  })

  onMount(() => {
    const off = scroll.instance.subscribe(() => playback.refresh())
    onCleanup(off)
  })

  const api: DemoApi = {
    tick: () => false,
    sendUserMessage: () => {},
    finishStream: () => {},
    switchThread(index: number) {
      const t = threads[index]
      if (t) switchTo(t.id)
    },
    scrollByPx(px: number) {
      if (containerEl) containerEl.scrollTop = containerEl.scrollTop + px
    },
    setScrollBehavior: (b) => playback.setScrollBehavior(b),
    showCue,
  }
  window.__demo = api
  onCleanup(() => {
    delete window.__demo
  })

  void tick

  return (
    <div
      class="chat"
      data-scenario="thread-switch"
      style={{ position: 'relative' }}
    >
      <div class="threads" data-test="threads">
        <For each={threads}>
          {(t) => (
            <button
              data-test={`thread-${t.id}`}
              classList={{ active: activeId() === t.id }}
              onClick={() => switchTo(t.id)}
            >
              {t.title}
            </button>
          )}
        </For>
      </div>
      <div class="status" data-test="status">
        {formatState(
          'stick-to-bottom',
          scroll.state(),
          `thread: ${active()?.title ?? '?'}`,
        )}
      </div>
      <div class="chat__scroll" data-test="scroll" ref={captureContainer}>
        <div class="chat__list" data-test="list" ref={scroll.contentRef}>
          <For each={active()?.messages ?? []}>
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
        onClick={() => scroll.scrollToBottom()}
      >
        ↓
      </button>
      <div class="controls">
        <button data-test="scroll-up" onClick={() => api.scrollByPx?.(-200)}>
          Scroll up a bit
        </button>
        <PlaybackControls playback={playback} />
      </div>
    </div>
  )
}
