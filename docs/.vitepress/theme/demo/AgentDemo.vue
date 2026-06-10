<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import ChatPane from './ChatPane.vue'
import { PROMPTS, seedConversation } from './data'
import { useDemoChat } from './useDemoChat'

const props = withDefaults(
  defineProps<{
    caption?: string
    /** Chat surface height in px. */
    height?: number
  }>(),
  { height: 420 },
)

const STATUS_LINES = [
  'Searching the docs…',
  'Reading 3 results…',
  'Comparing the two strategies…',
  'Drafting the answer…',
] as const
const STATUS_MS = 900

const chat = useDemoChat({
  initial: seedConversation(),
  withBlocks: true,
  // The "agent is working" window before the first reply chunk — the
  // status lines below cycle through it.
  firstChunkDelayMs: STATUS_LINES.length * STATUS_MS + 200,
})

type PaneHandle = InstanceType<typeof ChatPane> | null
const pane = ref<PaneHandle>(null)
const promptIdx = ref(0)

// Working = the agent is narrating: streaming, but no reply text yet.
const working = computed(() => {
  const last = chat.messages.value[chat.messages.value.length - 1]
  return chat.streaming.value && last?.role === 'user'
})

const statusIdx = ref(0)
let statusTimer: ReturnType<typeof setInterval> | null = null
function clearStatusTimer(): void {
  if (statusTimer !== null) {
    clearInterval(statusTimer)
    statusTimer = null
  }
}
watch(working, (w) => {
  clearStatusTimer()
  if (!w) return
  statusIdx.value = 0
  statusTimer = setInterval(() => {
    statusIdx.value = Math.min(statusIdx.value + 1, STATUS_LINES.length - 1)
  }, STATUS_MS)
})
onBeforeUnmount(clearStatusTimer)

function send(): void {
  const prompt = PROMPTS[promptIdx.value % PROMPTS.length]
  promptIdx.value += 1
  chat.submit(prompt)
  pane.value?.scroll.pinLatest('[data-role="user"]')
}

async function reset(): Promise<void> {
  chat.reset()
  promptIdx.value = 0
  await nextTick()
  pane.value?.scroll.reset()
}
</script>

<template>
  <figure class="agent-demo">
    <div class="agent-demo__settings">
      <span class="agent-demo__hint">
        Send, then watch the status lines — the pinned question never
        moves.
      </span>
      <span class="agent-demo__spacer" />
      <button type="button" class="agent-demo__btn" @click="reset">
        Reset
      </button>
    </div>

    <div class="agent-demo__surface" :style="{ height: `${height}px` }">
      <ChatPane
        ref="pane"
        strategy="pin-to-top"
        :messages="chat.messages.value"
        :streaming="chat.streaming.value"
        show-gutter
      >
        <template #bottom>
          <!-- The whole trick: a FIXED-HEIGHT slot whose lines animate
               with transform/opacity only. scrollHeight never changes
               while statuses cycle, so the scroll position has nothing
               to absorb. -->
          <div v-if="working" class="agent-demo__slot" aria-live="polite">
            <Transition name="agent-status">
              <span :key="statusIdx" class="agent-demo__line">
                {{ STATUS_LINES[statusIdx] }}
              </span>
            </Transition>
          </div>
        </template>
      </ChatPane>
    </div>

    <div class="agent-demo__actions">
      <button
        type="button"
        class="agent-demo__btn agent-demo__btn--action"
        @click="chat.streaming.value ? chat.stop() : send()"
      >
        {{ chat.streaming.value ? 'Finish stream' : 'Send a message' }}
      </button>
    </div>

    <figcaption v-if="caption">{{ caption }}</figcaption>
  </figure>
</template>

<style scoped>
.agent-demo {
  margin: 1.5em 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 0.875rem;
  background: var(--vp-c-bg-soft);
}
.agent-demo__settings {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding-bottom: 0.75rem;
}
.agent-demo__hint {
  font-size: 0.75rem;
  color: var(--vp-c-text-2);
}
.agent-demo__spacer {
  flex: 1;
}
.agent-demo__surface {
  display: flex;
}
.agent-demo__actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding-top: 0.75rem;
}
.agent-demo__btn {
  font-size: 0.8125rem;
  padding: 0.3rem 0.8rem;
  border-radius: 6px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
  transition: border-color 150ms ease;
}
.agent-demo__btn:hover:not(:disabled) {
  border-color: var(--vp-c-brand-1);
}
.agent-demo__btn--action {
  min-width: 9.25rem;
  text-align: center;
  background: var(--vp-c-brand-soft);
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
  font-weight: 600;
}

/* Fixed height + overflow hidden: the slot never participates in
   layout changes. Lines are absolutely positioned so enter/leave
   overlap without affecting flow. */
.agent-demo__slot {
  position: relative;
  height: 1.625rem;
  overflow: hidden;
  align-self: flex-start;
  width: 70%;
}
.agent-demo__line {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  font-size: 0.75rem;
  font-style: italic;
  color: var(--vp-c-text-2);
}
.agent-status-enter-active,
.agent-status-leave-active {
  transition:
    transform 240ms ease,
    opacity 240ms ease;
}
.agent-status-enter-from {
  transform: translateY(100%);
  opacity: 0;
}
.agent-status-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .agent-status-enter-active,
  .agent-status-leave-active {
    transition: none;
  }
}
@media (max-width: 640px) {
  .agent-demo__surface {
    height: 360px !important;
  }
  .agent-demo__hint {
    display: none;
  }
  .agent-demo__btn {
    font-size: 0.75rem;
    padding: 0.3rem 0.55rem;
  }
  .agent-demo__btn--action {
    min-width: 7.5rem;
  }
}
</style>
