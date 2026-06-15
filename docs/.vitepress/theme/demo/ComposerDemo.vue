<script setup lang="ts">
/**
 * Self-contained demo for the "Overlay composer" recipe. Deliberately
 * does NOT reuse ChatPane / useDemoChat — it needs its own overlaid
 * composer and a `bottomInset` control, and staying standalone keeps it
 * decoupled from the shared demo harness. Mock data, a tiny word-by-word
 * streamer, the real Vue adapter.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useChatScroll } from '@chat-scroll/vue'
import type { ChatScrollStrategy } from '@chat-scroll/vue'

withDefaults(defineProps<{ caption?: string }>(), {})

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
  'from behind the composer. Notice that nothing here touches the ' +
  'container padding — the library owns the reservation, and it tracks ' +
  'the composer height as it changes. Scroll to the very bottom and the ' +
  'final words sit just above the input, never under it.'

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
      entry?.borderBoxSize?.[0]?.blockSize ?? composerEl.value?.offsetHeight ?? 0
  })
  ro.observe(composerEl.value)
})
onBeforeUnmount(() => ro?.disconnect())

// The inset the library reserves: the composer's height when reservation
// is on, 0 when off (so you can watch the last message duck behind it).
const inset = computed(() => (reserve.value ? composerH.value : 0))

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
watch(
  inset,
  (px) => scroll.instance.setOptions({ bottomInset: px }),
  { immediate: true },
)
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
        'room to clear it. Try the toggle below.',
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
  <figure class="cd">
    <div class="cd__settings">
      <div class="cd__seg" role="group" aria-label="Strategy">
        <button
          type="button"
          :class="{ on: strategy === 'pin-to-top' }"
          @click="strategy = 'pin-to-top'"
        >
          pin-to-top
        </button>
        <button
          type="button"
          :class="{ on: strategy === 'stick-to-bottom' }"
          @click="strategy = 'stick-to-bottom'"
        >
          stick-to-bottom
        </button>
      </div>
      <span class="cd__spacer" />
      <label
        class="cd__toggle"
        title="Reserve the band the composer overlays (bottomInset)"
      >
        <input v-model="reserve" type="checkbox" />
        Reserve space
      </label>
      <label class="cd__toggle" title="Grow the composer to watch the reservation track it">
        Composer
        <select v-model.number="composerLines" class="cd__select" aria-label="Composer height">
          <option :value="1">1 line</option>
          <option :value="2">2 lines</option>
          <option :value="3">3 lines</option>
        </select>
      </label>
      <button type="button" class="cd__btn" @click="reset">Reset</button>
    </div>

    <!-- The shell is the composer's containing block; the scroller fills
         it and the composer overlays the bottom. No container padding —
         `bottomInset` reserves the space in the library's gutter. -->
    <div class="cd__shell">
      <div
        class="cd__scroll"
        :ref="containerRef"
        tabindex="0"
        role="log"
        aria-label="Conversation"
      >
        <div class="cd__messages" :ref="contentRef">
          <div
            v-for="m in messages"
            :key="m.id"
            class="cd__msg"
            :class="`cd__msg--${m.role}`"
            :data-role="m.role"
          >
            {{ m.text }}
          </div>
        </div>
      </div>

      <button
        class="cd__fab"
        :class="{ 'cd__fab--visible': !state.atBottom }"
        :style="{ bottom: `calc(${composerH}px + 0.6rem)` }"
        aria-label="Scroll to bottom"
        @click="scrollToBottom()"
      >
        ↓
      </button>

      <!-- The overlay composer. Its height is measured and fed back as
           `bottomInset`. The extra "lines" simulate a textarea growing. -->
      <div
        ref="composerEl"
        class="cd__composer"
        :class="{ 'cd__composer--ghost': !reserve }"
      >
        <div class="cd__composer-field">
          <span class="cd__composer-placeholder">Message…</span>
          <span v-for="n in composerLines - 1" :key="n" class="cd__composer-extra" />
        </div>
        <button
          type="button"
          class="cd__send"
          @click="streaming ? finish() : send()"
        >
          {{ streaming ? '■' : '➤' }}
        </button>
      </div>
    </div>

    <p class="cd__readout">
      <code>bottomInset: {{ inset }}px</code>
      <span class="cd__dot">·</span>
      <span :class="{ 'cd__warn': !reserve }">
        {{ reserve ? 'last message clears the composer' : 'reservation off — the bottom hides behind the composer' }}
      </span>
    </p>

    <figcaption v-if="caption">{{ caption }}</figcaption>
  </figure>
</template>

<style scoped>
.cd {
  margin: 1.5em 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 0.875rem;
  background: var(--vp-c-bg-soft);
}
.cd__settings {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding-bottom: 0.75rem;
}
.cd__spacer {
  flex: 1;
}
.cd__seg {
  display: inline-flex;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  overflow: hidden;
}
.cd__seg button {
  font-size: 0.75rem;
  padding: 0.25rem 0.6rem;
  border: 0;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  cursor: pointer;
}
.cd__seg button.on {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-weight: 600;
}
.cd__toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8125rem;
  color: var(--vp-c-text-2);
  cursor: pointer;
  user-select: none;
}
.cd__select {
  font-size: 0.8125rem;
  padding: 0.15rem 0.3rem;
  border-radius: 6px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
}
.cd__btn {
  font-size: 0.8125rem;
  padding: 0.3rem 0.8rem;
  border-radius: 6px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
}
.cd__btn:hover {
  border-color: var(--vp-c-brand-1);
}

/* The shell: positioned, fixed height, the composer's containing block. */
.cd__shell {
  position: relative;
  height: 420px;
}
.cd__scroll {
  height: 100%;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  padding: 0.75rem;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
.cd__scroll:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: -2px;
}
.cd__messages {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}
.cd__msg {
  max-width: 88%;
  border-radius: 10px;
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  line-height: 1.45;
  white-space: pre-wrap;
}
.cd__msg--user {
  align-self: flex-end;
  background: var(--vp-c-brand-soft);
}
.cd__msg--assistant {
  align-self: flex-start;
  background: var(--vp-c-bg-soft);
}

/* The overlay composer — absolutely positioned over the scroller's
   bottom. This is the layout the recipe is about. */
.cd__composer {
  position: absolute;
  left: 0.5rem;
  right: 0.5rem;
  bottom: 0.5rem;
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  padding: 0.5rem;
  border: 1px solid var(--vp-c-brand-1);
  border-radius: 10px;
  background: var(--vp-c-bg-elv);
  box-shadow: var(--vp-shadow-2);
}
/* When reservation is off, tint the composer red so it's obvious it's
   eating the messages underneath. */
.cd__composer--ghost {
  border-color: var(--vp-c-danger-1, #e11d48);
}
.cd__composer-field {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 0.35rem;
}
.cd__composer-placeholder {
  font-size: 0.8125rem;
  color: var(--vp-c-text-3);
}
.cd__composer-extra {
  height: 1.2em;
  border-top: 1px dashed var(--vp-c-divider);
}
.cd__send {
  flex: none;
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 8px;
  border: 0;
  background: var(--vp-c-brand-1);
  color: #fff;
  cursor: pointer;
  font-size: 0.8rem;
}
.cd__fab {
  position: absolute;
  right: 1rem;
  width: 2rem;
  height: 2rem;
  border-radius: 9999px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-elv);
  color: var(--vp-c-text-1);
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
.cd__fab--visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
.cd__readout {
  margin: 0.625rem 0 0;
  font-size: 0.75rem;
  color: var(--vp-c-text-2);
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.cd__readout code {
  font-size: 0.72rem;
}
.cd__dot {
  color: var(--vp-c-text-3);
}
.cd__warn {
  color: var(--vp-c-danger-1, #e11d48);
}
.cd figcaption {
  text-align: center;
  margin-top: 0.625rem;
  font-size: 0.875em;
  color: var(--vp-c-text-2);
}
@media (prefers-reduced-motion: reduce) {
  .cd__fab {
    transition: none;
  }
}
@media (max-width: 640px) {
  .cd__shell {
    height: 360px;
  }
}
</style>
