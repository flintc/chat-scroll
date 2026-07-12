<script setup lang="ts">
import { computed, nextTick, ref, shallowRef } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { useChatScroll } from '@chat-scroll/vue'
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/vue-virtual'

import { PROMPTS, seedHugeConversation } from './data'
import { useDemoChat } from './useDemoChat'

const props = withDefaults(
  defineProps<{
    strategy?: 'stick-to-bottom' | 'pin-to-top'
    caption?: string
    /** Seeded history size. */
    count?: number
    /** Chat surface height in px. */
    height?: number
  }>(),
  { caption: '', strategy: 'stick-to-bottom', count: 5000, height: 480 },
)
const isPin = props.strategy === 'pin-to-top'

const chat = useDemoChat({ initial: seedHugeConversation(props.count) })
const promptIdx = ref(0)
const showGutter = ref(isPin)

const scroll = useChatScroll({
  strategy: props.strategy,
  streaming: () => chat.streaming.value,
  // Open at the latest message; the controller keeps landing there
  // while the virtualizer's estimates settle, until first interaction.
  initialPosition: 'bottom',
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
//
// Pin-to-top adds one requirement: the pinned element must stay
// mounted (the controller re-reads its live offset on every resize
// pass). TanStack's rangeExtractor — the same primitive its sticky
// rows use — forces the pinned index into the rendered range no
// matter where the viewport is.
const pinnedIndex = ref<number | null>(null)
const virtualizer = useVirtualizer(
  computed(() => {
    // Read during evaluation so a pin change re-renders the range.
    const pinned = pinnedIndex.value
    return {
      count: chat.messages.value.length,
      getScrollElement: () => chatEl.value,
      estimateSize: () => 60,
      overscan: 8,
      // The list opens at the latest message (initialPosition:
      // 'bottom') — tell the virtualizer, so its init doesn't write
      // offset 0 over the controller's snap.
      initialOffset: chat.messages.value.length * 60,
      rangeExtractor: (range: {
        startIndex: number
        endIndex: number
        overscan: number
        count: number
      }) => {
        const def = defaultRangeExtractor(range)
        if (
          pinned === null ||
          (pinned >= (def[0] ?? 0) && pinned <= (def[def.length - 1] ?? 0))
        ) {
          return def
        }
        return pinned < (def[0] ?? 0) ? [pinned, ...def] : [...def, pinned]
      },
    }
  }),
)
const rows = computed(() => virtualizer.value.getVirtualItems())
const totalSize = computed(() => virtualizer.value.getTotalSize())
const measureElement = (
  el: Element | ComponentPublicInstance | null,
): void => {
  if (el instanceof Element) virtualizer.value.measureElement(el)
}

// ── Pin by index (pin-to-top) ──────────────────────────────────────
// Selector-driven APIs (pinLatest / pinRelative) only see mounted
// rows, so a windowed list drives pinning from the data instead:
// force-mount the row via pinnedIndex, then hand the live element to
// pinMessage.
function pinWhenMounted(i: number, attempt = 0): void {
  const el = chatEl.value?.querySelector<HTMLElement>(
    `.vd-row[data-index="${i}"]`,
  )
  if (el) {
    scroll.pinMessage(el)
    return
  }
  if (attempt < 5) requestAnimationFrame(() => pinWhenMounted(i, attempt + 1))
}
async function pinIndex(i: number): Promise<void> {
  pinnedIndex.value = i
  await nextTick()
  pinWhenMounted(i)
}

// ── Actions ────────────────────────────────────────────────────────
function send(): void {
  const prompt = PROMPTS[promptIdx.value % PROMPTS.length]
  promptIdx.value += 1
  chat.submit(prompt)
  if (isPin) {
    void pinIndex(chat.messages.value.length - 1)
  } else {
    scroll.lock()
  }
}

function jumpToTop(): void {
  // Programmatic move away — release the follow (stick) so a
  // mid-stream snap can't fight the jump; the pin's anchored flag is
  // cleared by the controller's consumer-scroll detection.
  scroll.unlock()
  virtualizer.value.scrollToIndex(0, { align: 'start' })
}

async function reset(): Promise<void> {
  chat.reset()
  promptIdx.value = 0
  pinnedIndex.value = null
  // reset() re-arms initialPosition's bottom-anchoring for the
  // re-seeded list.
  await nextTick()
  scroll.reset()
}

// ── Prev / next turn navigation ────────────────────────────────────
// Same reference rule as the unvirtualized demos, computed in index
// space: the pinned turn while anchored, otherwise the user turn
// nearest the viewport top. Virtual items carry their offsets, and
// the turn being read is by definition near the viewport — mounted.
// Pin-to-top hops the pin; stick-to-bottom releases the follow and
// scrolls the target row to the top via the virtualizer.
const scrollTick = ref(0)
const onPaneScroll = (): void => {
  scrollTick.value++
}
const userIndexes = computed(() =>
  chat.messages.value.reduce<number[]>((acc, m, i) => {
    if (m.role === 'user') acc.push(i)
    return acc
  }, []),
)

function refTurn(): { idx: number; midReply: boolean } {
  if (pinnedIndex.value !== null && state.value.pinAnchored) {
    return { idx: pinnedIndex.value, midReply: false }
  }
  const st = chatEl.value?.scrollTop ?? 0
  const items = virtualizer.value.getVirtualItems()
  let idx = -1
  let top = 0
  for (const it of items) {
    if (chat.messages.value[it.index]?.role !== 'user') continue
    if (it.start - 12 <= st + 2) {
      idx = it.index
      top = it.start - 12
    }
  }
  if (idx === -1) {
    // No mounted user row at/above the viewport top: the reference
    // turn sits above the rendered window, i.e. we're mid-reply past
    // the nearest user index above the window's first row.
    const first = items[0]?.index ?? 0
    for (const u of userIndexes.value) {
      if (u <= first) idx = u
      else break
    }
    return { idx, midReply: idx !== -1 }
  }
  return { idx, midReply: st > top + 2 }
}

function navTurn(dir: -1 | 1): void {
  if (!isPin && dir === 1 && state.value.atBottom) return
  const users = userIndexes.value
  const { idx, midReply } = refTurn()
  const pos = users.indexOf(idx)
  let target =
    dir === 1
      ? users[pos + 1]
      : midReply && !state.value.pinAnchored
        ? users[pos]
        : users[pos - 1]
  if (target === undefined) return
  if (isPin) {
    void pinIndex(target)
    return
  }
  // Release the follow and land the row 12px below the viewport top —
  // the same margin the other demos use, so the row reads as "at the
  // turn" (not 12px past it) for the next navigation.
  scroll.unlock()
  const v = virtualizer.value
  if (state.value.atBottom) {
    // Short rows can put several turns inside the at-bottom threshold;
    // from the bottom, walk up until the jump is actually visible.
    const st = chatEl.value?.scrollTop ?? 0
    let p = users.indexOf(target)
    while (p > 0) {
      const [off] = v.getOffsetForIndex(target, 'start') ?? [0]
      if (off - 12 <= st - 48) break
      p -= 1
      target = users[p] as number
    }
  }
  stickTo(target)
}

// Land `index` at the navigation margin, re-applying for a few frames:
// the first scroll mounts new rows whose measurements shift the
// offsets, so a single write can fall short of the target.
function stickTo(index: number, attempt = 0): void {
  const [off] = virtualizer.value.getOffsetForIndex(index, 'start') ?? [0]
  const top = Math.max(0, off - 12)
  if (Math.abs((chatEl.value?.scrollTop ?? 0) - top) > 2) {
    virtualizer.value.scrollToOffset(top)
  }
  if (attempt < 3) {
    requestAnimationFrame(() => stickTo(index, attempt + 1))
  }
}

const navState = computed(() => {
  void scrollTick.value
  void rows.value
  const users = userIndexes.value
  if (users.length === 0) return { prev: false, next: false, pos: '' }
  const { idx, midReply } = refTurn()
  const pos = users.indexOf(idx)
  const prev = (midReply && !state.value.pinAnchored ? pos : pos - 1) >= 0
  // Stick: being at the bottom means being on the latest turn — the
  // tail turns can't reach the viewport top (no gutter).
  if (!isPin && state.value.atBottom) {
    return { prev, next: false, pos: `${users.length}/${users.length}` }
  }
  return {
    prev,
    next: pos + 1 < users.length,
    pos: pos >= 0 ? `${pos + 1}/${users.length}` : '',
  }
})
</script>

<template>
  <figure class="virtual-demo">
    <div class="virtual-demo__settings">
      <span class="virtual-demo__count">
        rendering {{ rows.length }} of
        {{ chat.messages.value.length.toLocaleString() }} rows
      </span>
      <span class="virtual-demo__spacer" />
      <label
        v-if="isPin"
        class="virtual-demo__toggle"
      >
        <input
          v-model="showGutter"
          type="checkbox"
        >
        Show gutter
      </label>
      <button
        type="button"
        class="virtual-demo__btn"
        @click="reset"
      >
        Reset
      </button>
    </div>

    <div
      class="virtual-demo__surface"
      :style="{ height: `${height}px` }"
    >
      <!-- tabindex: keyboard-operable scroller. role="region", NOT
           "log": windowing mounts rows on scroll, and a live region
           would announce them as new messages. -->
      <div
        :ref="setContainer"
        class="vd-chat"
        :class="{ 'vd-chat--show-gutter': showGutter }"
        tabindex="0"
        role="region"
        aria-label="Conversation (virtualized)"
        @scroll.passive="onPaneScroll"
      >
        <div
          :ref="contentRef"
          class="vd-total"
          :style="{ height: `${totalSize}px` }"
        >
          <div
            v-for="row in rows"
            :key="row.key as number"
            :ref="measureElement"
            :data-index="row.index"
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

    <div class="virtual-demo__actions">
      <button
        type="button"
        class="virtual-demo__btn virtual-demo__btn--action"
        @click="chat.streaming.value ? chat.stop() : send()"
      >
        {{ chat.streaming.value ? 'Finish stream' : 'Send a message' }}
      </button>
      <div
        class="virtual-demo__nav"
        role="group"
        aria-label="Navigate between user turns"
      >
        <button
          type="button"
          class="virtual-demo__btn"
          :title="
            isPin
              ? 'Pin the previous user turn'
              : 'Scroll the previous user turn to the top'
          "
          :disabled="!navState.prev"
          @click="navTurn(-1)"
        >
          ‹ Prev
        </button>
        <span
          class="virtual-demo__nav-pos"
          aria-label="Current turn"
        >
          {{ navState.pos || '–' }}
        </span>
        <button
          type="button"
          class="virtual-demo__btn"
          :title="
            isPin
              ? 'Pin the next user turn'
              : 'Scroll the next user turn to the top'
          "
          :disabled="!navState.next"
          @click="navTurn(1)"
        >
          Next ›
        </button>
      </div>
      <button
        type="button"
        class="virtual-demo__btn"
        @click="jumpToTop"
      >
        Jump to #1
      </button>
    </div>

    <div class="virtual-demo__status">
      <span
        class="vd-chip"
        :class="{ 'vd-chip--on': state.atBottom }"
      >
        atBottom
      </span>
      <span
        v-if="isPin"
        class="vd-chip"
        :class="{ 'vd-chip--on': state.pinAnchored }"
      >
        pinAnchored
      </span>
      <span
        v-else
        class="vd-chip"
        :class="{ 'vd-chip--on': state.locked }"
      >
        locked
      </span>
      <span
        class="vd-chip"
        :class="{ 'vd-chip--on': state.streaming }"
      >
        streaming
      </span>
    </div>

    <figcaption v-if="caption">
      {{ caption }}
    </figcaption>
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
.virtual-demo__settings {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding-bottom: 0.75rem;
}
.virtual-demo__actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding-top: 0.75rem;
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
.virtual-demo__btn:hover:not(:disabled) {
  border-color: var(--vp-c-brand-1);
}
.virtual-demo__btn:disabled {
  opacity: 0.5;
  cursor: default;
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
.virtual-demo__nav {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.virtual-demo__nav-pos {
  font-size: 0.75rem;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-2);
  min-width: 3.2em;
  text-align: center;
}
.virtual-demo__count {
  font-size: 0.75rem;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-2);
  font-variant-numeric: tabular-nums;
}
.virtual-demo__toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8125rem;
  color: var(--vp-c-text-2);
  cursor: pointer;
  user-select: none;
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
.vd-chat:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: -2px;
}
.vd-total {
  position: relative;
  width: 100%;
  /* No flex-shrink handling needed: the controller pins
     flex-shrink: 0 on its content element itself. */
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
/* Gutter visualization — the library's gutter element carries a stable
   data attribute, so the demo can paint it without touching internals. */
.vd-chat--show-gutter :deep([data-chat-scroll-gutter]) {
  background: repeating-linear-gradient(
    -45deg,
    var(--vp-c-brand-soft),
    var(--vp-c-brand-soft) 6px,
    transparent 6px,
    transparent 12px
  );
  border-radius: 6px;
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
