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
  buildReplyEvents,
  type DemoEvent,
  type DemoMsg,
} from './data'

export interface UseDemoChatOptions {
  initial?: DemoMsg[]
  /**
   * Stream cadence — one event applied per interval. Reactive: a ref
   * or getter is re-read before every tick, so changing it mid-stream
   * takes effect on the next chunk (the demos' speed control).
   */
  intervalMs?: MaybeRefOrGetter<number>
  /**
   * Stream the reply the way LLM APIs deliver a turn: the Reasoning
   * block streams its body first, then the tool call arrives (its
   * arguments stream into the summary, the result into the body),
   * then the answer text streams. Without this the reply is text-only.
   */
  withBlocks?: boolean
  /**
   * Delay before the FIRST reply event — the window where an agent
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

/** Apply one streamed event to the in-flight assistant message. */
function applyEvent(msg: DemoMsg, e: DemoEvent): DemoMsg {
  if (e.type === 'text') return { ...msg, text: msg.text + e.text }
  const blocks = (msg.blocks ?? []).slice()
  const i = blocks.length - 1
  const last = blocks[i]
  if (e.type === 'block-open') {
    blocks.push({
      kind: e.kind,
      title: e.title,
      ...(e.kind === 'tool' ? { args: '' } : {}),
      body: '',
      streaming: true,
    })
  } else if (e.type === 'block-args' && last) {
    blocks[i] = { ...last, args: (last.args ?? '') + e.text }
  } else if (e.type === 'block-body' && last) {
    blocks[i] = { ...last, body: last.body + e.text }
  } else if (e.type === 'block-close' && last) {
    blocks[i] = { ...last, streaming: false }
  }
  return { ...msg, blocks }
}

/**
 * Minimal stand-in for `useChat` & friends, used by the live docs demos.
 * Timer-driven: `submit()` appends the user turn and streams the canned
 * assistant reply event-by-event until exhausted.
 */
export function useDemoChat(opts: UseDemoChatOptions = {}): UseDemoChatReturn {
  const intervalOf = (): number => toValue(opts.intervalMs) ?? 55
  const initial = opts.initial ?? []
  const messages = ref<DemoMsg[]>([...initial])
  const streaming = ref(false)

  let nextId = 1_000_000
  let assistantId: number | null = null
  let events: DemoEvent[] = []
  let eventIdx = 0
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

  function applyNextEvent(): boolean {
    const e = events[eventIdx]
    if (e === undefined) return false
    if (assistantId === null) {
      assistantId = nextId++
      const fresh: DemoMsg = {
        id: assistantId,
        role: 'assistant',
        text: '',
        ...(opts.withBlocks ? { blocks: [] } : {}),
      }
      messages.value = [...messages.value, applyEvent(fresh, e)]
    } else {
      const id = assistantId
      messages.value = messages.value.map((m) =>
        m.id === id ? applyEvent(m, e) : m,
      )
    }
    eventIdx += 1
    return eventIdx < events.length
  }

  // Flipping `streaming` synchronously with the final growth is safe:
  // the controller keeps following resizes for a short grace period
  // after setStreaming(false), so the last chunk isn't orphaned.
  function finalize(): void {
    clearTimer()
    streaming.value = false
    assistantId = null
  }

  function scheduleNextEvent(): void {
    const delay =
      eventIdx === 0
        ? (toValue(opts.firstChunkDelayMs) ?? intervalOf())
        : intervalOf()
    timer = setTimeout(() => {
      if (applyNextEvent()) {
        scheduleNextEvent()
      } else {
        finalize()
      }
    }, delay)
  }

  function submit(text: string): void {
    clearTimer()
    events = opts.withBlocks
      ? buildReplyEvents()
      : ASSISTANT_CHUNKS.map((t) => ({ type: 'text', text: t }))
    eventIdx = 0
    assistantId = null
    messages.value = [
      ...messages.value,
      { id: nextId++, role: 'user', text },
    ]
    streaming.value = true
    scheduleNextEvent()
  }

  function stop(): void {
    if (!streaming.value) return
    clearTimer()
    // Flush the remaining events in one go; the controller's
    // streaming-end grace follows the burst.
    while (applyNextEvent()) {
      // applyNextEvent advances eventIdx until the reply is exhausted
    }
    finalize()
  }

  function reset(): void {
    clearTimer()
    streaming.value = false
    assistantId = null
    events = []
    eventIdx = 0
    messages.value = [...initial]
  }

  return { messages, streaming, submit, stop, reset }
}
