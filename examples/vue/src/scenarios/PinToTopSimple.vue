<script setup lang="ts">
import { useChatScroll } from '@chat-scroll/vue'
import {
  ASSISTANT_SEGMENTS,
  PRIOR_TURNS,
  USER_PROMPT,
} from '@chat-scroll/example-shared'
import RichMessageView from '../RichMessageView.vue'
import { seedFromPriorTurns, useRichChat } from '../use-rich-chat'

/**
 * Minimal pin-to-top demo — written the way a host app would write it
 * against a real chat hook (Vercel `useChat`, LangChain `useStream`).
 *
 * The hook owns the stream lifecycle and exposes `messages` + an
 * `isStreaming` ref. `useChatScroll` mirrors that ref into the
 * controller, so overflow-anchor and the gutter release happen
 * automatically. The only thing the strategy needs from the host is one
 * `pinLatest` call at submit time.
 */
const chat = useRichChat({
  initial: seedFromPriorTurns(PRIOR_TURNS),
  segments: ASSISTANT_SEGMENTS,
  autoIntervalMs: 100,
})

const scroll = useChatScroll({
  strategy: 'pin-to-top',
  streaming: chat.isStreaming,
})

function send() {
  chat.submit(USER_PROMPT)
  scroll.pinLatest('[data-test="user-msg"]')
}

function prevUser() {
  scroll.pinRelative('[data-test="user-msg"]', -1)
}

function nextUser() {
  scroll.pinRelative('[data-test="user-msg"]', 1)
}
</script>

<template>
  <div
    class="chat"
    data-scenario="pin-to-top-simple"
    style="position: relative"
  >
    <div class="chat__scroll" data-test="scroll" :ref="scroll.containerRef">
      <div class="chat__list" data-test="list" :ref="scroll.contentRef">
        <RichMessageView
          v-for="m in chat.messages.value"
          :key="m.id"
          :msg="m"
        />
      </div>
    </div>
    <div class="controls">
      <button data-test="send" @click="send">Send</button>
      <button data-test="finish" @click="chat.stop()">Finish stream</button>
      <button
        data-test="prev-user"
        aria-label="Previous user message"
        @click="prevUser"
      >
        ▲ Prev
      </button>
      <button
        data-test="next-user"
        aria-label="Next user message"
        @click="nextUser"
      >
        ▼ Next
      </button>
    </div>
  </div>
</template>
