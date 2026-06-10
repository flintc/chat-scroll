import {
  getCurrentInstance,
  onBeforeUnmount,
  ref,
  toValue,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue'

import {
  ASSISTANT_CHUNKS,
  REASONING_BODY,
  TOOL_CALL_BODY,
  type DemoMsg,
} from './data'

export interface UseDemoChatOptions {
  initial?: DemoMsg[]
  /**
   * Stream cadence — one chunk appended per interval. Reactive: a ref
   * or getter is re-read before every tick, so changing it mid-stream
   * takes effect on the next chunk (the demos' speed control).
   */
  intervalMs?: MaybeRefOrGetter<number>
  /** Give assistant replies collapsible reasoning + tool-call blocks. */
  withBlocks?: boolean
  /**
   * Delay before the FIRST reply chunk — the window where an agent
   * narrates its progress (the agent-status demo). Defaults to the
   * regular cadence.
   */
  firstChunkDelayMs?: MaybeRefOrGetter<number>
}

export interface UseDemoChatReturn {
  messages: Ref<DemoMsg[]>
  streaming: Ref<boolean>
  /** Append a user message and start streaming the canned reply. */
  submit: (text: string) => void
  /** Finish the in-flight stream immediately (rest of reply appears at once). */
  stop: () => void
  /** Back to the initial conversation. */
  reset: () => void
}

/**
 * Minimal stand-in for `useChat` & friends, used by the live docs demos.
 * Timer-driven: `submit()` appends the user turn and streams the canned
 * assistant reply chunk-by-chunk until exhausted.
 */
export function useDemoChat(opts: UseDemoChatOptions = {}): UseDemoChatReturn {
  const intervalOf = (): number => toValue(opts.intervalMs) ?? 55
  const initial = opts.initial ?? []
  const messages = ref<DemoMsg[]>([...initial])
  const streaming = ref(false)

  let nextId = 1_000_000
  let assistantId: number | null = null
  let chunkIdx = 0
  // Self-scheduling timeout (not setInterval) so the cadence is
  // re-read on every tick — see UseDemoChatOptions.intervalMs.
  let timer: ReturnType<typeof setTimeout> | null = null

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }
  if (getCurrentInstance()) onBeforeUnmount(clearTimer)

  function appendChunk(): boolean {
    const chunk = ASSISTANT_CHUNKS[chunkIdx]
    if (chunk === undefined) return false
    if (assistantId === null) {
      assistantId = nextId++
      messages.value = [
        ...messages.value,
        {
          id: assistantId,
          role: 'assistant',
          text: chunk,
          ...(opts.withBlocks
            ? {
                blocks: [
                  { title: 'Reasoning', body: REASONING_BODY },
                  { title: 'Tool call · search_docs', body: TOOL_CALL_BODY },
                ],
              }
            : {}),
        },
      ]
    } else {
      const id = assistantId
      messages.value = messages.value.map((m) =>
        m.id === id ? { ...m, text: m.text + chunk } : m,
      )
    }
    chunkIdx += 1
    return chunkIdx < ASSISTANT_CHUNKS.length
  }

  // Flipping `streaming` synchronously with the final growth is safe:
  // the controller keeps following resizes for a short grace period
  // after setStreaming(false), so the last chunk isn't orphaned.
  function finalize(): void {
    clearTimer()
    streaming.value = false
    assistantId = null
  }

  function scheduleNextChunk(): void {
    const delay =
      chunkIdx === 0
        ? (toValue(opts.firstChunkDelayMs) ?? intervalOf())
        : intervalOf()
    timer = setTimeout(() => {
      if (appendChunk()) {
        scheduleNextChunk()
      } else {
        finalize()
      }
    }, delay)
  }

  function submit(text: string): void {
    clearTimer()
    chunkIdx = 0
    assistantId = null
    messages.value = [
      ...messages.value,
      { id: nextId++, role: 'user', text },
    ]
    streaming.value = true
    scheduleNextChunk()
  }

  function stop(): void {
    if (!streaming.value) return
    clearTimer()
    // Flush the remaining chunks in one go; the controller's
    // streaming-end grace follows the burst.
    while (appendChunk()) {
      // appendChunk advances chunkIdx until the reply is exhausted
    }
    finalize()
  }

  function reset(): void {
    clearTimer()
    streaming.value = false
    assistantId = null
    chunkIdx = 0
    messages.value = [...initial]
  }

  return { messages, streaming, submit, stop, reset }
}
