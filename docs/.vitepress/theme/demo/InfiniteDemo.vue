<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'

import ChatPane from './ChatPane.vue'
import {
  HISTORY_PAGES,
  HISTORY_PER_PAGE,
  PROMPTS,
  seedHistoryPage,
} from './data'
import { useDemoChat } from './useDemoChat'

withDefaults(
  defineProps<{
    caption?: string
    /** Chat surface height in px. */
    height?: number
  }>(),
  { caption: '', height: 420 },
)

// Open with the two newest pages loaded (enough to overflow the pane),
// the rest of the history behind a simulated paged endpoint.
const INITIAL_OLDEST = HISTORY_PAGES - 2
const initial = [
  ...seedHistoryPage(HISTORY_PAGES - 2),
  ...seedHistoryPage(HISTORY_PAGES - 1),
]
const chat = useDemoChat({ initial, withBlocks: true })

type PaneHandle = InstanceType<typeof ChatPane> | null
const pane = ref<PaneHandle>(null)

const oldestLoaded = ref(INITIAL_OLDEST)
const fetching = ref(false)
const promptIdx = ref(0)

const hasOlder = computed(() => oldestLoaded.value > 0)
const totalCount = HISTORY_PAGES * HISTORY_PER_PAGE

// Simulated network latency per page of older history.
const PAGE_LATENCY_MS = 600
// Start fetching when the reader gets this close to the top.
const FETCH_THRESHOLD_PX = 80

async function loadOlder(): Promise<void> {
  if (fetching.value || !hasOlder.value) return
  fetching.value = true
  await new Promise((r) => setTimeout(r, PAGE_LATENCY_MS))
  const el = pane.value?.chatEl ?? null
  // The recipe's one tricky step: a prepend grows the content *above*
  // the viewport, but the browser keeps the numeric scrollTop — the
  // reader visually jumps into the new page. Record the height before
  // the prepend, then shift scrollTop by the growth after it renders.
  const prevHeight = el?.scrollHeight ?? 0
  oldestLoaded.value -= 1
  chat.messages.value = [
    ...seedHistoryPage(oldestLoaded.value),
    ...chat.messages.value,
  ]
  await nextTick()
  if (el) el.scrollTop += el.scrollHeight - prevHeight
  fetching.value = false
}

function onPaneScroll(): void {
  const el = pane.value?.chatEl ?? null
  if (el && el.scrollTop < FETCH_THRESHOLD_PX) void loadOlder()
}

function send(): void {
  const prompt = PROMPTS[promptIdx.value % PROMPTS.length]
  promptIdx.value += 1
  chat.submit(prompt)
  pane.value?.scroll.lock()
}

function navTurn(direction: -1 | 1): void {
  pane.value?.navTo(direction)
}
const navState = computed(
  () => pane.value?.nav ?? { prev: false, next: false, pos: '' },
)

async function reset(): Promise<void> {
  chat.reset()
  oldestLoaded.value = INITIAL_OLDEST
  promptIdx.value = 0
  fetching.value = false
  // reset() re-arms initialPosition's bottom-anchoring for the
  // re-seeded transcript.
  await nextTick()
  pane.value?.scroll.reset()
}
</script>

<template>
  <figure class="infinite-demo">
    <div class="infinite-demo__settings">
      <span class="infinite-demo__count">
        {{ chat.messages.value.length }} of {{ totalCount }} history
        messages loaded
      </span>
      <span class="infinite-demo__spacer" />
      <button
        type="button"
        class="infinite-demo__btn"
        @click="reset"
      >
        Reset
      </button>
    </div>

    <div
      class="infinite-demo__surface"
      :style="{ height: `${height}px` }"
    >
      <ChatPane
        ref="pane"
        strategy="stick-to-bottom"
        :messages="chat.messages.value"
        :streaming="chat.streaming.value"
        @scroll="onPaneScroll"
      >
        <template #top>
          <!-- Constant-height header: swapping its text never shifts
               the transcript, so only the page prepend needs scroll
               compensation. -->
          <div
            class="infinite-demo__head"
            aria-live="polite"
          >
            <span
              v-if="fetching"
              class="infinite-demo__head-loading"
            >
              Loading earlier messages…
            </span>
            <span v-else-if="hasOlder">
              Scroll up to load earlier messages
            </span>
            <span v-else>Beginning of conversation</span>
          </div>
        </template>
      </ChatPane>
    </div>

    <div class="infinite-demo__actions">
      <button
        type="button"
        class="infinite-demo__btn infinite-demo__btn--action"
        @click="chat.streaming.value ? chat.stop() : send()"
      >
        {{ chat.streaming.value ? 'Finish stream' : 'Send a message' }}
      </button>
      <div
        class="infinite-demo__nav"
        role="group"
        aria-label="Navigate between user turns"
      >
        <button
          type="button"
          class="infinite-demo__btn"
          title="Scroll the previous user turn to the top"
          :disabled="!navState.prev"
          @click="navTurn(-1)"
        >
          ‹ Prev
        </button>
        <span
          class="infinite-demo__nav-pos"
          aria-label="Current turn"
        >
          {{ navState.pos || '–' }}
        </span>
        <button
          type="button"
          class="infinite-demo__btn"
          title="Scroll the next user turn to the top"
          :disabled="!navState.next"
          @click="navTurn(1)"
        >
          Next ›
        </button>
      </div>
    </div>

    <figcaption v-if="caption">
      {{ caption }}
    </figcaption>
  </figure>
</template>

<style scoped>
.infinite-demo {
  margin: 1.5em 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 0.875rem;
  background: var(--vp-c-bg-soft);
}
.infinite-demo__settings {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding-bottom: 0.75rem;
}
.infinite-demo__actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding-top: 0.75rem;
}
.infinite-demo__spacer {
  flex: 1;
}
.infinite-demo__count {
  font-size: 0.75rem;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-2);
  font-variant-numeric: tabular-nums;
}
.infinite-demo__surface {
  display: flex;
}
.infinite-demo__head {
  /* Fixed height — see the template note on scroll compensation. */
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
  user-select: none;
}
.infinite-demo__head-loading {
  color: var(--vp-c-brand-1);
}
.infinite-demo__btn {
  font-size: 0.8125rem;
  padding: 0.3rem 0.8rem;
  border-radius: 6px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
  transition: border-color 150ms ease;
}
.infinite-demo__btn:hover:not(:disabled) {
  border-color: var(--vp-c-brand-1);
}
.infinite-demo__btn:disabled {
  opacity: 0.5;
  cursor: default;
}
/* Send ⇄ Finish swap labels in place — fixed width so the toolbar
   never reflows when streaming starts or ends. */
.infinite-demo__btn--action {
  min-width: 9.25rem;
  text-align: center;
  background: var(--vp-c-brand-soft);
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
  font-weight: 600;
}
.infinite-demo__nav {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.infinite-demo__nav-pos {
  font-size: 0.75rem;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-2);
  min-width: 3.2em;
  text-align: center;
}
@media (max-width: 640px) {
  .infinite-demo__surface {
    height: 360px !important;
  }
  .infinite-demo__btn {
    font-size: 0.75rem;
    padding: 0.3rem 0.55rem;
  }
  .infinite-demo__btn--action {
    min-width: 7.5rem;
  }
}
</style>
