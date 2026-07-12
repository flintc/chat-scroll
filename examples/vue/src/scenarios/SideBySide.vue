<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { useChatScroll } from '@chat-scroll/vue'
import {
  ASSISTANT_SEGMENTS,
  PRIOR_TURNS,
  USER_PROMPT,
  createBotStreamer,
  formatState,
  showCue,
  type DemoApi,
} from '@chat-scroll/example-shared'
import PlaybackControls from '../PlaybackControls.vue'
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
const turns = ref<TurnEntry[]>([])
let turnKey = 0
let pinListEl: HTMLElement | null = null
let stickListEl: HTMLElement | null = null
let pinContainerEl: HTMLElement | null = null
let pinBotEl: HTMLElement | null = null
let stickBotEl: HTMLElement | null = null
let following = true
const pinStreamer = createBotStreamer()
const stickStreamer = createBotStreamer()

const pin = useChatScroll({ strategy: 'pin-to-top' })
const stick = useChatScroll({
  strategy: 'stick-to-bottom',
  scrollBehavior: 'instant',
})

function capturePinContainer(el: Element | ComponentPublicInstance | null) {
  pinContainerEl = el instanceof Element ? (el as HTMLElement) : null
  pin.containerRef(el)
}
function capturePinList(el: Element | ComponentPublicInstance | null) {
  pinListEl = el instanceof Element ? (el as HTMLElement) : null
  pin.contentRef(el)
}
function captureStickList(el: Element | ComponentPublicInstance | null) {
  stickListEl = el instanceof Element ? (el as HTMLElement) : null
  stick.contentRef(el)
}

const playback = usePlayback({
  initialIntervalMs: 140,
  initialBehavior: 'smooth',
  supportsGutter: true,
  tick: () => api.tick(),
  onBehaviorChange: (b) => pin.instance.setOptions({ scrollBehavior: b }),
  onDurationChange: (ms) => pin.instance.setOptions({ scrollDurationMs: ms }),
  isEnabled: () => pin.state.value.streaming,
})

onMounted(() => {
  const off1 = pin.instance.subscribe(() => playback.refresh())
  const off2 = stick.instance.subscribe((s) => {
    if (!s.locked) following = false
  })
  requestAnimationFrame(() => stick.scrollToBottom())
  onBeforeUnmount(() => {
    off1()
    off2()
  })
})

// FAB visibility for the pin panel — driven by both scroll events
// and content-resize events. Computed solely from `scrollHeight -
// scrollTop - clientHeight > threshold` so the synthetic gutter
// (which inflates scrollHeight mid-pin-animation) doesn't fight us.
const pinFabVisible = ref(false)
function updatePinFab() {
  if (!pinContainerEl || !pinListEl) {
    pinFabVisible.value = false
    return
  }
  pinFabVisible.value =
    pinListEl.scrollHeight >
    pinContainerEl.scrollTop + pinContainerEl.clientHeight + 40
}
let pinResizeObs: ResizeObserver | null = null
onMounted(() => {
  pinContainerEl?.addEventListener('scroll', updatePinFab, { passive: true })
  if (pinListEl) {
    pinResizeObs = new ResizeObserver(updatePinFab)
    pinResizeObs.observe(pinListEl)
  }
  updatePinFab()
  onBeforeUnmount(() => {
    pinContainerEl?.removeEventListener('scroll', updatePinFab)
    pinResizeObs?.disconnect()
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
    turns.value = [...turns.value, { key, prompt }]
    requestAnimationFrame(() => {
      const pinUser = pinListEl?.querySelector<HTMLElement>(
        `[data-pin-key="${key}"] [data-test="user-msg"]`,
      )
      pinBotEl =
        pinListEl?.querySelector<HTMLElement>(
          `[data-pin-key="${key}"] [data-test="bot-msg"]`,
        ) ?? null
      stickBotEl =
        stickListEl?.querySelector<HTMLElement>(
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
    const c = document.querySelector<HTMLElement>(
      '[data-test="scroll-stick"]',
    )
    c?.scrollBy({ top: px, behavior: 'smooth' })
  },
  setScrollBehavior: (b) => playback.setScrollBehavior(b),
  showCue,
}
window.__demo = api
onBeforeUnmount(() => {
  delete window.__demo
})
</script>

<template>
  <div
    class="chat"
    data-scenario="side-by-side"
  >
    <div
      class="panel"
      :class="{ 'chat--show-gutter': playback.showGutter.value }"
      data-test="panel-pin"
    >
      <div class="panel__title">
        Pin to top
      </div>
      <div
        class="status"
        data-test="status-pin"
      >
        {{ formatState('pin-to-top', pin.state.value) }}
      </div>
      <div
        :ref="capturePinContainer"
        class="chat__scroll"
        data-test="scroll-pin"
      >
        <div
          :ref="capturePinList"
          class="chat__list"
          data-test="list-pin"
        >
          <template
            v-for="(t, i) in priors"
            :key="`p${i}`"
          >
            <div :class="t.role === 'user' ? 'msg msg--user' : 'msg msg--bot'">
              {{ t.text }}
            </div>
          </template>
          <template
            v-for="turn in turns"
            :key="turn.key"
          >
            <div
              :data-pin-key="turn.key"
              style="display: contents"
            >
              <div
                class="msg msg--user"
                data-test="user-msg"
              >
                {{ turn.prompt }}
              </div>
              <div
                class="msg msg--bot"
                data-test="bot-msg"
              />
            </div>
          </template>
        </div>
        <div data-chat-scroll-gutter />
      </div>
      <button
        class="fab"
        :class="{ 'fab--visible': pinFabVisible }"
        data-test="fab-pin"
        aria-label="Scroll to latest"
        @click="pin.scrollToBottom()"
      >
        ↓
      </button>
    </div>
    <div
      class="panel"
      data-test="panel-stick"
    >
      <div class="panel__title">
        Stick to bottom
      </div>
      <div
        class="status"
        data-test="status-stick"
      >
        {{ formatState('stick-to-bottom', stick.state.value) }}
      </div>
      <div
        :ref="stick.containerRef"
        class="chat__scroll"
        data-test="scroll-stick"
      >
        <div
          :ref="captureStickList"
          class="chat__list"
          data-test="list-stick"
        >
          <template
            v-for="(t, i) in priors"
            :key="`p${i}`"
          >
            <div :class="t.role === 'user' ? 'msg msg--user' : 'msg msg--bot'">
              {{ t.text }}
            </div>
          </template>
          <template
            v-for="turn in turns"
            :key="turn.key"
          >
            <div
              :data-stick-key="turn.key"
              style="display: contents"
            >
              <div
                class="msg msg--user"
                data-test="user-msg"
              >
                {{ turn.prompt }}
              </div>
              <div
                class="msg msg--bot"
                data-test="bot-msg"
              />
            </div>
          </template>
        </div>
        <div data-chat-scroll-gutter />
      </div>
      <button
        class="fab"
        :class="{ 'fab--visible': !stick.state.value.atBottom }"
        data-test="fab"
        aria-label="Scroll to bottom"
        @click="
          () => {
            following = true
            stick.lock()
          }
        "
      >
        ↓
      </button>
    </div>
    <div class="controls">
      <button
        data-test="send"
        @click="
          () => {
            api.sendUserMessage()
            playback.start()
          }
        "
      >
        Send next prompt
      </button>
      <button
        data-test="finish"
        @click="api.finishStream()"
      >
        Finish stream
      </button>
      <PlaybackControls :playback="playback" />
    </div>
  </div>
</template>
