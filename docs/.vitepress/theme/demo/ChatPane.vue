<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { useChatScroll } from '@chat-scroll/vue'
import type { ChatScrollStrategy } from '@chat-scroll/vue'

import type { DemoBlock, DemoMsg } from './data'

const props = defineProps<{
  strategy: ChatScrollStrategy
  messages: DemoMsg[]
  streaming: boolean
  /** Visualize the gutter element (pin-to-top only). */
  showGutter?: boolean
  /** Small header label, used by the side-by-side comparison. */
  label?: string
}>()

const TURNS = '[data-role="user"]'

const emit = defineEmits<{ (e: 'scroll'): void }>()

const scroll = useChatScroll({
  strategy: props.strategy,
  // Reactive getter — the adapter mirrors it into setStreaming().
  streaming: () => props.streaming,
  // A chat opens at its latest message; the controller keeps landing
  // there through hydration/font-swap growth until first interaction.
  initialPosition: 'bottom',
})
const { state, containerRef, contentRef, scrollToBottom } = scroll

// The adapter keeps the container element private — hold our own
// alongside its callback ref for parents that need raw geometry
// (the infinite-history demo's fetch threshold + prepend compensation).
const chatEl = shallowRef<HTMLElement | null>(null)
const setContainer = (el: Element | ComponentPublicInstance | null): void => {
  chatEl.value = el instanceof HTMLElement ? el : null
  containerRef(el)
}

// ── Expandable blocks ─────────────────────────────────────────────
// Default open state mirrors the example apps: reasoning is shown
// (live thinking), a tool call stays collapsed (its args assemble in
// the summary; the result is a click away). Crucially nothing
// AUTO-collapses mid-stream — collapsing a block the instant it
// finishes would shrink content below the pin, and the scroll extent
// correctly follows that shrink, so the scrollbar would bounce on every
// block. Keeping the open state stable while the reply streams keeps
// content monotonic and the scroll area still. A click takes over —
// the user's choice wins from then on (and shows the resize being
// absorbed). Keyed per message+block so streamed turns don't inherit
// state.
const blockOverrides = reactive(new Map<string, boolean>())
const isBlockOpen = (id: number, bi: number, b: DemoBlock): boolean =>
  blockOverrides.get(`${id}:${bi}`) ??
  (b.kind === 'reasoning' && Boolean(b.body))
function toggleBlock(id: number, bi: number, b: DemoBlock): void {
  blockOverrides.set(`${id}:${bi}`, !isBlockOpen(id, bi, b))
}
// A shrinking transcript means Reset — drop the user's toggles too.
watch(
  () => props.messages.length,
  (n, o) => {
    if (n < o) blockOverrides.clear()
  },
)

// Re-evaluate the nav computed on raw scroll position changes — the
// library's state only commits on semantic changes (atBottom etc.).
const scrollTick = ref(0)
const onPaneScroll = (): void => {
  scrollTick.value++
  emit('scroll')
}

/**
 * Prev/next affordances for the toolbar, straight from the library's
 * reference resolution (`referenceMessage` / `relativeMessage`).
 * One demo-side convention on top: under stick-to-bottom, being at
 * the bottom means being on the latest turn (turns near the tail may
 * not be able to reach the viewport top — no gutter), so Next
 * disables and the counter reads N/N there.
 */
const nav = computed(() => {
  void scrollTick.value
  const s = state.value
  const ref = scroll.referenceMessage(TURNS)
  if (ref.count === 0) return { prev: false, next: false, pos: '' }
  const prev = scroll.relativeMessage(TURNS, -1) !== null
  if (props.strategy === 'stick-to-bottom' && s.atBottom) {
    return { prev, next: false, pos: `${ref.count}/${ref.count}` }
  }
  return {
    prev,
    next: ref.index + 1 < ref.count,
    pos: ref.index >= 0 ? `${ref.index + 1}/${ref.count}` : '',
  }
})

/** Strategy-aware prev/next: pin hop (pin-to-top) or plain scroll (stick). */
function navTo(direction: -1 | 1): boolean {
  if (props.strategy === 'pin-to-top') {
    return scroll.pinRelative(TURNS, direction)
  }
  if (direction === 1 && state.value.atBottom) return false
  let target = scroll.relativeMessage(TURNS, direction)
  if (!target) return false
  const el = chatEl.value
  if (direction === -1 && el && state.value.atBottom) {
    // Short messages can pack several turns inside the at-bottom
    // threshold — from the bottom, walk up until the jump is actually
    // visible (same rule as the virtualization demo). 12 = the
    // default scrollMargin scrollToMessage lands with.
    const turns = Array.from(el.querySelectorAll<HTMLElement>(TURNS))
    const landing = (t: HTMLElement): number =>
      t.getBoundingClientRect().top -
      el.getBoundingClientRect().top +
      el.scrollTop -
      12
    let i = turns.indexOf(target)
    while (i > 0 && landing(turns[i] as HTMLElement) > el.scrollTop - 48) {
      i -= 1
    }
    target = turns[i] ?? target
  }
  // Releases the follow and resolves rapid clicks against the
  // in-flight target — see the message-navigation recipe.
  scroll.scrollToMessage(target)
  return true
}

// Parent components (LiveDemo, InfiniteDemo) drive pinning / locking /
// save-restore / history paging.
defineExpose({ scroll, nav, navTo, chatEl })
</script>

<template>
  <div class="ld-pane">
    <div
      v-if="label"
      class="ld-pane__label"
    >
      {{ label }}
    </div>
    <div class="ld-pane__surface">
      <!-- tabindex makes the scroller keyboard-operable everywhere
           (Safari doesn't auto-focus scrollable regions); role="log"
           announces appended messages politely to screen readers. -->
      <div
        :ref="setContainer"
        class="ld-chat"
        :class="{ 'ld-chat--show-gutter': showGutter }"
        tabindex="0"
        role="log"
        :aria-label="label ? `Conversation — ${label}` : 'Conversation'"
        @scroll.passive="onPaneScroll"
      >
        <div
          :ref="contentRef"
          class="ld-messages"
        >
          <slot name="top" />
          <div
            v-for="m in messages"
            :key="m.id"
            class="ld-msg"
            :class="`ld-msg--${m.role}`"
            :data-role="m.role"
          >
            <div
              v-for="(b, bi) in m.blocks"
              :key="bi"
              class="ld-block"
              :class="{
                'ld-block--open': isBlockOpen(m.id, bi, b),
                'ld-block--streaming': b.streaming,
              }"
            >
              <button
                type="button"
                class="ld-block__summary"
                :aria-expanded="isBlockOpen(m.id, bi, b)"
                @click="toggleBlock(m.id, bi, b)"
              >
                <span
                  class="ld-block__icon"
                  aria-hidden="true"
                >
                  {{ b.kind === 'tool' ? '🛠' : '💭' }}
                </span>
                <span class="ld-block__title">
                  {{ b.title
                  }}<span
                    v-if="b.kind === 'tool'"
                    class="ld-block__args"
                  >{{
                    b.args
                  }}</span>
                </span>
                <span
                  class="ld-block__chev"
                  aria-hidden="true"
                >▾</span>
              </button>
              <div class="ld-block__wrap">
                <div
                  class="ld-block__body"
                  :class="{ 'ld-block__body--mono': b.kind === 'tool' }"
                >
                  {{ b.body }}
                </div>
              </div>
            </div>
            <!-- Only the answer text is bubbled; the reasoning / tool
                 cards above sit outside it (the ChatGPT/Claude layout).
                 No bubble while the turn is still all-blocks. -->
            <div
              v-if="m.text"
              class="ld-msg__text"
            >
              {{ m.text }}
            </div>
          </div>
          <slot name="bottom" />
        </div>
      </div>
      <button
        class="ld-fab"
        :class="{ 'ld-fab--visible': !state.atBottom }"
        aria-label="Scroll to bottom"
        @click="scrollToBottom()"
      >
        ↓
      </button>
    </div>
    <div class="ld-status">
      <span
        class="ld-chip"
        :class="{ 'ld-chip--on': state.atBottom }"
      >
        atBottom
      </span>
      <span
        v-if="strategy === 'stick-to-bottom'"
        class="ld-chip"
        :class="{ 'ld-chip--on': state.locked }"
      >
        locked
      </span>
      <span
        v-else
        class="ld-chip"
        :class="{ 'ld-chip--on': state.pinAnchored }"
      >
        pinAnchored
      </span>
      <span
        class="ld-chip"
        :class="{ 'ld-chip--on': state.streaming }"
      >
        streaming
      </span>
      <span
        v-if="showGutter"
        class="ld-chip ld-chip--gutter-key"
      >gutter</span>
    </div>
  </div>
</template>

<style scoped>
.ld-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.ld-pane__label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--vp-c-text-2);
  padding: 0 0.25rem 0.375rem;
}
.ld-pane__surface {
  position: relative;
  flex: 1;
  min-height: 0;
}
.ld-chat {
  height: 100%;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  padding: 0.75rem;
  overscroll-behavior: contain;
  /* Keep clientHeight stable when the gutter adds/removes overflow —
     see the "tight pin" recipe. */
  scrollbar-gutter: stable;
}
.ld-chat:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: -2px;
}
.ld-messages {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}
/* A turn is a transparent column: reasoning / tool cards stacked
   above, then the answer bubble. Only the bubble is tinted — the cards
   sit outside it (the ChatGPT/Claude layout). */
.ld-msg {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  max-width: 88%;
  font-size: 0.8125rem;
  line-height: 1.45;
}
.ld-msg--user {
  align-self: flex-end;
  align-items: flex-end;
}
.ld-msg--assistant {
  align-self: flex-start;
  /* A stable column width so the cards and bubble don't jitter
     horizontally as the answer streams in and grows. */
  width: 88%;
}
.ld-msg__text {
  border-radius: 10px;
  padding: 0.5rem 0.75rem;
  white-space: pre-wrap;
}
.ld-msg--user .ld-msg__text {
  background: var(--vp-c-brand-soft);
}
.ld-msg--assistant .ld-msg__text {
  background: var(--vp-c-bg-soft);
}
.ld-block {
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  font-size: 0.75rem;
}
.ld-block__summary {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  text-align: left;
  cursor: pointer;
  padding: 0.3rem 0.55rem;
  border: 0;
  background: transparent;
  color: var(--vp-c-text-2);
  font-size: inherit;
  user-select: none;
}
.ld-block__icon {
  flex: none;
}
.ld-block__title {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.ld-block__args {
  margin-left: 0.4rem;
  font-family: var(--vp-font-family-mono);
  font-size: 0.9em;
  color: var(--vp-c-text-3);
}
.ld-block__chev {
  flex: none;
  transition: transform 180ms ease;
}
.ld-block--open .ld-block__chev {
  transform: rotate(180deg);
}
/* While a block's content is arriving, pulse its summary — the cue
   that the reasoning / tool call is live. */
.ld-block--streaming .ld-block__summary {
  animation: ld-block-pulse 1.2s ease-in-out infinite;
}
@keyframes ld-block-pulse {
  50% {
    opacity: 0.55;
  }
}
/* Animated collapse (grid-template-rows 0fr → 1fr) instead of
   <details>: the open/close transition resizes the message over many
   frames, exactly the churn the controller must absorb. */
.ld-block__wrap {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 220ms ease;
}
.ld-block--open .ld-block__wrap {
  grid-template-rows: 1fr;
}
.ld-block__body {
  overflow: hidden;
  min-height: 0;
  padding: 0 0.55rem;
  border-top: 1px dashed transparent;
  color: var(--vp-c-text-2);
  white-space: pre-wrap;
}
.ld-block--open .ld-block__body {
  padding: 0.3rem 0.55rem 0.55rem;
  border-top-color: var(--vp-c-divider);
}
.ld-block__body--mono {
  font-family: var(--vp-font-family-mono);
  font-size: 0.95em;
}
@media (prefers-reduced-motion: reduce) {
  .ld-block__wrap,
  .ld-block__chev {
    transition: none;
  }
  .ld-block--streaming .ld-block__summary {
    animation: none;
  }
}
/* Gutter visualization — the library's gutter element carries a stable
   data attribute, so the demo can paint it without touching internals. */
.ld-chat--show-gutter :deep([data-chat-scroll-gutter]) {
  background: repeating-linear-gradient(
    -45deg,
    var(--vp-c-brand-soft),
    var(--vp-c-brand-soft) 6px,
    transparent 6px,
    transparent 12px
  );
  border-radius: 6px;
}
.ld-fab {
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
.ld-fab--visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
@media (prefers-reduced-motion: reduce) {
  .ld-fab {
    transition: none;
  }
}
.ld-status {
  display: flex;
  gap: 0.375rem;
  padding: 0.5rem 0.25rem 0;
  flex-wrap: wrap;
}
.ld-chip {
  font-size: 0.6875rem;
  font-family: var(--vp-font-family-mono);
  padding: 0.1rem 0.45rem;
  border-radius: 9999px;
  border: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-3);
  background: var(--vp-c-bg-soft);
}
.ld-chip--on {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}
.ld-chip--gutter-key {
  background: repeating-linear-gradient(
    -45deg,
    var(--vp-c-brand-soft),
    var(--vp-c-brand-soft) 4px,
    transparent 4px,
    transparent 8px
  );
  color: var(--vp-c-text-2);
}
</style>
