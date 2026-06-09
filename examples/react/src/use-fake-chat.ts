import { useEffect, useRef, useState } from 'react'

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
  messages: TMessage[]
  status: ChatStatus
  isStreaming: boolean

  /** Most recent submitted user message; changes per submit. */
  lastUser: TMessage | null

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

  const [messages, setMessages] = useState<TMessage[]>(
    () => opts.initial ?? [],
  )
  const [status, setStatusState] = useState<ChatStatus>('idle')
  const [lastUser, setLastUser] = useState<TMessage | null>(null)

  // Mutable internals — `tick` runs from interval callbacks, so the
  // engine reads/writes refs synchronously and only mirrors renderable
  // values into state. Ids start high to avoid colliding with
  // seed-message ids a caller may have minted ahead of time.
  const statusRef = useRef<ChatStatus>('idle')
  const nextIdRef = useRef(1_000_000)
  const assistantIdRef = useRef<number | null>(null)
  const chunkIdxRef = useRef(0)
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const idOf = (m: TMessage) => (m as { id: number }).id

  function setStatus(s: ChatStatus) {
    statusRef.current = s
    setStatusState(s)
  }

  function stopAutoTimer() {
    if (autoTimerRef.current !== null) {
      clearInterval(autoTimerRef.current)
      autoTimerRef.current = null
    }
  }
  useEffect(() => stopAutoTimer, [])

  function submit(text: string) {
    const userId = nextIdRef.current++
    chunkIdxRef.current = 0
    assistantIdRef.current = null

    // Mint messages outside the updater — React may re-invoke updaters,
    // so they must stay pure (no ref mutation inside).
    const user = createUser(text, userId)
    let placeholder: TMessage | null = null
    if (opts.eagerPlaceholder) {
      const id = nextIdRef.current++
      assistantIdRef.current = id
      placeholder = createAssistant(id)
    }
    setMessages((ms) =>
      placeholder !== null ? [...ms, user, placeholder] : [...ms, user],
    )
    setLastUser(user)
    setStatus('streaming')

    if (opts.autoIntervalMs !== undefined) {
      stopAutoTimer()
      autoTimerRef.current = setInterval(() => {
        if (!tick()) stopAutoTimer()
      }, opts.autoIntervalMs)
    }
  }

  function tick(): boolean {
    if (statusRef.current !== 'streaming') return false
    const chunk = opts.responseChunks[chunkIdxRef.current]
    if (chunk === undefined) {
      finalize()
      return false
    }
    if (assistantIdRef.current === null) {
      const id = nextIdRef.current++
      assistantIdRef.current = id
      const first = applyChunk(createAssistant(id), chunk)
      setMessages((ms) => [...ms, first])
    } else {
      const id = assistantIdRef.current
      setMessages((ms) =>
        ms.map((m) => (idOf(m) === id ? applyChunk(m, chunk) : m)),
      )
    }
    chunkIdxRef.current += 1
    if (chunkIdxRef.current >= opts.responseChunks.length) {
      finalize()
      return false
    }
    return true
  }

  function stop() {
    stopAutoTimer()
    chunkIdxRef.current = opts.responseChunks.length
    finalize()
  }

  function finalize() {
    setStatus('done')
    assistantIdRef.current = null
  }

  return {
    messages,
    status,
    isStreaming: status === 'streaming',
    lastUser,
    submit,
    tick,
    stop,
  }
}
