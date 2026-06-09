<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { ScrollPosition } from '@chat-scroll/vue'

import ChatPane from './ChatPane.vue'
import {
  ASSISTANT_CHUNKS,
  PROMPTS,
  seedAltThread,
  seedConversation,
  type DemoMsg,
} from './data'
import { useDemoChat } from './useDemoChat'

const props = withDefaults(
  defineProps<{
    scenario: 'pin-to-top' | 'stick-to-bottom' | 'side-by-side' | 'thread-switch'
    caption?: string
    /** Chat surface height in px. */
    height?: number
    /** Start with the gutter visualization on (pin scenarios). */
    gutter?: boolean
  }>(),
  { height: 340, gutter: false },
)

type PaneHandle = InstanceType<typeof ChatPane> | null

const paneA = ref<PaneHandle>(null)
const paneB = ref<PaneHandle>(null)
const showGutter = ref(props.gutter)
const promptIdx = ref(0)

// ── Per-scenario chat state ───────────────────────────────────────
let threadSeedId = 5000
const threadA: DemoMsg[] = [
  ...seedConversation(),
  { id: ++threadSeedId, role: 'user', text: PROMPTS[0] },
  { id: ++threadSeedId, role: 'assistant', text: ASSISTANT_CHUNKS.join('') },
]

const isPin = computed(
  () => props.scenario === 'pin-to-top' || props.scenario === 'side-by-side',
)
const chatA = useDemoChat({
  initial: props.scenario === 'thread-switch' ? threadA : seedConversation(),
  withBlocks: props.scenario === 'pin-to-top',
})
// Second chat: the stick pane of side-by-side, or thread B.
const chatB = useDemoChat({
  initial:
    props.scenario === 'thread-switch' ? seedAltThread() : seedConversation(),
})

// ── Thread switching (thread-switch scenario) ─────────────────────
const activeThread = ref<'a' | 'b'>('a')
const positions = new Map<'a' | 'b', ScrollPosition>()
const activeChat = computed(() =>
  props.scenario === 'thread-switch' && activeThread.value === 'b'
    ? chatB
    : chatA,
)

async function switchThread(id: 'a' | 'b'): Promise<void> {
  if (id === activeThread.value) return
  const sc = paneA.value?.scroll
  if (!sc) return
  positions.set(activeThread.value, sc.savePosition())
  activeThread.value = id
  await nextTick()
  const saved = positions.get(id)
  if (saved && !saved.wasAtBottom) {
    // Release the lock so a resize doesn't snap to bottom before the
    // restore lands on the next frame.
    sc.unlock()
    requestAnimationFrame(() => sc.restorePosition(saved))
  } else {
    requestAnimationFrame(() => sc.scrollToBottom())
  }
}

// ── Actions ───────────────────────────────────────────────────────
const streaming = computed(
  () => chatA.streaming.value || chatB.streaming.value,
)

function send(): void {
  const prompt = PROMPTS[promptIdx.value % PROMPTS.length]
  promptIdx.value += 1

  if (props.scenario === 'side-by-side') {
    chatA.submit(prompt)
    chatB.submit(prompt)
    paneA.value?.scroll.pinLatest('[data-role="user"]')
    paneB.value?.scroll.lock()
    return
  }
  if (props.scenario === 'thread-switch') {
    activeChat.value.submit(prompt)
    paneA.value?.scroll.lock()
    return
  }
  chatA.submit(prompt)
  if (props.scenario === 'pin-to-top') {
    paneA.value?.scroll.pinLatest('[data-role="user"]')
  } else {
    paneA.value?.scroll.lock()
  }
}

function finish(): void {
  chatA.stop()
  chatB.stop()
}

function reset(): void {
  chatA.reset()
  chatB.reset()
  positions.clear()
  activeThread.value = 'a'
  promptIdx.value = 0
  paneA.value?.scroll.reset()
  paneB.value?.scroll.reset()
}
</script>

<template>
  <figure class="live-demo">
    <div class="live-demo__toolbar">
      <template v-if="scenario === 'thread-switch'">
        <div class="live-demo__tabs" role="tablist" aria-label="Threads">
          <button
            type="button"
            role="tab"
            :aria-selected="activeThread === 'a'"
            :class="{ active: activeThread === 'a' }"
            @click="switchThread('a')"
          >
            Thread A
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="activeThread === 'b'"
            :class="{ active: activeThread === 'b' }"
            @click="switchThread('b')"
          >
            Thread B
          </button>
        </div>
      </template>
      <button
        type="button"
        class="live-demo__btn live-demo__btn--primary"
        :disabled="streaming"
        @click="send"
      >
        Send a message
      </button>
      <button
        v-if="streaming"
        type="button"
        class="live-demo__btn"
        @click="finish"
      >
        Finish stream
      </button>
      <span class="live-demo__spacer" />
      <label v-if="isPin" class="live-demo__toggle">
        <input v-model="showGutter" type="checkbox" />
        Show gutter
      </label>
      <button type="button" class="live-demo__btn" @click="reset">
        Reset
      </button>
    </div>

    <div class="live-demo__panes" :style="{ height: `${height}px` }">
      <template v-if="scenario === 'side-by-side'">
        <ChatPane
          ref="paneA"
          strategy="pin-to-top"
          label="pin-to-top"
          :messages="chatA.messages.value"
          :streaming="chatA.streaming.value"
          :show-gutter="showGutter"
        />
        <ChatPane
          ref="paneB"
          strategy="stick-to-bottom"
          label="stick-to-bottom"
          :messages="chatB.messages.value"
          :streaming="chatB.streaming.value"
        />
      </template>
      <ChatPane
        v-else
        ref="paneA"
        :strategy="scenario === 'pin-to-top' ? 'pin-to-top' : 'stick-to-bottom'"
        :messages="activeChat.messages.value"
        :streaming="activeChat.streaming.value"
        :show-gutter="scenario === 'pin-to-top' && showGutter"
      />
    </div>

    <figcaption v-if="caption">{{ caption }}</figcaption>
  </figure>
</template>

<style scoped>
.live-demo {
  margin: 1.5em 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 0.875rem;
  background: var(--vp-c-bg-soft);
}
.live-demo__toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding-bottom: 0.75rem;
}
.live-demo__spacer {
  flex: 1;
}
.live-demo__btn {
  font-size: 0.8125rem;
  padding: 0.3rem 0.8rem;
  border-radius: 6px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
  transition: border-color 150ms ease;
}
.live-demo__btn:hover:not(:disabled) {
  border-color: var(--vp-c-brand-1);
}
.live-demo__btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.live-demo__btn--primary {
  background: var(--vp-c-brand-soft);
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
  font-weight: 600;
}
.live-demo__tabs {
  display: flex;
  gap: 0.25rem;
}
.live-demo__tabs button {
  font-size: 0.8125rem;
  padding: 0.3rem 0.8rem;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
}
.live-demo__tabs button.active {
  background: var(--vp-c-bg);
  border-color: var(--vp-c-divider);
  color: var(--vp-c-text-1);
  font-weight: 600;
}
.live-demo__toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8125rem;
  color: var(--vp-c-text-2);
  cursor: pointer;
  user-select: none;
}
.live-demo__panes {
  display: flex;
  gap: 0.875rem;
}
.live-demo figcaption {
  text-align: center;
  margin-top: 0.625rem;
  font-size: 0.875em;
  color: var(--vp-c-text-2);
}
@media (max-width: 640px) {
  .live-demo__panes {
    flex-direction: column;
    height: auto !important;
  }
  .live-demo__panes > * {
    height: 280px;
  }
}
</style>
