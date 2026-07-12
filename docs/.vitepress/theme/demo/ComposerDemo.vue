<script setup lang="ts">
/**
 * Self-contained demo for the "Overlay composer" recipe. Deliberately
 * does NOT reuse ChatPane / useDemoChat — it needs its own overlaid
 * composer and a `bottomInset` control, and staying standalone keeps it
 * decoupled from the shared demo harness. Mock data, a tiny word-by-word
 * streamer, the real Vue adapter. Visual language follows the other
 * recipe demos (AgentDemo / LiveDemo / ChatPane).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useChatScroll } from '@chat-scroll/vue'
import type { ChatScrollStrategy } from '@chat-scroll/vue'

withDefaults(
  defineProps<{
    caption?: string
    /** Chat surface height in px. */
    height?: number
  }>(),
  { caption: '', height: 420 },
)

interface Msg {
  id: number
  role: 'user' | 'assistant'
  text: string
}

const PROMPTS = [
  'Walk me through how the gutter keeps the pin tight.',
  'And what happens on a really long answer?',
  'How does this play with a stick-to-bottom chat?',
]
const REPLY =
  'Good question. The controller reserves the obscured band in its own ' +
  'gutter element, so the last line of this reply can always scroll out ' +
  'from behind the composer. Nothing here touches the container padding — ' +
  'the library owns the reservation, and it tracks the composer height as ' +
  'it changes.\n\n' +
  'Keep reading and watch the mechanics. As this answer grows past the ' +
  'bottom of the viewport the scroll-to-bottom button fades in, and the ' +
  'gutter underneath holds exactly the composer’s height in reserve. ' +
  'However long the reply runs, the final words never end up stranded ' +
  'underneath the input.\n\n' +
  'Flip “Reserve space” off to feel the difference: the last line slides ' +
  'under the composer with no way to reach it, and the bar turns red to ' +
  'flag it. Turn it back on and that line lifts to sit just above the ' +
  'bar. Grow the composer to two or three lines and the reserved band ' +
  'tracks it on the same frame — the pin stays tight and the bottom ' +
  'stays glued under either strategy.\n\n' +
  'That is the whole feature: one option, measured from your real ' +
  'composer, reconciled with the gutter the library already manages. ' +
  'Scroll to the very bottom now and the final words sit just above the ' +
  'input, never under it.'

// ── Controls ──────────────────────────────────────────────────────
const strategy = ref<ChatScrollStrategy>('pin-to-top')
const reserve = ref(true)
const composerLines = ref(1)

// ── The composer, measured live ───────────────────────────────────
const composerEl = ref<HTMLElement | null>(null)
const composerH = ref(0)
let ro: ResizeObserver | null = null
onMounted(() => {
  if (!composerEl.value) return
  ro = new ResizeObserver(([entry]) => {
    composerH.value =
      entry?.borderBoxSize?.[0]?.blockSize ??
      composerEl.value?.offsetHeight ??
      0
  })
  ro.observe(composerEl.value)
})
onBeforeUnmount(() => ro?.disconnect())

// The inset the library reserves: the composer's height when reservation
// is on, 0 when off (so you can watch the last message duck behind it).
const inset = computed(() => (reserve.value ? Math.round(composerH.value) : 0))

// ── Wiring ────────────────────────────────────────────────────────
const streaming = ref(false)
const scroll = useChatScroll({
  strategy: strategy.value,
  // Only `streaming` is read as a getter by the adapter; strategy and
  // bottomInset are forwarded imperatively below.
  streaming: () => streaming.value,
  initialPosition: 'bottom',
})
const { state, containerRef, contentRef, scrollToBottom } = scroll

// Drive `bottomInset` imperatively — it tracks both the toggle and the
// composer's measured height. This is the whole integration.
watch(inset, (px) => scroll.instance.setOptions({ bottomInset: px }), {
  immediate: true,
})
watch(strategy, (s) => scroll.instance.setOptions({ strategy: s }))

// ── Mock conversation + streamer ──────────────────────────────────
let nextId = 1
function seed(): Msg[] {
  return [
    { id: nextId++, role: 'user', text: 'Hi — does the input cover the chat?' },
    {
      id: nextId++,
      role: 'assistant',
      text:
        'Only if you let it. With an overlay composer the bottom of the ' +
        'viewport is obscured; the reservation gives the last message ' +
        'room to clear it. Try the toggle above.',
    },
  ]
}
const messages = ref<Msg[]>(seed())
const promptIdx = ref(0)
let timer: ReturnType<typeof setInterval> | null = null
function clearTimer(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}

function send(): void {
  const prompt = PROMPTS[promptIdx.value % PROMPTS.length]!
  promptIdx.value += 1
  messages.value = [
    ...messages.value,
    { id: nextId++, role: 'user', text: prompt },
  ]
  if (strategy.value === 'pin-to-top') {
    scroll.pinLatest('[data-role="user"]')
  } else {
    scroll.lock()
  }
  const aId = nextId++
  messages.value = [...messages.value, { id: aId, role: 'assistant', text: '' }]
  streaming.value = true
  const words = REPLY.split(' ')
  let i = 0
  clearTimer()
  timer = setInterval(() => {
    const next = words[i]
    messages.value = messages.value.map((m) =>
      m.id === aId ? { ...m, text: m.text + (i ? ' ' : '') + next } : m,
    )
    i += 1
    if (i >= words.length) {
      clearTimer()
      streaming.value = false
    }
  }, 55)
}

function finish(): void {
  clearTimer()
  // Flush the rest of the reply in one shot.
  messages.value = messages.value.map((m, idx) =>
    idx === messages.value.length - 1 && m.role === 'assistant'
      ? { ...m, text: REPLY }
      : m,
  )
  streaming.value = false
}

async function reset(): Promise<void> {
  clearTimer()
  streaming.value = false
  promptIdx.value = 0
  messages.value = seed()
  await nextTick()
  scroll.reset()
}
onBeforeUnmount(clearTimer)
</script>

<template>
  <figure class="composer-demo">
    <div class="composer-demo__settings">
      <label class="composer-demo__toggle" title="Scroll strategy">
        Strategy
        <select
          v-model="strategy"
          class="composer-demo__select"
          aria-label="Scroll strategy"
        >
          <option value="pin-to-top">pin-to-top</option>
          <option value="stick-to-bottom">stick-to-bottom</option>
        </select>
      </label>
      <span class="composer-demo__spacer" />
      <label
        class="composer-demo__toggle"
        title="Reserve the band the composer overlays (bottomInset)"
      >
        <input v-model="reserve" type="checkbox" />
        Reserve space
      </label>
      <label
        class="composer-demo__toggle"
        title="Grow the composer to watch the reservation track it"
      >
        Composer
        <select
          v-model.number="composerLines"
          class="composer-demo__select"
          aria-label="Composer height"
        >
          <option :value="1">1 line</option>
          <option :value="2">2 lines</option>
          <option :value="3">3 lines</option>
        </select>
      </label>
      <button type="button" class="composer-demo__btn" @click="reset">
        Reset
      </button>
    </div>

    <!-- The surface is the composer's containing block; the scroller
         fills it and the composer overlays the bottom. No container
         padding — `bottomInset` reserves the space in the gutter. -->
    <div class="composer-demo__surface" :style="{ height: `${height}px` }">
      <div
        :ref="containerRef"
        class="composer-demo__chat"
        tabindex="0"
        role="log"
        aria-label="Conversation"
      >
        <div :ref="contentRef" class="composer-demo__messages">
          <div
            v-for="m in messages"
            :key="m.id"
            class="composer-demo__msg"
            :class="`composer-demo__msg--${m.role}`"
            :data-role="m.role"
          >
            {{ m.text }}
          </div>
        </div>
      </div>

      <button
        class="composer-demo__fab"
        :class="{ 'composer-demo__fab--visible': !state.atBottom }"
        :style="{ bottom: `calc(${composerH}px + 0.6rem)` }"
        aria-label="Scroll to bottom"
        @click="scrollToBottom()"
      >
        ↓
      </button>

      <!-- The overlay composer — a non-interactive mock (the real send
           is the action button below). Its measured height feeds
           `bottomInset`; the extra "lines" simulate a textarea growing. -->
      <div
        ref="composerEl"
        class="composer-demo__composer"
        :class="{ 'composer-demo__composer--ghost': !reserve }"
        aria-hidden="true"
      >
        <div class="composer-demo__field">
          <span class="composer-demo__placeholder">Message…</span>
          <span
            v-for="n in composerLines - 1"
            :key="n"
            class="composer-demo__field-line"
          />
        </div>
        <span class="composer-demo__send-glyph">➤</span>
      </div>
    </div>

    <div class="composer-demo__status">
      <span
        class="composer-demo__chip"
        :class="{ 'composer-demo__chip--on': state.atBottom }"
      >
        atBottom
      </span>
      <span
        class="composer-demo__chip"
        :class="{ 'composer-demo__chip--on': state.streaming }"
      >
        streaming
      </span>
      <span
        class="composer-demo__chip"
        :class="{ 'composer-demo__chip--on': reserve }"
      >
        bottomInset {{ inset }}px
      </span>
    </div>

    <div class="composer-demo__actions">
      <button
        type="button"
        class="composer-demo__btn composer-demo__btn--action"
        @click="streaming ? finish() : send()"
      >
        {{ streaming ? 'Finish stream' : 'Send a message' }}
      </button>
    </div>

    <figcaption v-if="caption">
      {{ caption }}
    </figcaption>
  </figure>
</template>

<style scoped>
.composer-demo {
  margin: 1.5em 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 0.875rem;
  background: var(--vp-c-bg-soft);
}
.composer-demo__settings {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding-bottom: 0.75rem;
}
.composer-demo__spacer {
  flex: 1;
}
.composer-demo__toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8125rem;
  color: var(--vp-c-text-2);
  cursor: pointer;
  user-select: none;
}
.composer-demo__select {
  font-size: 0.8125rem;
  padding: 0.15rem 0.3rem;
  border-radius: 6px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
}
.composer-demo__btn {
  font-size: 0.8125rem;
  padding: 0.3rem 0.8rem;
  border-radius: 6px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
  transition: border-color 150ms ease;
}
.composer-demo__btn:hover:not(:disabled) {
  border-color: var(--vp-c-brand-1);
}
.composer-demo__actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding-top: 0.75rem;
}
.composer-demo__btn--action {
  min-width: 9.25rem;
  text-align: center;
  background: var(--vp-c-brand-soft);
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
  font-weight: 600;
}

/* The surface: positioned, fixed height, the composer's containing block. */
.composer-demo__surface {
  position: relative;
}
.composer-demo__chat {
  height: 100%;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  padding: 0.75rem;
  overscroll-behavior: contain;
  /* Keep clientHeight stable when the gutter toggles overflow — see the
     "tight pin" recipe. */
  scrollbar-gutter: stable;
}
.composer-demo__chat:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: -2px;
}
.composer-demo__messages {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}
.composer-demo__msg {
  max-width: 88%;
  border-radius: 10px;
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  line-height: 1.45;
  white-space: pre-wrap;
}
.composer-demo__msg--user {
  align-self: flex-end;
  background: var(--vp-c-brand-soft);
}
.composer-demo__msg--assistant {
  align-self: flex-start;
  background: var(--vp-c-bg-soft);
}

/* The overlay composer — absolutely positioned over the scroller's
   bottom. This is the layout the recipe is about. */
.composer-demo__composer {
  position: absolute;
  left: 0.5rem;
  right: 0.5rem;
  bottom: 0.5rem;
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  padding: 0.5rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-elv);
  box-shadow: var(--vp-shadow-2);
}
/* Reservation off — flag the composer so it's obvious it's eating the
   messages underneath it. */
.composer-demo__composer--ghost {
  border-color: var(--vp-c-danger-1, #e11d48);
}
.composer-demo__field {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 0.35rem;
}
.composer-demo__placeholder {
  font-size: 0.8125rem;
  color: var(--vp-c-text-3);
}
.composer-demo__field-line {
  height: 1.2em;
  border-top: 1px dashed var(--vp-c-divider);
}
.composer-demo__send-glyph {
  flex: none;
  display: grid;
  place-items: center;
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 8px;
  background: var(--vp-c-brand-1);
  color: #fff;
  font-size: 0.8rem;
}
.composer-demo__fab {
  position: absolute;
  right: 0.875rem;
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
    transform 180ms ease,
    bottom 180ms ease;
  box-shadow: var(--vp-shadow-2);
  z-index: 1;
}
.composer-demo__fab--visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
.composer-demo__status {
  display: flex;
  gap: 0.375rem;
  padding: 0.5rem 0.25rem 0;
  flex-wrap: wrap;
}
.composer-demo__chip {
  font-size: 0.6875rem;
  font-family: var(--vp-font-family-mono);
  padding: 0.1rem 0.45rem;
  border-radius: 9999px;
  border: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-3);
  background: var(--vp-c-bg-soft);
}
.composer-demo__chip--on {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}
.composer-demo figcaption {
  text-align: center;
  margin-top: 0.625rem;
  font-size: 0.875em;
  color: var(--vp-c-text-2);
}
@media (prefers-reduced-motion: reduce) {
  .composer-demo__fab {
    transition: none;
  }
}
@media (max-width: 640px) {
  .composer-demo__surface {
    height: 360px !important;
  }
  .composer-demo__btn {
    font-size: 0.75rem;
    padding: 0.3rem 0.55rem;
  }
  .composer-demo__btn--action {
    min-width: 7.5rem;
  }
  /* iOS Safari zooms when a focused control's font is < 16px. */
  .composer-demo__select {
    font-size: 16px;
    padding: 0.05rem 0.2rem;
  }
}
</style>
