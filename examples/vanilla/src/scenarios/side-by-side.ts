import { createChatScroll } from '@chat-scroll/core'
import {
  ASSISTANT_SEGMENTS,
  createPlaybackController,
  formatState,
  appendTurnText,
  PRIOR_TURNS,
  showCue,
  USER_PROMPT,
  type DemoApi,
} from '@chat-scroll/example-shared'
import { mountPlaybackBar } from '../playback-bar'
import { createBotStreamer } from '@chat-scroll/example-shared'

/**
 * Two strategies side-by-side streaming the SAME canonical exchange
 * simultaneously. Viewers see directly how pin-to-top (left) and
 * stick-to-bottom (right) render the same content differently.
 */
export function mountSideBySide(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="chat" data-scenario="side-by-side">
      <div class="panel" data-test="panel-pin">
        <div class="panel__title">Pin to top</div>
        <div class="status" data-test="status-pin"></div>
        <div class="chat__scroll" data-test="scroll-pin">
          <div class="chat__list" data-test="list-pin"></div>
        </div>
        <button class="fab" data-test="fab-pin" aria-label="Scroll to latest">↓</button>
      </div>
      <div class="panel" data-test="panel-stick">
        <div class="panel__title">Stick to bottom</div>
        <div class="status" data-test="status-stick"></div>
        <div class="chat__scroll" data-test="scroll-stick">
          <div class="chat__list" data-test="list-stick"></div>
        </div>
        <button class="fab" data-test="fab" aria-label="Scroll to bottom">↓</button>
      </div>
      <div class="controls" style="grid-column:1/-1;">
        <button data-test="send">Send next prompt</button>
        <button data-test="finish">Finish stream</button>
      </div>
    </div>
  `

  const containerPin = root.querySelector<HTMLElement>(
    '[data-test="scroll-pin"]',
  )!
  const listPin = root.querySelector<HTMLElement>('[data-test="list-pin"]')!
  const containerStick = root.querySelector<HTMLElement>(
    '[data-test="scroll-stick"]',
  )!
  const listStick = root.querySelector<HTMLElement>('[data-test="list-stick"]')!
  const fab = root.querySelector<HTMLButtonElement>('[data-test="fab"]')!
  const fabPin = root.querySelector<HTMLButtonElement>('[data-test="fab-pin"]')!
  const sendBtn = root.querySelector<HTMLButtonElement>('[data-test="send"]')!
  const finishBtn = root.querySelector<HTMLButtonElement>(
    '[data-test="finish"]',
  )!
  const controls = root.querySelector<HTMLElement>('.controls')!

  const pin = createChatScroll({ strategy: 'pin-to-top' })
  const stick = createChatScroll({
    strategy: 'stick-to-bottom',
    scrollBehavior: 'instant',
  })
  pin.mount(containerPin, listPin)
  stick.mount(containerStick, listStick)

  function seed(list: HTMLElement): void {
    for (const turn of PRIOR_TURNS) {
      const el = document.createElement('div')
      el.className = turn.role === 'user' ? 'msg msg--user' : 'msg msg--bot'
      appendTurnText(el, turn.role, turn.text)
      list.appendChild(el)
    }
  }
  seed(listPin)
  seed(listStick)
  requestAnimationFrame(() => stick.scrollToBottom())

  let pinBotEl: HTMLElement | null = null
  let stickBotEl: HTMLElement | null = null
  let following = true
  const pinStreamer = createBotStreamer()
  const stickStreamer = createBotStreamer()

  const playback = createPlaybackController({
    initialIntervalMs: 140,
    initialBehavior: 'smooth',
    supportsGutter: true,
    tick: () => api.tick(),
    onBehaviorChange: (b) => {
      pin.setOptions({ scrollBehavior: b })
      // Stick stays 'instant' regardless — animated scrolls fight the
      // lock listener. We document this in the demo by keeping the
      // toggle wired only to the pin side.
    },
    onDurationChange: (ms) => pin.setOptions({ scrollDurationMs: ms }),
    isEnabled: () => pin.state.streaming,
  })
  const offBar = mountPlaybackBar(controls, playback)

  // Mirror show-gutter onto the pin panel (stick has no gutter so the
  // toggle has nothing to overlay there).
  const pinPanel = root.querySelector<HTMLElement>('[data-test="panel-pin"]')!
  playback.subscribe((s) => {
    pinPanel.classList.toggle('chat--show-gutter', s.showGutter)
  })

  const statusPin = root.querySelector<HTMLElement>('[data-test="status-pin"]')!
  const statusStick = root.querySelector<HTMLElement>(
    '[data-test="status-stick"]',
  )!

  function pinHasContentBelow(): boolean {
    return (
      listPin.scrollHeight >
      containerPin.scrollTop + containerPin.clientHeight + 40
    )
  }
  function renderFabs(): void {
    fab.classList.toggle('fab--visible', !stick.state.atBottom)
    fabPin.classList.toggle('fab--visible', pinHasContentBelow())
  }
  function renderStatuses(): void {
    statusPin.textContent = formatState('pin-to-top', pin.state)
    statusStick.textContent = formatState('stick-to-bottom', stick.state)
  }
  containerPin.addEventListener('scroll', renderFabs, { passive: true })
  const pinContentObserver = new ResizeObserver(renderFabs)
  pinContentObserver.observe(listPin)
  stick.subscribe((s) => {
    if (!s.locked) following = false
    renderFabs()
    renderStatuses()
  })
  pin.subscribe(() => {
    playback.refresh()
    renderFabs()
    renderStatuses()
  })
  renderFabs()
  renderStatuses()
  fab.addEventListener('click', () => {
    following = true
    stick.lock()
  })
  fabPin.addEventListener('click', () => {
    pin.scrollToBottom()
  })

  function appendUser(list: HTMLElement, text: string): HTMLElement {
    const el = document.createElement('div')
    el.className = 'msg msg--user'
    el.dataset.test = 'user-msg'
    el.textContent = text
    list.appendChild(el)
    return el
  }
  function appendBot(list: HTMLElement): HTMLElement {
    const el = document.createElement('div')
    el.className = 'msg msg--bot'
    el.dataset.test = 'bot-msg'
    list.appendChild(el)
    return el
  }

  const api: DemoApi = {
    tick(): boolean {
      if (!pinBotEl || !stickBotEl) return false
      const pinMore = pinStreamer.tick()
      const stickMore = stickStreamer.tick()
      if (following) stick.lock()
      if (!pinMore && !stickMore) {
        pin.setStreaming(false)
        stick.setStreaming(false)
        return false
      }
      return true
    },
    sendUserMessage(text?: string): void {
      const prompt = text ?? USER_PROMPT
      const pinUserEl = appendUser(listPin, prompt)
      pinBotEl = appendBot(listPin)
      appendUser(listStick, prompt)
      stickBotEl = appendBot(listStick)
      pinStreamer.reset(pinBotEl, ASSISTANT_SEGMENTS)
      stickStreamer.reset(stickBotEl, ASSISTANT_SEGMENTS)
      pin.setStreaming(true)
      stick.setStreaming(true)
      pin.pinMessage(pinUserEl)
      if (following) stick.lock()
    },
    finishStream(): void {
      pinStreamer.finish()
      stickStreamer.finish()
      pin.setStreaming(false)
      stick.setStreaming(false)
      playback.stop()
    },
    scrollByPx(px: number): void {
      containerStick.scrollBy({ top: px, behavior: 'smooth' })
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
  finishBtn.addEventListener('click', () => api.finishStream())

  return () => {
    containerPin.removeEventListener('scroll', renderFabs)
    pinContentObserver.disconnect()
    offBar()
    playback.destroy()
    delete window.__demo
    pin.destroy()
    stick.destroy()
    root.innerHTML = ''
  }
}
