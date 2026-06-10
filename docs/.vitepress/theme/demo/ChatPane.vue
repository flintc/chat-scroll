<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import type { ComponentPublicInstance } from 'vue'
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

const scroll = useChatScroll({
  strategy: props.strategy,
  // Reactive getter — the adapter mirrors it into setStreaming().
  streaming: () => props.streaming,
})
const { state, containerRef, contentRef, scrollToBottom } = scroll

// Keep our own handle on the container (the composable's ref fn doesn't
// expose the element) for the nav math + initial snap below.
const chatEl = shallowRef<HTMLElement | null>(null)
const setContainer = (
  el: Element | ComponentPublicInstance | null,
): void => {
  const node = el instanceof HTMLElement ? el : null
  if (node && node !== chatEl.value) {
    // Any real scroll signal supersedes a pending nav target (below).
    for (const ev of ['scrollend', 'wheel', 'touchstart', 'keydown'])
      node.addEventListener(ev, clearPendingNav, { passive: true })
  }
  chatEl.value = node
  containerRef(el)
}

// Re-evaluate viewport-dependent computeds on scroll. The library's
// state only commits on *semantic* changes (atBottom etc.), so the nav
// indicator tracks raw scroll position itself.
const scrollTick = ref(0)
const onPaneScroll = (): void => {
  scrollTick.value++
}

// A chat opens at its latest message.
function snapToLatest(): void {
  const el = chatEl.value
  if (el) el.scrollTop = el.scrollHeight
}
onMounted(() => {
  snapToLatest()
  // Layout settles over the first few frames (hydration, web-font
  // swap) and each settle grows the content a little — keep landing on
  // the latest message until it's stable.
  requestAnimationFrame(snapToLatest)
  document.fonts?.ready.then(snapToLatest).catch(() => {})
})

// ── Prev/next turn navigation ─────────────────────────────────────
// Viewport-relative reference geometry, shared by the toolbar
// indicator and navTo(): the reference turn is the last one whose top
// sits at/above the viewport top (what the reader is looking at).
// Same rule pinRelative uses when not anchored.
const NAV_MARGIN = 12 // default scrollMargin
const NAV_FUDGE = 2

function turnGeometry(el: HTMLElement): {
  turns: HTMLElement[]
  tops: number[]
  st: number
  cur: number
  midReply: boolean
} {
  const turns = Array.from(
    el.querySelectorAll<HTMLElement>('[data-role="user"]'),
  )
  const cTop = el.getBoundingClientRect().top
  const st = el.scrollTop
  const tops = turns.map(
    (t) => t.getBoundingClientRect().top - cTop + st - NAV_MARGIN,
  )
  let cur = -1
  tops.forEach((t, i) => {
    if (t <= st + NAV_FUDGE) cur = i
  })
  const midReply = cur >= 0 && st > (tops[cur] ?? 0) + NAV_FUDGE
  return { turns, tops, st, cur, midReply }
}

/**
 * Prev/next affordances for the toolbar. Pin: the pinned turn while
 * anchored at it, otherwise the viewport geometry above. Stick: the
 * bottom counts as the latest turn even when that turn's top can't
 * reach the viewport top (no gutter to manufacture the room).
 * `pos` is a human "turn x/y" label.
 */
const nav = computed(() => {
  void scrollTick.value
  const s = state.value
  const el = chatEl.value
  if (!el) return { prev: false, next: false, pos: '' }
  const g = turnGeometry(el)
  const count = g.turns.length
  if (count === 0) return { prev: false, next: false, pos: '' }

  const pinned = s.pinAnchored ? scroll.getPinnedElement() : null
  const anchoredIdx = pinned ? g.turns.indexOf(pinned) : -1
  if (anchoredIdx !== -1) {
    return {
      prev: anchoredIdx > 0,
      next: anchoredIdx < count - 1,
      pos: `${anchoredIdx + 1}/${count}`,
    }
  }

  const prevOk = (g.midReply ? g.cur : g.cur - 1) >= 0
  if (props.strategy === 'stick-to-bottom' && s.atBottom) {
    return { prev: prevOk, next: false, pos: `${count}/${count}` }
  }
  return {
    prev: prevOk,
    next: g.cur + 1 < count,
    pos: g.cur >= 0 ? `${g.cur + 1}/${count}` : '',
  }
})

// Rapid clicks must resolve against the turn the user is heading to,
// not the mid-animation scroll position. pinRelative does this
// internally (pin intent is recorded synchronously); the stick path
// uses native smooth scrollTo, so the pending target is memoed here
// and cleared by arrival (scrollend) or by any real scroll input.
let pendingNavIdx: number | null = null
function clearPendingNav(): void {
  pendingNavIdx = null
}

/** Strategy-aware prev/next: pin hop (pin-to-top) or plain scroll (stick). */
function navTo(direction: -1 | 1): boolean {
  if (props.strategy === 'pin-to-top') {
    return scroll.pinRelative('[data-role="user"]', direction)
  }
  const el = chatEl.value
  if (!el) return false
  const g = turnGeometry(el)
  if (g.turns.length === 0) return false

  const inFlight =
    pendingNavIdx !== null &&
    Math.abs(g.st - (g.tops[pendingNavIdx] ?? 0)) > NAV_FUDGE
  if (!inFlight) pendingNavIdx = null
  const cur = inFlight ? (pendingNavIdx as number) : g.cur
  const midReply = inFlight ? false : g.midReply
  if (direction === 1 && !inFlight && state.value.atBottom) return false
  const targetIdx = direction === 1 ? cur + 1 : midReply ? cur : cur - 1
  const targetTop = g.tops[targetIdx]
  if (targetTop === undefined) return false

  // Navigating away is explicit intent — release the follow first so
  // a mid-stream snap can't cancel the animation.
  scroll.unlock()
  pendingNavIdx = targetIdx
  el.scrollTo({
    top: targetTop,
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth',
  })
  return true
}

// Parent components (LiveDemo) drive pinning / locking / save-restore.
defineExpose({ scroll, nav, navTo, snapToLatest })
</script>

<template>
  <div class="ld-pane">
    <div v-if="label" class="ld-pane__label">{{ label }}</div>
    <div class="ld-pane__surface">
      <div
        class="ld-chat"
        :class="{ 'ld-chat--show-gutter': showGutter }"
        :ref="setContainer"
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
