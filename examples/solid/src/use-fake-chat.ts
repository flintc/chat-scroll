import { createSignal, getOwner, onCleanup, type Accessor } from 'solid-js'

/**
 * Headless, generic stand-in for `useChat` (Vercel AI SDK) /
 * `useStream` (LangChain). Bring your own message shape; sensible
 * defaults keep the simple case to a one-line call.
 *
 *     // Simple
 *     const chat = useFakeChat({ responseChunks: CHUNKS })
 *
 *     // Power-user — own message shape & rendering
 *     interface MyMsg { id: string; role: 'user' | 'assistant'; parts: Part[] }
 *     const chat = useFakeChat<MyMsg>({
 *       responseChunks: CHUNKS,
 *       createUserMessage: (text, id) => ({ id: String(id), role: 'user', parts: [{ text }] }),
 *       applyChunk: (m, c) => ({ ...m, parts: [{ text: m.parts[0].text + c }] }),
 *       isUser: (m) => m.role === 'user',
 *     })
 */

export interface DefaultChatMessage {
  id: number
  role: 'user' | 'assistant'
  text: string
}

export type ChatStatus = 'idle' | 'streaming' | 'done'

export interface UseFakeChatOptions<TMessage, TChunk = string> {
  initial?: TMessage[]

  /** Chunks replayed for each user submission. */
  responseChunks: readonly TChunk[]

  /**
   * Append an empty assistant placeholder at submit time? Layouts that
   * pre-allocate space (e.g. pin-to-top gutter) want this true. Default false.
   */
  eagerPlaceholder?: boolean

  /**
   * If set, `submit` starts an interval that ticks at this cadence (ms)
   * until the canned response is exhausted — the caller doesn't drive
   * ticks. Mirrors how real chat hooks (Vercel `useChat` etc.) own the
   * stream lifecycle internally.
   */
  autoIntervalMs?: number

  // --- Escape hatches. Defaults below match DefaultChatMessage. ---
  createUserMessage?: (text: string, id: number) => TMessage
  createAssistantMessage?: (id: number) => TMessage
  applyChunk?: (msg: TMessage, chunk: TChunk) => TMessage
}

export interface UseFakeChatReturn<TMessage> {
  messages: Accessor<TMessage[]>
  status: Accessor<ChatStatus>
  isStreaming: Accessor<boolean>

  /** Most recent submitted user message; changes per submit. */
  lastUser: Accessor<TMessage | null>

  /** Submit a prompt and start streaming the canned response. */
  submit: (text: string) => void

  /** Pull one chunk. Returns true if more remain. */
  tick: () => boolean

  /** Finalize the in-flight stream without consuming remaining chunks. */
  stop: () => void
}

const defaultCreateUser = <T>(text: string, id: number): T =>
  ({ id, role: 'user', text }) as unknown as T

const defaultCreateAssistant = <T>(id: number): T =>
  ({ id, role: 'assistant', text: '' }) as unknown as T

const defaultApplyChunk = <T>(m: T, chunk: string): T =>
  ({ ...(m as object), text: (m as { text: string }).text + chunk }) as T

export function useFakeChat<TMessage = DefaultChatMessage, TChunk = string>(
  opts: UseFakeChatOptions<TMessage, TChunk>,
): UseFakeChatReturn<TMessage> {
  const createUser = opts.createUserMessage ?? defaultCreateUser<TMessage>
  const createAssistant =
    opts.createAssistantMessage ?? defaultCreateAssistant<TMessage>
  const applyChunk =
    opts.applyChunk ??
    (defaultApplyChunk as unknown as (m: TMessage, c: TChunk) => TMessage)

  const [messages, setMessages] = createSignal<TMessage[]>(opts.initial ?? [])
  const [status, setStatus] = createSignal<ChatStatus>('idle')
  const [lastUser, setLastUser] = createSignal<TMessage | null>(null)

  // Instance-scoped — starts high to avoid colliding with seed-message ids
  // a caller may have minted ahead of time.
  let nextId = 1_000_000
  let assistantId: number | null = null
  let chunkIdx = 0

  const idOf = (m: TMessage) => (m as { id: number }).id

  let autoTimer: ReturnType<typeof setInterval> | null = null
  function stopAutoTimer() {
    if (autoTimer !== null) {
      clearInterval(autoTimer)
      autoTimer = null
    }
  }
  if (getOwner()) onCleanup(stopAutoTimer)

  function submit(text: string) {
    const userId = nextId++
    chunkIdx = 0
    assistantId = null

    const user = createUser(text, userId)
    setMessages((ms) => {
      const out = [...ms, user]
      if (opts.eagerPlaceholder) {
        const id = nextId++
        assistantId = id
        out.push(createAssistant(id))
      }
      return out
    })
    setLastUser(() => user)
    setStatus('streaming')

    if (opts.autoIntervalMs !== undefined) {
      stopAutoTimer()
      autoTimer = setInterval(() => {
        if (!tick()) stopAutoTimer()
      }, opts.autoIntervalMs)
    }
  }

  function tick(): boolean {
    if (status() !== 'streaming') return false
    const chunk = opts.responseChunks[chunkIdx]
    if (chunk === undefined) {
      finalize()
      return false
    }
    setMessages((ms) => {
      if (assistantId === null) {
        const id = nextId++
        assistantId = id
        return [...ms, applyChunk(createAssistant(id), chunk)]
      }
      const id = assistantId
      return ms.map((m) => (idOf(m) === id ? applyChunk(m, chunk) : m))
    })
    chunkIdx += 1
    if (chunkIdx >= opts.responseChunks.length) {
      finalize()
      return false
    }
    return true
  }

  function stop() {
    stopAutoTimer()
    chunkIdx = opts.responseChunks.length
    finalize()
  }

  function finalize() {
    setStatus('done')
    assistantId = null
  }

  return {
    messages,
    status,
    isStreaming: () => status() === 'streaming',
    lastUser,
    submit,
    tick,
    stop,
  }
}
