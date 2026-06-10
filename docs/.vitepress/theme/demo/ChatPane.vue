<script setup lang="ts">
import { computed, ref } from 'vue'
import { useChatScroll } from '@chat-scroll/vue'
import type { ChatScrollStrategy } from '@chat-scroll/vue'

import type { DemoMsg } from './data'

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

const scroll = useChatScroll({
  strategy: props.strategy,
  // Reactive getter — the adapter mirrors it into setStreaming().
  streaming: () => props.streaming,
  // A chat opens at its latest message; the controller keeps landing
  // there through hydration/font-swap growth until first interaction.
  initialPosition: 'bottom',
})
const { state, containerRef, contentRef, scrollToBottom } = scroll

// Re-evaluate the nav computed on raw scroll position changes — the
// library's state only commits on semantic changes (atBottom etc.).
const scrollTick = ref(0)
const onPaneScroll = (): void => {
  scrollTick.value++
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
  const target = scroll.relativeMessage(TURNS, direction)
  if (!target) return false
  // Releases the follow and resolves rapid clicks against the
  // in-flight target — see the message-navigation recipe.
  scroll.scrollToMessage(target)
  return true
}

// Parent components (LiveDemo) drive pinning / locking / save-restore.
defineExpose({ scroll, nav, navTo })
</script>

<template>
  <div class="ld-pane">
    <div v-if="label" class="ld-pane__label">{{ label }}</div>
    <div class="ld-pane__surface">
      <div
        class="ld-chat"
        :class="{ 'ld-chat--show-gutter': showGutter }"
        :ref="containerRef"
        @scroll.passive="onPaneScroll"
      >
        <div class="ld-messages" :ref="contentRef">
          <div
            v-for="m in messages"
            :key="m.id"
            class="ld-msg"
            :class="`ld-msg--${m.role}`"
            :data-role="m.role"
          >
            <details v-if="m.block" class="ld-block">
              <summary>{{ m.block.title }}</summary>
              <div class="ld-block__body">{{ m.block.body }}</div>
            </details>
            <div class="ld-msg__text">{{ m.text }}</div>
          </div>
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
      <span class="ld-chip" :class="{ 'ld-chip--on': state.atBottom }">
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
      <span class="ld-chip" :class="{ 'ld-chip--on': state.streaming }">
        streaming
      </span>
      <span v-if="showGutter" class="ld-chip ld-chip--gutter-key">gutter</span>
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
.ld-messages {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}
.ld-msg {
  max-width: 88%;
  border-radius: 10px;
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  line-height: 1.45;
}
.ld-msg__text {
  white-space: pre-wrap;
}
.ld-msg--user {
  align-self: flex-end;
  background: var(--vp-c-brand-soft);
}
.ld-msg--assistant {
  align-self: flex-start;
  background: var(--vp-c-bg-soft);
}
.ld-block {
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  margin-bottom: 0.5rem;
  font-size: 0.75rem;
}
.ld-block > summary {
  cursor: pointer;
  padding: 0.3rem 0.55rem;
  color: var(--vp-c-text-2);
  user-select: none;
}
.ld-block__body {
  padding: 0.3rem 0.55rem 0.55rem;
  color: var(--vp-c-text-2);
  border-top: 1px dashed var(--vp-c-divider);
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
