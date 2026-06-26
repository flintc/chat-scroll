import { createChatScroll } from '@chat-scroll/core'
import {
  createPlaybackController,
  formatState,
  appendTurnText,
  PRIOR_TURNS,
  setBlockOpen,
  showCue,
  TURN_PROMPTS,
  TURN_SEGMENTS,
  USER_PROMPT,
  type DemoApi,
} from '@chat-scroll/example-shared'
import { mountPlaybackBar } from '../playback-bar'
import { createBotStreamer } from '@chat-scroll/example-shared'

export function mountPinToTop(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="chat" data-scenario="pin-to-top" style="position:relative;">
      <div class="status" data-test="status">strategy: pin-to-top · streaming: false</div>
      <div class="chat__scroll" data-test="scroll">
        <div class="chat__list" data-test="list"></div>
      </div>
      <button class="fab" data-test="fab" aria-label="Scroll to latest">↓</button>
      <form class="composer" data-test="composer">
        <textarea
          class="composer__input"
          data-test="composer-input"
          rows="1"
          placeholder="Type a message — Enter to send, Shift+Enter for newline"
        ></textarea>
        <button type="submit" class="composer__send" data-test="composer-send">Send</button>
      </form>
      <div class="controls">
        <button data-test="send">Send canned prompt</button>
        <button data-test="finish">Finish stream</button>
        <button data-test="prev-user" aria-label="Previous user message">▲ Prev</button>
        <button data-test="next-user" aria-label="Next user message">▼ Next</button>
      </div>
    </div>
  `

  const chat = root.querySelector<HTMLElement>('.chat')!
  const container = root.querySelector<HTMLElement>('[data-test="scroll"]')!
  const list = root.querySelector<HTMLElement>('[data-test="list"]')!
  const status = root.querySelector<HTMLElement>('[data-test="status"]')!
  const fab = root.querySelector<HTMLButtonElement>('[data-test="fab"]')!
  const sendBtn = root.querySelector<HTMLButtonElement>('[data-test="send"]')!
  const finishBtn = root.querySelector<HTMLButtonElement>(
    '[data-test="finish"]',
  )!
  const prevUserBtn = root.querySelector<HTMLButtonElement>(
    '[data-test="prev-user"]',
  )!
  const nextUserBtn = root.querySelector<HTMLButtonElement>(
    '[data-test="next-user"]',
  )!
  const controls = root.querySelector<HTMLElement>('.controls')!
  const composer = root.querySelector<HTMLFormElement>(
    '[data-test="composer"]',
  )!
  const composerInput = root.querySelector<HTMLTextAreaElement>(
    '[data-test="composer-input"]',
  )!

  const scroll = createChatScroll({ strategy: 'pin-to-top' })
  scroll.mount(container, list)

  for (const turn of PRIOR_TURNS) {
    const el = document.createElement('div')
    el.className = turn.role === 'user' ? 'msg msg--user' : 'msg msg--bot'
    el.dataset.test = turn.role === 'user' ? 'user-msg' : 'bot-msg'
    appendTurnText(el, turn.role, turn.text)
    list.appendChild(el)
  }

  let promptIdx = 0
  let currentBot: HTMLElement | null = null
  const streamer = createBotStreamer()

  const playback = createPlaybackController({
    initialIntervalMs: 140,
    initialBehavior: 'smooth',
    supportsGutter: true,
    tick: () => api.tick(),
    onBehaviorChange: (b) => scroll.setOptions({ scrollBehavior: b }),
    onDurationChange: (ms) => scroll.setOptions({ scrollDurationMs: ms }),
    isEnabled: () => scroll.state.streaming,
  })
  const offBar = mountPlaybackBar(controls, playback)

  // Reflect the show-gutter toggle as a class on the chat root and
  // surface a px readout while streaming. The CSS picks up
  // `.chat--show-gutter [data-chat-scroll-gutter]` to overlay the
  // gutter element so viewers can watch it shrink.
  function gutterHeight(): number {
    const g = container.querySelector<HTMLElement>(
      '[data-chat-scroll-gutter]',
    )
    if (!g) return 0
    return parseInt(g.style.height || '0', 10)
  }
  playback.subscribe((s) => {
    chat.classList.toggle('chat--show-gutter', s.showGutter)
  })

  function hasContentBelow(): boolean {
    return (
      list.scrollHeight > container.scrollTop + container.clientHeight + 40
    )
  }
  function render(): void {
    const extra = playback.state.showGutter
      ? `gutter: ${gutterHeight()}px`
      : undefined
    status.textContent = formatState('pin-to-top', scroll.state, extra)
    fab.classList.toggle('fab--visible', hasContentBelow())
  }
  scroll.subscribe(() => {
    playback.refresh()
    render()
  })
  playback.subscribe(render)
  container.addEventListener('scroll', render, { passive: true })
  const contentObserver = new ResizeObserver(render)
  contentObserver.observe(list)
  // rAF-driven readout while streaming so the px value updates between
  // resize events. Cheap when not streaming (we just don't enqueue).
  let raf: number | null = null
  function rafTick(): void {
    if (scroll.state.streaming && playback.state.showGutter) {
      render()
      raf = requestAnimationFrame(rafTick)
    } else {
      raf = null
    }
  }
  scroll.subscribe(() => {
    if (raf === null && scroll.state.streaming && playback.state.showGutter) {
      raf = requestAnimationFrame(rafTick)
    }
  })
  render()
  fab.addEventListener('click', () => scroll.scrollToBottom())

  function appendUser(text: string): HTMLElement {
    const el = document.createElement('div')
    el.className = 'msg msg--user'
    el.dataset.test = 'user-msg'
    el.textContent = text
    list.appendChild(el)
    return el
  }
  function appendBot(): HTMLElement {
    const el = document.createElement('div')
    el.className = 'msg msg--bot'
    el.dataset.test = 'bot-msg'
    list.appendChild(el)
    return el
  }

  const api: DemoApi = {
    tick(): boolean {
      if (!currentBot) return false
      const more = streamer.tick()
      if (!more) scroll.setStreaming(false)
      return more
    },
    sendUserMessage(text?: string): void {
      const prompt =
        text ?? TURN_PROMPTS[promptIdx % TURN_PROMPTS.length] ?? USER_PROMPT
      const segments =
        TURN_SEGMENTS[promptIdx % TURN_SEGMENTS.length] ?? TURN_SEGMENTS[0]!
      promptIdx += 1
      const userEl = appendUser(prompt)
      currentBot = appendBot()
      streamer.reset(currentBot, segments)
      scroll.setStreaming(true)
      scroll.pinMessage(userEl)
    },
    finishStream(): void {
      streamer.finish()
      scroll.setStreaming(false)
      playback.stop()
    },
    scrollByPx(px: number): void {
      container.scrollBy({ top: px, behavior: 'smooth' })
    },
    toggleBlock(index: number, open?: boolean): void {
      const el = list.querySelector<HTMLElement>(
        `.block[data-block-index="${index}"]`,
      )
      if (!el) return
      const next = open ?? el.dataset.open !== 'true'
      setBlockOpen(el, next)
    },
    expandBlock(index: number): void {
      const el = list.querySelector<HTMLElement>(
        `.block[data-block-index="${index}"]`,
      )
      if (el) setBlockOpen(el, true)
    },
    collapseBlock(index: number): void {
      const el = list.querySelector<HTMLElement>(
        `.block[data-block-index="${index}"]`,
      )
      if (el) setBlockOpen(el, false)
    },
    setScrollBehavior(behavior): void {
      playback.setScrollBehavior(behavior)
    },
    setPinClamp(clamp): void {
      scroll.setOptions({ pinClamp: clamp })
    },
    showCue,
  }
  window.__demo = api

  sendBtn.addEventListener('click', () => {
    api.sendUserMessage()
    playback.start()
  })
  finishBtn.addEventListener('click', () => api.finishStream())
  prevUserBtn.addEventListener('click', () =>
    scroll.pinRelative('[data-test="user-msg"]', -1),
  )
  nextUserBtn.addEventListener('click', () =>
    scroll.pinRelative('[data-test="user-msg"]', 1),
  )

  // Auto-grow the textarea by re-measuring scrollHeight on every input.
  // Capped at 200px in CSS via max-height; beyond that the textarea
  // scrolls internally instead of pushing the chat further up.
  function autogrow(): void {
    composerInput.style.height = 'auto'
    composerInput.style.height = `${composerInput.scrollHeight}px`
  }
  composerInput.addEventListener('input', autogrow)

  function submitComposer(): void {
    const text = composerInput.value.trim()
    if (!text) return
    api.sendUserMessage(text)
    composerInput.value = ''
    autogrow()
    playback.start()
  }
  composer.addEventListener('submit', (ev) => {
    ev.preventDefault()
    submitComposer()
  })
  // Enter submits, Shift+Enter inserts a newline (standard chat UX).
  composerInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
      ev.preventDefault()
      submitComposer()
    }
  })

  return () => {
    if (raf !== null) cancelAnimationFrame(raf)
    container.removeEventListener('scroll', render)
    contentObserver.disconnect()
    offBar()
    playback.destroy()
    delete window.__demo
    scroll.destroy()
    root.innerHTML = ''
  }
}
