import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useChatScroll } from '@chat-scroll/react'
import type { ScrollPosition } from '@chat-scroll/core'
import {
  ASSISTANT_CHUNKS,
  PRIOR_TURNS,
  USER_PROMPT,
  formatState,
  showCue,
  type DemoApi,
} from '@chat-scroll/example-shared'
import { useScrollToBottomOnMount } from '../scroll-helpers'
import { PlaybackControls } from '../PlaybackControls'
import { usePlayback } from '../use-playback'

interface Msg {
  id: string
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
    { role: 'user' as const, text: USER_PROMPT },
    { role: 'bot' as const, text: ASSISTANT_CHUNKS.join('') },
  ].map((m, i) => ({ ...m, id: `m${i}` }))
  return [
    { id: 't1', title: 'About scroll', messages: canonical.slice(), saved: null },
    { id: 't2', title: 'Same convo, retry', messages: canonical.slice(), saved: null },
    { id: 't3', title: 'Yet another', messages: canonical.slice(), saved: null },
  ]
}

export function ThreadSwitch() {
  const scroll = useChatScroll({
    strategy: 'stick-to-bottom',
    scrollBehavior: 'instant',
  })
  // Threads live for the component's lifetime — `saved` positions are
  // mutated in place on every switch.
  const [threads] = useState(makeThreads)
  const [activeId, setActiveId] = useState(threads[0]?.id ?? 't1')
  const containerElRef = useRef<HTMLElement | null>(null)

  const { containerRef, contentRef } = scroll
  const captureContainer = useCallback(
    (el: HTMLElement | null) => {
      containerElRef.current = el
      containerRef(el)
    },
    [containerRef],
  )

  const active = threads.find((t) => t.id === activeId)

  function switchTo(id: string) {
    if (active) active.saved = scroll.savePosition()
    if (id === activeId) return
    // Commit the new thread's messages to the DOM synchronously so the
    // rAF below measures the new content.
    flushSync(() => setActiveId(id))
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

  useScrollToBottomOnMount(scroll)

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

  const { instance, state } = scroll
  const { refresh: refreshPlayback } = playback
  useEffect(
    () => instance.subscribe(() => refreshPlayback()),
    [instance, refreshPlayback],
  )

  const api: DemoApi = {
    tick: () => false,
    sendUserMessage: () => {},
    finishStream: () => {},
    switchThread(index: number) {
      const t = threads[index]
      if (t) switchTo(t.id)
    },
    scrollByPx(px: number) {
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
      data-scenario="thread-switch"
      style={{ position: 'relative' }}
    >
      <div className="threads" data-test="threads">
        {threads.map((t) => (
          <button
            key={t.id}
            data-test={`thread-${t.id}`}
            className={activeId === t.id ? 'active' : undefined}
            onClick={() => switchTo(t.id)}
          >
            {t.title}
          </button>
        ))}
      </div>
      <div className="status" data-test="status">
        {formatState(
          'stick-to-bottom',
          state,
          `thread: ${active?.title ?? '?'}`,
        )}
      </div>
      <div className="chat__scroll" data-test="scroll" ref={captureContainer}>
        <div className="chat__list" data-test="list" ref={contentRef}>
          {(active?.messages ?? []).map((m) => (
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
        className={state.atBottom ? 'fab' : 'fab fab--visible'}
        data-test="fab"
        aria-label="Scroll to bottom"
        onClick={() => scroll.scrollToBottom()}
      >
        ↓
      </button>
      <div className="controls">
        <button data-test="scroll-up" onClick={() => api.scrollByPx?.(-200)}>
          Scroll up a bit
        </button>
        <PlaybackControls playback={playback} />
      </div>
    </div>
  )
}
