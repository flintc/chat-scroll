<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ChatScrollBehavior, ScrollPosition } from '@chat-scroll/vue'

import ChatPane from './ChatPane.vue'
import {
  ASSISTANT_CHUNKS,
  PROMPTS,
  seedAltThread,
  seedConversation,
  seedLongConversation,
  seedStickConversation,
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
  { height: 480, gutter: true },
)

type PaneHandle = InstanceType<typeof ChatPane> | null

const paneA = ref<PaneHandle>(null)
const paneB = ref<PaneHandle>(null)
const showGutter = ref(props.gutter)
const promptIdx = ref(0)

// ── Stream speed ──────────────────────────────────────────────────
// Token cadence changes which races matter: slow streams make every
// snap/recalc individually visible; fast streams stress the input-vs-
// resnap and animation-vs-growth paths. Re-read per chunk, so flipping
// it mid-stream applies immediately.
const SPEEDS = [
  { label: 'slow', ms: 280 },
  { label: 'normal', ms: 55 },
  { label: 'fast', ms: 15 },
] as const
const speedMs = ref<number>(55)

// ── Live options (home page demo) ─────────────────────────────────
// scrollMargin and scrollBehavior, applied to the running instances
// via setOptions. A margin change re-pins the current element so the
// pinned turn visibly slides to the new offset.
const MARGINS = [0, 12, 32, 64] as const
const marginPx = ref<number>(12)
const motion = ref<ChatScrollBehavior>('auto')

function panes(): PaneHandle[] {
  return [paneA.value, paneB.value]
}
watch(marginPx, (m) => {
  for (const pane of panes()) {
    const sc = pane?.scroll
    if (!sc) continue
    sc.instance.setOptions({ scrollMargin: m })
    const el = sc.getPinnedElement()
    if (el) sc.pinMessage(el)
  }
})
watch(motion, (b) => {
  for (const pane of panes()) {
    pane?.scroll.instance.setOptions({ scrollBehavior: b })
  }
})

// ── Per-scenario chat state ───────────────────────────────────────
let threadSeedId = 5000
const threadA: DemoMsg[] = [
  ...seedLongConversation(),
  { id: ++threadSeedId, role: 'user', text: PROMPTS[0] },
  { id: ++threadSeedId, role: 'assistant', text: ASSISTANT_CHUNKS.join('') },
]

const isPin = computed(
  () => props.scenario === 'pin-to-top' || props.scenario === 'side-by-side',
)
const chatA = useDemoChat({
  initial:
    props.scenario === 'thread-switch'
      ? threadA
      : props.scenario === 'stick-to-bottom'
        ? seedStickConversation()
        : seedLongConversation(),
  // Streamed replies carry collapsible Reasoning + Tool call blocks —
  // resizable content the strategies must absorb without moving the
  // reader.
  withBlocks: true,
  intervalMs: () => speedMs.value,
})
// Second chat: the stick pane of side-by-side (same conversation as the
// pin pane, so the comparison is apples-to-apples), or thread B.
const chatB = useDemoChat({
  initial:
    props.scenario === 'thread-switch'
      ? seedAltThread()
      : props.scenario === 'side-by-side'
        ? seedLongConversation()
        : seedConversation(),
  withBlocks: true,
  intervalMs: () => speedMs.value,
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
  // restorePosition handles the rest: releases the lock so the swap's
  // resize can't snap to bottom, re-applies after layout settles, and
  // a wasAtBottom snapshot (or a first visit) lands at the new bottom.
  sc.restorePosition(
    positions.get(id) ?? { scrollTop: 0, wasAtBottom: true },
  )
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

// ── Prev / next turn navigation ───────────────────────────────────
// Strategy-aware (ChatPane.navTo): under pin-to-top it's
// pinRelative() — hop the pin between user turns; under
// stick-to-bottom it's plain container scrolling plus unlock(), and
// the latest turn clamps at the real bottom (no gutter). The
// reference point is the turn the reader is at in both cases.
// Disabled states come from the pane's `nav` mirror of that rule.
// Side-by-side drives both panes, each from its own reference.
function navTurn(direction: -1 | 1): void {
  paneA.value?.navTo(direction)
  if (props.scenario === 'side-by-side') paneB.value?.navTo(direction)
}
const navState = computed(
  () => paneA.value?.nav ?? { prev: false, next: false, pos: '' },
)

async function reset(): Promise<void> {
  chatA.reset()
  chatB.reset()
  positions.clear()
  activeThread.value = 'a'
  promptIdx.value = 0
  // reset() re-arms initialPosition's bottom-anchoring, so the panes
  // land at the latest message once the seeds re-render.
  await nextTick()
  paneA.value?.scroll.reset()
  paneB.value?.scroll.reset()
}
</script>

<template>
  <figure class="live-demo">
    <div class="live-demo__settings">
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
      <span class="live-demo__spacer" />
      <label class="live-demo__toggle" title="Chunk cadence of the fake stream">
        Speed
        <select
          v-model.number="speedMs"
          class="live-demo__select"
          aria-label="Stream speed"
        >
          <option v-for="sp in SPEEDS" :key="sp.ms" :value="sp.ms">
            {{ sp.label }}
          </option>
        </select>
      </label>
      <template v-if="scenario === 'side-by-side'">
        <label
          class="live-demo__toggle"
          title="scrollMargin — the gap kept above a pinned turn"
        >
          Margin
          <select
            v-model.number="marginPx"
            class="live-demo__select"
            aria-label="Pin margin in pixels"
          >
            <option v-for="m in MARGINS" :key="m" :value="m">{{ m }}px</option>
          </select>
        </label>
        <label
          class="live-demo__toggle"
          title="scrollBehavior — auto respects prefers-reduced-motion"
        >
          Motion
          <select
            v-model="motion"
            class="live-demo__select"
            aria-label="Scroll behavior"
          >
            <option value="auto">auto</option>
            <option value="smooth">smooth</option>
            <option value="instant">instant</option>
          </select>
        </label>
      </template>
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

    <div class="live-demo__actions">
      <button
        type="button"
        class="live-demo__btn live-demo__btn--primary live-demo__btn--action"
        @click="streaming ? finish() : send()"
      >
        {{ streaming ? 'Finish stream' : 'Send a message' }}
      </button>
      <div
        class="live-demo__nav"
        role="group"
        aria-label="Navigate between user turns"
      >
        <button
          type="button"
          class="live-demo__btn"
          :title="
            isPin
              ? 'Pin the previous user turn (pinRelative -1)'
              : 'Scroll the previous user turn to the top'
          "
          :disabled="!navState.prev"
          @click="navTurn(-1)"
        >
          ‹ Prev
        </button>
        <span class="live-demo__nav-pos" aria-label="Current turn">
          {{ navState.pos || '–' }}
        </span>
        <button
          type="button"
          class="live-demo__btn"
          :title="
            isPin
              ? 'Pin the next user turn (pinRelative +1)'
              : 'Scroll the next user turn to the top'
          "
          :disabled="!navState.next"
          @click="navTurn(1)"
        >
          Next ›
        </button>
      </div>
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
.live-demo__settings {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding-bottom: 0.75rem;
}
.live-demo__actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding-top: 0.75rem;
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
/* Send ⇄ Finish swap labels in place — fixed width so the toolbar
   never reflows when streaming starts or ends. */
.live-demo__btn--action {
  min-width: 9.25rem;
  text-align: center;
}
.live-demo__nav {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.live-demo__nav-pos {
  font-size: 0.75rem;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-2);
  /* Always rendered (placeholder when empty) at a reserved width, so
     the nav buttons never slide as the counter changes. */
  min-width: 2.6em;
  text-align: center;
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
.live-demo__select {
  font-size: 0.8125rem;
  padding: 0.15rem 0.3rem;
  border-radius: 6px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
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
    /* In the column layout the pane's own `flex: 1` (basis 0%) would
       win the main axis over `height` and expand to full content
       height — no scroll viewport, nothing to demo. Pin the basis. */
    flex: 0 0 380px;
    height: 380px;
  }
  .live-demo__btn,
  .live-demo__toggle,
  .live-demo__select,
  .live-demo__tabs button {
    font-size: 0.75rem;
  }
  .live-demo__btn {
    padding: 0.3rem 0.55rem;
  }
  .live-demo__btn--action {
    min-width: 7.5rem;
  }
  /* iOS Safari zooms the page when a focused form control's font is
     smaller than 16px — and the zoom sticks after blur. */
  .live-demo__select {
    font-size: 16px;
    padding: 0.05rem 0.2rem;
  }
}
</style>
