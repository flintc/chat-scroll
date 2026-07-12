import { createChatScroll, type ScrollPosition } from '@chat-scroll/core'
import {
  ASSISTANT_SEGMENTS,
  createPlaybackController,
  formatState,
  appendTurnText,
  PRIOR_TURNS,
  showCue,
  USER_PROMPT,
  type BotSegment,
  type DemoApi,
} from '@chat-scroll/example-shared'
import { mountPlaybackBar } from '../playback-bar'
import { createBotStreamer } from '@chat-scroll/example-shared'

interface Thread {
  id: string
  title: string
  /** Pre-rendered DOM nodes — preserves block-index across switches. */
  nodes: HTMLElement[]
  saved: ScrollPosition | null
}

/**
 * Pre-renders the canonical exchange (prior small talk + USER_PROMPT +
 * the full streamed assistant response, including thinking + tool
 * blocks) into a fresh node array. Each thread carries its own copy so
 * switching threads swaps elements without re-streaming.
 */
function buildThread(id: string, title: string): Thread {
  const nodes: HTMLElement[] = []
  for (const turn of PRIOR_TURNS) {
    const el = document.createElement('div')
    el.className = turn.role === 'user' ? 'msg msg--user' : 'msg msg--bot'
    appendTurnText(el, turn.role, turn.text)
    nodes.push(el)
  }
  const u = document.createElement('div')
  u.className = 'msg msg--user'
  u.dataset.test = 'user-msg'
  u.textContent = USER_PROMPT
  nodes.push(u)

  const bot = document.createElement('div')
  bot.className = 'msg msg--bot'
  bot.dataset.test = 'bot-msg'
  nodes.push(bot)
  // Drain the streamer into the bot bubble instantly.
  const s = createBotStreamer()
  s.reset(bot, ASSISTANT_SEGMENTS as readonly BotSegment[])
  s.finish()
  return { id, title, nodes, saved: null }
}

function makeThreads(): Thread[] {
  return [
    buildThread('t1', 'About scroll'),
    buildThread('t2', 'Same convo, retry'),
    buildThread('t3', 'Yet another'),
  ]
}

export function mountThreadSwitch(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="chat" data-scenario="thread-switch" style="position:relative;">
      <div class="threads" data-test="threads"></div>
      <div class="status" data-test="status"></div>
      <div class="chat__scroll" data-test="scroll">
        <div class="chat__list" data-test="list"></div>
      </div>
      <button class="fab" data-test="fab" aria-label="Scroll to bottom">↓</button>
      <div class="controls">
        <button data-test="scroll-up">Scroll up a bit</button>
      </div>
    </div>
  `

  const container = root.querySelector<HTMLElement>('[data-test="scroll"]')!
  const list = root.querySelector<HTMLElement>('[data-test="list"]')!
  const status = root.querySelector<HTMLElement>('[data-test="status"]')!
  const threadsBar = root.querySelector<HTMLElement>('[data-test="threads"]')!
  const upBtn = root.querySelector<HTMLButtonElement>(
    '[data-test="scroll-up"]',
  )!
  const fab = root.querySelector<HTMLButtonElement>('[data-test="fab"]')!
  const controls = root.querySelector<HTMLElement>('.controls')!

  const scroll = createChatScroll({
    strategy: 'stick-to-bottom',
    scrollBehavior: 'instant',
  })
  scroll.mount(container, list)

  const threads = makeThreads()
  let activeId: string = threads[0]?.id ?? 't1'

  // No streaming in this demo — playback controls are still rendered so
  // every scenario surface is consistent. They just don't have anything
  // to tick.
  const playback = createPlaybackController({
    initialIntervalMs: 140,
    initialBehavior: 'instant',
    tick: () => false,
    onBehaviorChange: (b) => scroll.setOptions({ scrollBehavior: b }),
    onDurationChange: (ms) => scroll.setOptions({ scrollDurationMs: ms }),
    isEnabled: () => false,
  })
  const offBar = mountPlaybackBar(controls, playback)

  function renderThreadsBar(): void {
    threadsBar.innerHTML = ''
    threads.forEach((t) => {
      const btn = document.createElement('button')
      btn.textContent = t.title
      btn.dataset.test = `thread-${t.id}`
      if (t.id === activeId) btn.classList.add('active')
      btn.addEventListener('click', () => switchTo(t.id))
      threadsBar.appendChild(btn)
    })
  }

  function renderMessages(t: Thread): void {
    list.innerHTML = ''
    for (const n of t.nodes) list.appendChild(n)
  }

  function renderStatus(): void {
    const t = threads.find((x) => x.id === activeId)
    const extra = `thread: ${t?.title ?? '?'} · scrollTop: ${container.scrollTop}`
    status.textContent = formatState('stick-to-bottom', scroll.state, extra)
    fab.classList.toggle('fab--visible', !scroll.state.atBottom)
  }
  scroll.subscribe(renderStatus)
  container.addEventListener('scroll', renderStatus, { passive: true })
  fab.addEventListener('click', () => scroll.scrollToBottom())

  function switchTo(id: string): void {
    if (id === activeId) return
    const prev = threads.find((x) => x.id === activeId)
    if (prev) prev.saved = scroll.savePosition()
    activeId = id
    const next = threads.find((x) => x.id === id)
    if (!next) return
    renderMessages(next)
    scroll.reset()
    if (next.saved && !next.saved.wasAtBottom) {
      // Release the lock so the ResizeObserver doesn't snap to bottom
      // before our restore runs on the next frame.
      scroll.unlock()
      requestAnimationFrame(() => {
        if (next.saved) scroll.restorePosition(next.saved)
        renderStatus()
      })
    } else {
      scroll.scrollToBottom()
    }
    renderThreadsBar()
    renderStatus()
  }

  renderThreadsBar()
  const initial = threads[0]
  if (initial) {
    renderMessages(initial)
    requestAnimationFrame(() => scroll.scrollToBottom())
  }
  renderStatus()

  const api: DemoApi = {
    tick: () => false,
    sendUserMessage: () => {},
    finishStream: () => {},
    switchThread(index: number): void {
      const t = threads[index]
      if (t) switchTo(t.id)
    },
    scrollByPx(px: number): void {
      container.scrollBy({ top: px, behavior: 'smooth' })
    },
    setScrollBehavior(behavior): void {
      playback.setScrollBehavior(behavior)
    },
    showCue,
  }
  window.__demo = api

  upBtn.addEventListener('click', () => api.scrollByPx?.(-200))

  return () => {
    container.removeEventListener('scroll', renderStatus)
    offBar()
    playback.destroy()
    delete window.__demo
    scroll.destroy()
    root.innerHTML = ''
  }
}
