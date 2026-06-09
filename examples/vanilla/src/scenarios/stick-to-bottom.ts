import { createChatScroll } from '@chat-scroll/core'
import {
  ASSISTANT_SEGMENTS,
  createPlaybackController,
  formatState,
  PRIOR_TURNS,
  showCue,
  USER_PROMPT,
  type DemoApi,
} from '@chat-scroll/example-shared'
import { mountPlaybackBar } from '../playback-bar'
import { createBotStreamer } from '@chat-scroll/example-shared'

export function mountStickToBottom(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="chat" data-scenario="stick-to-bottom" style="position:relative;">
      <div class="status" data-test="status"></div>
      <div class="chat__scroll" data-test="scroll">
        <div class="chat__list" data-test="list"></div>
      </div>
      <button class="fab" data-test="fab" aria-label="Scroll to bottom">↓</button>
      <div class="controls">
        <button data-test="send">Append message</button>
        <button data-test="scroll-up">Simulate scroll up</button>
      </div>
    </div>
  `

  const container = root.querySelector<HTMLElement>('[data-test="scroll"]')!
  const list = root.querySelector<HTMLElement>('[data-test="list"]')!
  const status = root.querySelector<HTMLElement>('[data-test="status"]')!
  const fab = root.querySelector<HTMLButtonElement>('[data-test="fab"]')!
  const sendBtn = root.querySelector<HTMLButtonElement>('[data-test="send"]')!
  const upBtn = root.querySelector<HTMLButtonElement>('[data-test="scroll-up"]')!
  const controls = root.querySelector<HTMLElement>('.controls')!

  const scroll = createChatScroll({
    strategy: 'stick-to-bottom',
    scrollBehavior: 'instant',
  })
  scroll.mount(container, list)

  for (const turn of PRIOR_TURNS) {
    const el = document.createElement('div')
    el.className = turn.role === 'user' ? 'msg msg--user' : 'msg msg--bot'
    el.textContent = turn.text
    list.appendChild(el)
  }
  // Defer initial scroll-to-bottom — playback strip may wrap on
  // first paint and shift the chat clientHeight.
  requestAnimationFrame(() => scroll.scrollToBottom())

  let currentBot: HTMLElement | null = null
  let streaming = false
  let following = true
  const streamer = createBotStreamer()

  const playback = createPlaybackController({
    initialIntervalMs: 130,
    initialBehavior: 'instant',
    tick: () => api.tick(),
    onBehaviorChange: (b) => scroll.setOptions({ scrollBehavior: b }),
    onDurationChange: (ms) => scroll.setOptions({ scrollDurationMs: ms }),
    isEnabled: () => streaming,
  })
  const offBar = mountPlaybackBar(controls, playback)

  function render(): void {
    status.textContent = formatState('stick-to-bottom', scroll.state)
    fab.classList.toggle('fab--visible', !scroll.state.atBottom)
  }
  scroll.subscribe((s) => {
    if (!s.locked) following = false
    render()
  })
  render()

  const api: DemoApi = {
    tick(): boolean {
      if (!currentBot) {
        currentBot = document.createElement('div')
        currentBot.className = 'msg msg--bot'
        currentBot.dataset.test = 'bot-msg'
        list.appendChild(currentBot)
        streamer.reset(currentBot, ASSISTANT_SEGMENTS)
      }
      const more = streamer.tick()
      if (following) scroll.lock()
      if (!more) {
        currentBot = null
        streaming = false
        scroll.setStreaming(false)
        playback.refresh()
      }
      return more
    },
    sendUserMessage(text?: string): void {
      const userEl = document.createElement('div')
      userEl.className = 'msg msg--user'
      userEl.dataset.test = 'user-msg'
      userEl.textContent = text ?? USER_PROMPT
      list.appendChild(userEl)
      currentBot = null
      // Flip the streaming gate BEFORE the caller invokes playback.start.
      // Otherwise the playback's `isEnabled` gate (which reads this flag)
      // stays false on `start`, no timer fires, `tick` never runs, and
      // streaming never starts — a chicken-and-egg.
      streaming = true
      scroll.setStreaming(true)
      if (following) scroll.lock()
    },
    finishStream(): void {
      streamer.finish()
      currentBot = null
      streaming = false
      scroll.setStreaming(false)
      playback.stop()
    },
    scrollByPx(px: number): void {
      following = false
      container.scrollBy({ top: px, behavior: 'smooth' })
    },
    setScrollBehavior(behavior): void {
      playback.setScrollBehavior(behavior)
    },
    showCue,
  }
  window.__demo = api

  sendBtn.addEventListener('click', () => {
    api.sendUserMessage()
    playback.start()
  })
  upBtn.addEventListener('click', () => api.scrollByPx?.(-300))
  fab.addEventListener('click', () => {
    following = true
    scroll.lock()
  })

  return () => {
    offBar()
    playback.destroy()
    delete window.__demo
    scroll.destroy()
    root.innerHTML = ''
  }
}
