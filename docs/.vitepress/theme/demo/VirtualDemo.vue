<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { useChatScroll } from '@chat-scroll/vue'
import { useVirtualizer } from '@tanstack/vue-virtual'

import { PROMPTS, seedHugeConversation } from './data'
import { useDemoChat } from './useDemoChat'

const props = withDefaults(
  defineProps<{
    caption?: string
    /** Seeded history size. */
    count?: number
    /** Chat surface height in px. */
    height?: number
  }>(),
  { count: 5000, height: 480 },
)

const chat = useDemoChat({ initial: seedHugeConversation(props.count) })
const promptIdx = ref(0)

const scroll = useChatScroll({
  strategy: 'stick-to-bottom',
  streaming: () => chat.streaming.value,
})
const { state, containerRef, contentRef, scrollToBottom } = scroll

const chatEl = shallowRef<HTMLElement | null>(null)
const setContainer = (
  el: Element | ComponentPublicInstance | null,
): void => {
  chatEl.value = el instanceof HTMLElement ? el : null
  containerRef(el)
}

// ── TanStack Virtual ───────────────────────────────────────────────
// The scroll element is chat-scroll's container; the total-size
// wrapper is chat-scroll's content element, so the controller's
// ResizeObserver sees every totalSize change — estimates refining,
// rows re-measuring, the streaming reply growing.
const virtualizer = useVirtualizer(
  computed(() => ({
    count: chat.messages.value.length,
    getScrollElement: () => chatEl.value,
    estimateSize: () => 60,
    overscan: 8,
  })),
)
const rows = computed(() => virtualizer.value.getVirtualItems())
const totalSize = computed(() => virtualizer.value.getTotalSize())
const measureElement = (
  el: Element | ComponentPublicInstance | null,
): void => {
  if (el instanceof Element) virtualizer.value.measureElement(el)
}

// ── Open at the latest message ─────────────────────────────────────
function snapToBottom(): void {
  const el = chatEl.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}
onMounted(() => {
  snapToBottom()
  // The first frames refine row-size estimates near the bottom — keep
  // landing on the latest message until layout is stable.
  requestAnimationFrame(() => {
    snapToBottom()
    requestAnimationFrame(snapToBottom)
  })
  document.fonts?.ready.then(snapToBottom).catch(() => {})
})

// ── Actions ────────────────────────────────────────────────────────
function send(): void {
  const prompt = PROMPTS[promptIdx.value % PROMPTS.length]
  promptIdx.value += 1
  chat.submit(prompt)
  scroll.lock()
}

function jumpToTop(): void {
  // Programmatic move away from the bottom — release the follow so a
  // mid-stream snap can't fight the jump.
  scroll.unlock()
  virtualizer.value.scrollToIndex(0, { align: 'start' })
}

async function reset(): Promise<void> {
  chat.reset()
  promptIdx.value = 0
  scroll.reset()
  requestAnimationFrame(snapToBottom)
}
</script>

<template>
  <figure class="virtual-demo">
    <div class="virtual-demo__toolbar">
      <button
        type="button"
        class="virtual-demo__btn virtual-demo__btn--action"
        @click="chat.streaming.value ? chat.stop() : send()"
      >
        {{ chat.streaming.value ? 'Finish stream' : 'Send a message' }}
      </button>
      <button type="button" class="virtual-demo__btn" @click="jumpToTop">
        Jump to #1
      </button>
      <span class="virtual-demo__spacer" />
      <span class="virtual-demo__count">
        rendering {{ rows.length }} of
        {{ chat.messages.value.length.toLocaleString() }} rows
      </span>
      <button type="button" class="virtual-demo__btn" @click="reset">
        Reset
      </button>
    </div>

    <div class="virtual-demo__surface" :style="{ height: `${height}px` }">
      <div class="vd-chat" :ref="setContainer">
        <div
          class="vd-total"
          :ref="contentRef"
          :style="{ height: `${totalSize}px` }"
        >
          <div
            v-for="row in rows"
            :key="row.key as number"
            :data-index="row.index"
            :ref="measureElement"
            class="vd-row"
            :style="{ transform: `translateY(${row.start}px)` }"
          >
            <div
              class="vd-msg"
              :class="`vd-msg--${chat.messages.value[row.index].role}`"
              :data-role="chat.messages.value[row.index].role"
            >
              <span class="vd-msg__num">#{{ row.index + 1 }}</span>
              {{ chat.messages.value[row.index].text }}
            </div>
          </div>
        </div>
      </div>
      <button
        class="vd-fab"
        :class="{ 'vd-fab--visible': !state.atBottom }"
        aria-label="Scroll to bottom"
        @click="scrollToBottom()"
      >
        ↓
      </button>
    </div>

    <div class="virtual-demo__status">
      <span class="vd-chip" :class="{ 'vd-chip--on': state.atBottom }">
        atBottom
      </span>
      <span class="vd-chip" :class="{ 'vd-chip--on': state.locked }">
        locked
      </span>
      <span class="vd-chip" :class="{ 'vd-chip--on': state.streaming }">
        streaming
      </span>
    </div>

    <figcaption v-if="caption">{{ caption }}</figcaption>
  </figure>
</template>

<style scoped>
.virtual-demo {
  margin: 1.5em 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 0.875rem;
  background: var(--vp-c-bg-soft);
}
.virtual-demo__toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding-bottom: 0.75rem;
}
.virtual-demo__spacer {
  flex: 1;
}
.virtual-demo__btn {
  font-size: 0.8125rem;
  padding: 0.3rem 0.8rem;
  border-radius: 6px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
  transition: border-color 150ms ease;
}
.virtual-demo__btn:hover {
  border-color: var(--vp-c-brand-1);
}
/* Send ⇄ Finish swap labels in place — fixed width so the toolbar
   never reflows when streaming starts or ends. */
.virtual-demo__btn--action {
  min-width: 9.25rem;
  text-align: center;
  background: var(--vp-c-brand-soft);
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
  font-weight: 600;
}
.virtual-demo__count {
  font-size: 0.75rem;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-2);
  font-variant-numeric: tabular-nums;
}
.virtual-demo__surface {
  position: relative;
}
.vd-chat {
  height: 100%;
  overflow-y: auto;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  padding: 0.75rem;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
.vd-total {
  position: relative;
  width: 100%;
  /* The controller makes the container a column flexbox (for the
     gutter). This wrapper's children are absolutely positioned, so
     its min-content height is 0 and default flex-shrink would crush
     the virtualizer's total size down to the viewport. */
  flex-shrink: 0;
}
.vd-row {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  padding-bottom: 0.625rem;
}
.vd-msg {
  max-width: 88%;
  border-radius: 10px;
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  line-height: 1.45;
  white-space: pre-wrap;
}
.vd-msg__num {
  font-size: 0.6875rem;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-3);
  margin-right: 0.35rem;
}
.vd-msg--user {
  align-self: flex-end;
  background: var(--vp-c-brand-soft);
}
.vd-msg--assistant {
  align-self: flex-start;
  background: var(--vp-c-bg-soft);
}
.vd-fab {
  position: absolute;
  right: 0.875rem;
  bottom: 0.875rem;
  width: 2rem;
  height: 2rem;
  border-radius: 9999px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-elv);
  color: var(--vp-c-text-1);
  font-size: 0.875rem;
  line-height: 1;
  display: grid;
  place-items: center;
  cursor: pointer;
  opacity: 0;
  transform: translateY(6px);
  pointer-events: none;
  transition:
    opacity 180ms ease,
    transform 180ms ease;
  box-shadow: var(--vp-shadow-2);
}
.vd-fab--visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
@media (prefers-reduced-motion: reduce) {
  .vd-fab {
    transition: none;
  }
}
.virtual-demo__status {
  display: flex;
  gap: 0.375rem;
  padding: 0.5rem 0.25rem 0;
  flex-wrap: wrap;
}
.vd-chip {
  font-size: 0.6875rem;
  font-family: var(--vp-font-family-mono);
  padding: 0.1rem 0.45rem;
  border-radius: 9999px;
  border: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-3);
  background: var(--vp-c-bg-soft);
}
.vd-chip--on {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}
@media (max-width: 640px) {
  .virtual-demo__surface {
    height: 380px !important;
  }
  .virtual-demo__btn {
    font-size: 0.75rem;
    padding: 0.3rem 0.55rem;
  }
  .virtual-demo__btn--action {
    min-width: 7.5rem;
  }
}
</style>
