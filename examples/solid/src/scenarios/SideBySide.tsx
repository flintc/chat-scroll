import { createSignal, For, onCleanup, onMount } from 'solid-js'
import { createChatScroll } from '@chat-scroll/solid'
import {
  ASSISTANT_SEGMENTS,
  PRIOR_TURNS,
  USER_PROMPT,
  createBotStreamer,
  formatState,
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
  key: number
  prompt: string
}

/**
 * Side-by-side strategy comparison: pin-to-top (left) and
 * stick-to-bottom (right) stream the same canonical exchange in
 * parallel so the viewer can see how each renders the same content.
 */
export function SideBySide() {
  const priors: PriorTurn[] = [...PRIOR_TURNS]
  const [turns, setTurns] = createSignal<TurnEntry[]>([])
  let turnKey = 0
  let pinListEl: HTMLElement | null = null
  let stickListEl: HTMLElement | null = null
  let pinContainerEl: HTMLElement | null = null
  let pinBotEl: HTMLElement | null = null
  let stickBotEl: HTMLElement | null = null
  let following = true
  const pinStreamer = createBotStreamer()
  const stickStreamer = createBotStreamer()

  const pin = createChatScroll({ strategy: 'pin-to-top' })
  const stick = createChatScroll({
    strategy: 'stick-to-bottom',
    scrollBehavior: 'instant',
  })

  function capturePinContainer(el: HTMLElement) {
    pinContainerEl = el
    pin.containerRef(el)
  }
  function capturePinList(el: HTMLElement) {
    pinListEl = el
    pin.contentRef(el)
  }
  function captureStickList(el: HTMLElement) {
    stickListEl = el
    stick.contentRef(el)
  }

  const playback = usePlayback({
    initialIntervalMs: 140,
    initialBehavior: 'smooth',
    supportsGutter: true,
    tick: () => api.tick(),
    onBehaviorChange: (b) => pin.instance.setOptions({ scrollBehavior: b }),
    onDurationChange: (ms) =>
      pin.instance.setOptions({ scrollDurationMs: ms }),
    isEnabled: () => pin.state().streaming,
  })

  // FAB visibility for the pin panel — driven by both scroll events
  // and content-resize events. Computed from raw measurements so the
  // synthetic gutter (which inflates scrollHeight during the pin
  // animation) doesn't briefly fight us.
  const [pinFabVisible, setPinFabVisible] = createSignal(false)
  function updatePinFab(): void {
    if (!pinContainerEl || !pinListEl) {
      setPinFabVisible(false)
      return
    }
    setPinFabVisible(
      pinListEl.scrollHeight >
        pinContainerEl.scrollTop + pinContainerEl.clientHeight + 40,
    )
  }

  onMount(() => {
    const off1 = pin.instance.subscribe(() => playback.refresh())
    const off2 = stick.instance.subscribe((s) => {
      if (!s.locked) following = false
    })
    requestAnimationFrame(() => stick.scrollToBottom())
    pinContainerEl?.addEventListener('scroll', updatePinFab, { passive: true })
    let ro: ResizeObserver | null = null
    if (pinListEl) {
      ro = new ResizeObserver(updatePinFab)
      ro.observe(pinListEl)
    }
    updatePinFab()
    onCleanup(() => {
      off1()
      off2()
      pinContainerEl?.removeEventListener('scroll', updatePinFab)
      ro?.disconnect()
    })
  })

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
      const key = ++turnKey
      setTurns((cur) => [...cur, { key, prompt }])
      requestAnimationFrame(() => {
        const pinUser = pinListEl?.querySelector<HTMLElement>(
          `[data-pin-key="${key}"] [data-test="user-msg"]`,
        )
        pinBotEl = pinListEl?.querySelector<HTMLElement>(
          `[data-pin-key="${key}"] [data-test="bot-msg"]`,
        ) ?? null
        stickBotEl = stickListEl?.querySelector<HTMLElement>(
          `[data-stick-key="${key}"] [data-test="bot-msg"]`,
        ) ?? null
        if (!pinUser || !pinBotEl || !stickBotEl) return
        pinStreamer.reset(pinBotEl, ASSISTANT_SEGMENTS)
        stickStreamer.reset(stickBotEl, ASSISTANT_SEGMENTS)
        pin.setStreaming(true)
        stick.setStreaming(true)
        pin.instance.pinMessage(pinUser)
        if (following) stick.lock()
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
  window.__demo = api
  onCleanup(() => {
    delete window.__demo
  })

  return (
    <div class="chat" data-scenario="side-by-side">
      <div
        class="panel"
        classList={{ 'chat--show-gutter': playback.showGutter() }}
        data-test="panel-pin"
      >
        <div class="panel__title">Pin to top</div>
        <div class="status" data-test="status-pin">
          {formatState('pin-to-top', pin.state())}
        </div>
        <div
          class="chat__scroll"
          data-test="scroll-pin"
          ref={capturePinContainer}
        >
          <div class="chat__list" data-test="list-pin" ref={capturePinList}>
            <For each={priors}>
              {(t) => (
                <div
                  class={t.role === 'user' ? 'msg msg--user' : 'msg msg--bot'}
                >
                  {t.text}
                </div>
              )}
            </For>
            <For each={turns()}>
              {(turn) => (
                <div data-pin-key={turn.key} style={{ display: 'contents' }}>
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
          classList={{ 'fab--visible': pinFabVisible() }}
          data-test="fab-pin"
          aria-label="Scroll to latest"
          onClick={() => pin.scrollToBottom()}
        >
          ↓
        </button>
      </div>
      <div class="panel" data-test="panel-stick">
        <div class="panel__title">Stick to bottom</div>
        <div class="status" data-test="status-stick">
          {formatState('stick-to-bottom', stick.state())}
        </div>
        <div class="chat__scroll" data-test="scroll-stick" ref={stick.containerRef}>
          <div class="chat__list" data-test="list-stick" ref={captureStickList}>
            <For each={priors}>
              {(t) => (
                <div
                  class={t.role === 'user' ? 'msg msg--user' : 'msg msg--bot'}
                >
                  {t.text}
                </div>
              )}
            </For>
            <For each={turns()}>
              {(turn) => (
                <div data-stick-key={turn.key} style={{ display: 'contents' }}>
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
          classList={{ 'fab--visible': !stick.state().atBottom }}
          data-test="fab"
          aria-label="Scroll to bottom"
          onClick={() => {
            following = true
            stick.lock()
          }}
        >
          ↓
        </button>
      </div>
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
        <PlaybackControls playback={playback} />
      </div>
    </div>
  )
}
