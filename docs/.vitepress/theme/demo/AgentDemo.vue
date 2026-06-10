<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import ChatPane from './ChatPane.vue'
import { PROMPTS, seedConversation, seedStickConversation } from './data'
import { useDemoChat } from './useDemoChat'

const props = withDefaults(
  defineProps<{
    strategy?: 'pin-to-top' | 'stick-to-bottom'
    caption?: string
    /** Chat surface height in px. */
    height?: number
  }>(),
  { strategy: 'pin-to-top', height: 420 },
)
const isPin = props.strategy === 'pin-to-top'

const STATUS_LINES = [
  'Searching the docs…',
  'Reading 3 results…',
  // Deliberately long — wraps to two lines inside the fixed slot.
  'Cross-checking the gutter math against the ResizeObserver timing ' +
    'notes from the scroll-anchoring spec…',
  'Comparing the two strategies…',
  'Drafting the answer…',
] as const

// Unpredictable model output: 1 to 10 lines per status. No fixed slot
// here — the area renders at natural height and the pin absorbs every
// resize.
const STATUS_LINES_VARIABLE = [
  'Planning the approach…',
  'Running 4 checks:\n· pin holds through growth\n· gutter bounds ' +
    'the overscroll\n· lock releases on wheel-up\n· keyboard parity',
  'Two look flaky — re-running with verbose output…',
  'Re-running the full matrix:\n· pin: growth below the fold\n· pin: ' +
    'shrink mid-animation\n· stick: wheel release\n· stick: keyboard ' +
    'release\n· gutter: no-shrink in flight\n· gutter: re-tighten on ' +
    'settle\n· restore: anchored\n· restore: fallback\n· a11y: live ' +
    'regions',
  'All green — summarizing…',
] as const
const STATUS_MS = 900

const variable = ref(false)
const lines = computed<readonly string[]>(() =>
  variable.value ? STATUS_LINES_VARIABLE : STATUS_LINES,
)

const chat = useDemoChat({
  // The stick variant needs overflow from the start so the follow is
  // visible on the first send.
  initial: isPin ? seedConversation() : seedStickConversation(),
  withBlocks: true,
  // The "agent is working" window before the first reply chunk — the
  // status lines below cycle through it.
  firstChunkDelayMs: () => lines.value.length * STATUS_MS + 200,
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
    statusIdx.value = Math.min(statusIdx.value + 1, lines.value.length - 1)
  }, STATUS_MS)
})
onBeforeUnmount(clearStatusTimer)

function send(): void {
  const prompt = PROMPTS[promptIdx.value % PROMPTS.length]
  promptIdx.value += 1
  chat.submit(prompt)
  if (isPin) {
    pane.value?.scroll.pinLatest('[data-role="user"]')
  } else {
    pane.value?.scroll.lock()
  }
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
        {{
          isPin
            ? 'Send, then watch the status lines — the pinned question never moves.'
            : 'Send, then watch the follow keep the newest status in view.'
        }}
      </span>
      <span class="agent-demo__spacer" />
      <label class="agent-demo__toggle">
        <input v-model="variable" type="checkbox" />
        Variable-height statuses
      </label>
      <button type="button" class="agent-demo__btn" @click="reset">
        Reset
      </button>
    </div>

    <div class="agent-demo__surface" :style="{ height: `${height}px` }">
      <ChatPane
        ref="pane"
        :strategy="strategy"
        :messages="chat.messages.value"
        :streaming="chat.streaming.value"
        :show-gutter="isPin"
      >
        <template #bottom>
          <!-- Fixed mode: a FIXED-HEIGHT slot whose lines animate with
               transform/opacity only — scrollHeight never changes, so
               the scroll position has nothing to absorb.
               Variable mode: natural height, every status resizes the
               content — the pin re-anchors on each resize and the
               gutter covers shrinks, so the question still never
               moves. Exit animations want fixed geometry, hence the
               fade-only swap here. -->
          <div
            v-if="working && !variable"
            class="agent-demo__slot"
            aria-live="polite"
          >
            <Transition name="agent-status">
              <span :key="statusIdx" class="agent-demo__line">
                <span class="agent-demo__line-text">
                  {{ lines[statusIdx] }}
                </span>
              </span>
            </Transition>
          </div>
          <!-- Under stick-to-bottom the bottom anchor must shift the
               transcript when the last element resizes — so the
               variable area is capped there: max-height + an inner
               scroll region, which never touches the outer layout. -->
          <div
            v-else-if="working"
            class="agent-demo__slot agent-demo__slot--auto"
            :class="{ 'agent-demo__slot--capped': !isPin }"
            aria-live="polite"
          >
            <span :key="statusIdx" class="agent-demo__line-auto">
              {{ lines[statusIdx] }}
            </span>
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
   overlap without affecting flow. Two lines tall — sized for the
   longest status — with a clamp so an outlier truncates with an
   ellipsis instead of clipping mid-glyph. */
.agent-demo__slot {
  position: relative;
  height: 2.5rem;
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
.agent-demo__line-text {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  line-height: 1.45;
}
/* Variable mode: natural height, the controller absorbs the resizes. */
.agent-demo__slot--auto {
  height: auto;
  overflow: visible;
}
/* Stick variant: cap the variable area — growth past ~5 lines scrolls
   inside the slot instead of shifting the bottom-anchored transcript
   further. */
.agent-demo__slot--capped {
  max-height: 6.2rem;
  overflow-y: auto;
}
.agent-demo__line-auto {
  display: block;
  font-size: 0.75rem;
  font-style: italic;
  color: var(--vp-c-text-2);
  line-height: 1.45;
  white-space: pre-line;
  animation: agent-fade-in 200ms ease;
}
@keyframes agent-fade-in {
  from {
    opacity: 0;
  }
}
.agent-demo__toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8125rem;
  color: var(--vp-c-text-2);
  cursor: pointer;
  user-select: none;
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
  .agent-demo__line-auto {
    animation: none;
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
