import { getCurrentInstance, onBeforeUnmount, ref, type Ref } from 'vue'

import { ASSISTANT_CHUNKS, REASONING_BODY, type DemoMsg } from './data'

export interface UseDemoChatOptions {
  initial?: DemoMsg[]
  /** Stream cadence — one chunk appended per interval. */
  intervalMs?: number
  /** Give assistant replies a collapsible reasoning block. */
  withBlocks?: boolean
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
  const interval = opts.intervalMs ?? 55
  const initial = opts.initial ?? []
  const messages = ref<DemoMsg[]>([...initial])
  const streaming = ref(false)

  let nextId = 1_000_000
  let assistantId: number | null = null
  let chunkIdx = 0
  let timer: ReturnType<typeof setInterval> | null = null

  function clearTimer(): void {
    if (timer !== null) {
      clearInterval(timer)
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
            ? { block: { title: 'Reasoning', body: REASONING_BODY } }
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

  function finalize(): void {
    clearTimer()
    streaming.value = false
    assistantId = null
  }

  // Flip `streaming` only after the final growth has rendered AND the
  // controller's resize pass has followed it: stick-to-bottom snaps
  // only while streaming, so finalizing synchronously with the last
  // chunk orphans that growth above the bottom. Render + RO happen in
  // the first frame, finalize in the second.
  function finalizeAfterSettle(): void {
    clearTimer()
    requestAnimationFrame(() => requestAnimationFrame(finalize))
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
    timer = setInterval(() => {
      if (!appendChunk()) finalizeAfterSettle()
    }, interval)
  }

  function stop(): void {
    if (!streaming.value) return
    clearTimer()
    // Flush the remaining chunks in one go, then finalize after the
    // burst has been followed.
    while (appendChunk()) {
      // appendChunk advances chunkIdx until the reply is exhausted
    }
    finalizeAfterSettle()
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
