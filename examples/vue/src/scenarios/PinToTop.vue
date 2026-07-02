<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { useChatScroll } from '@chat-scroll/vue'
import {
  PRIOR_TURNS,
  TURN_PROMPTS,
  TURN_SEGMENTS,
  USER_PROMPT,
  createBotStreamer,
  formatState,
  setBlockOpen,
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
let promptIdx = 0
const nextPrompt = () =>
  TURN_PROMPTS[promptIdx++ % TURN_PROMPTS.length] ?? USER_PROMPT

let containerEl: HTMLElement | null = null
let listEl: HTMLElement | null = null
let currentBotEl: HTMLElement | null = null
const streamer = createBotStreamer()

const scroll = useChatScroll({ strategy: 'pin-to-top' })

function captureContainer(el: Element | ComponentPublicInstance | null) {
  containerEl = el instanceof Element ? (el as HTMLElement) : null
  scroll.containerRef(el)
}
function captureList(el: Element | ComponentPublicInstance | null) {
  listEl = el instanceof Element ? (el as HTMLElement) : null
  scroll.contentRef(el)
}

const playback = usePlayback({
  initialIntervalMs: 140,
  initialBehavior: 'smooth',
  supportsGutter: true,
  tick: () => api.tick(),
  onBehaviorChange: (b) => scroll.instance.setOptions({ scrollBehavior: b }),
  onDurationChange: (ms) => scroll.instance.setOptions({ scrollDurationMs: ms }),
  isEnabled: () => scroll.state.value.streaming,
})

onMounted(() => {
  const off = scroll.instance.subscribe(() => playback.refresh())
  onBeforeUnmount(off)
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
      TURN_SEGMENTS[(promptIdx - 1) % TURN_SEGMENTS.length] ?? TURN_SEGMENTS[0]!
    const key = ++turnKey
    turns.value = [...turns.value, { key, prompt }]
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
  setScrollBehavior: (b) => playback.setScrollBehavior(b),
  showCue,
}
window.__demo = api
onBeforeUnmount(() => {
  delete window.__demo
})

function prevUser() {
  scroll.instance.pinRelative('[data-test="user-msg"]', -1)
}
function nextUser() {
  scroll.instance.pinRelative('[data-test="user-msg"]', 1)
}
</script>

<template>
  <div
    class="chat"
    :class="{ 'chat--show-gutter': playback.showGutter.value }"
    data-scenario="pin-to-top"
    style="position: relative"
  >
    <div class="status" data-test="status">
      {{ formatState('pin-to-top', scroll.state.value) }}
    </div>
    <div class="chat__scroll" data-test="scroll" :ref="captureContainer">
      <div class="chat__list" data-test="list" :ref="captureList">
        <template v-for="(t, i) in priors" :key="`p${i}`">
          <div
            :class="t.role === 'user' ? 'msg msg--user' : 'msg msg--bot'"
            :data-test="t.role === 'user' ? 'user-msg' : 'bot-msg'"
          >{{ t.text }}</div>
        </template>
        <template v-for="turn in turns" :key="turn.key">
          <div :data-turn-key="turn.key" style="display: contents">
            <div class="msg msg--user" data-test="user-msg">{{ turn.prompt }}</div>
            <div class="msg msg--bot" data-test="bot-msg"></div>
          </div>
        </template>
      </div>
      <div data-chat-scroll-gutter />
    </div>
    <button
      class="fab"
      :class="{ 'fab--visible': !scroll.state.value.atBottom }"
      data-test="fab"
      aria-label="Scroll to latest"
      @click="scroll.scrollToBottom()"
    >↓</button>
    <div class="controls">
      <button
        data-test="send"
        @click="
          () => {
            api.sendUserMessage()
            playback.start()
          }
        "
      >Send next prompt</button>
      <button data-test="finish" @click="api.finishStream()">Finish stream</button>
      <button
        data-test="prev-user"
        aria-label="Previous user message"
        @click="prevUser"
      >▲ Prev</button>
      <button
        data-test="next-user"
        aria-label="Next user message"
        @click="nextUser"
      >▼ Next</button>
      <PlaybackControls :playback="playback" />
    </div>
  </div>
</template>
