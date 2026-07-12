<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { useChatScroll } from '@chat-scroll/vue'
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
import PlaybackControls from '../PlaybackControls.vue'
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
    {
      id: 't1',
      title: 'About scroll',
      messages: canonical.slice(),
      saved: null,
    },
    {
      id: 't2',
      title: 'Same convo, retry',
      messages: canonical.slice(),
      saved: null,
    },
    {
      id: 't3',
      title: 'Yet another',
      messages: canonical.slice(),
      saved: null,
    },
  ]
}

const scroll = useChatScroll({
  strategy: 'stick-to-bottom',
  scrollBehavior: 'instant',
})
const threads = makeThreads()
const activeId = ref(threads[0]?.id ?? 't1')
let containerEl: HTMLElement | null = null

function captureContainer(el: Element | ComponentPublicInstance | null) {
  containerEl = el instanceof Element ? (el as HTMLElement) : null
  scroll.containerRef(el)
}

const active = computed(() => threads.find((t) => t.id === activeId.value))

function switchTo(id: string) {
  const prev = active.value
  if (prev) prev.saved = scroll.savePosition()
  if (id === activeId.value) return
  activeId.value = id
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

const playback = usePlayback({
  initialIntervalMs: 140,
  initialBehavior: 'instant',
  tick: () => false,
  onBehaviorChange: (b) => scroll.instance.setOptions({ scrollBehavior: b }),
  onDurationChange: (ms) =>
    scroll.instance.setOptions({ scrollDurationMs: ms }),
  isEnabled: () => false,
})

onMounted(() => {
  const off = scroll.instance.subscribe(() => playback.refresh())
  onBeforeUnmount(off)
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
onBeforeUnmount(() => {
  delete window.__demo
})
</script>

<template>
  <div class="chat" data-scenario="thread-switch" style="position: relative">
    <div class="threads" data-test="threads">
      <button
        v-for="t in threads"
        :key="t.id"
        :data-test="`thread-${t.id}`"
        :class="{ active: activeId === t.id }"
        @click="switchTo(t.id)"
      >
        {{ t.title }}
      </button>
    </div>
    <div class="status" data-test="status">
      {{
        formatState(
          'stick-to-bottom',
          scroll.state.value,
          `thread: ${active?.title ?? '?'}`,
        )
      }}
    </div>
    <div :ref="captureContainer" class="chat__scroll" data-test="scroll">
      <div :ref="scroll.contentRef" class="chat__list" data-test="list">
        <div
          v-for="(m, i) in active?.messages ?? []"
          :key="i"
          :class="m.role === 'user' ? 'msg msg--user' : 'msg msg--bot'"
          :data-test="m.role === 'user' ? 'user-msg' : 'bot-msg'"
        >
          {{ m.text }}
        </div>
      </div>
      <div data-chat-scroll-gutter />
    </div>
    <button
      class="fab"
      :class="{ 'fab--visible': !scroll.state.value.atBottom }"
      data-test="fab"
      aria-label="Scroll to bottom"
      @click="scroll.scrollToBottom()"
    >
      ↓
    </button>
    <div class="controls">
      <button data-test="scroll-up" @click="api.scrollByPx?.(-200)">
        Scroll up a bit
      </button>
      <PlaybackControls :playback="playback" />
    </div>
  </div>
</template>
