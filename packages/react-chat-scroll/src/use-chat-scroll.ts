import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react'

import {
  createChatScroll,
  type ChatScrollInstance,
  type ChatScrollOptions,
  type ChatScrollState,
} from '@chat-scroll/core'

export interface UseChatScrollOptions extends ChatScrollOptions {
  /**
   * Reactive streaming flag. When provided, the adapter mirrors this value
   * into the controller via `setStreaming` whenever it changes. Use this
   * when an upstream source already owns the request lifecycle — e.g.
   * `useChat`'s `isLoading`, an agent SDK's `isRunning`, or
   * `useQuery`'s `isFetching`. Omit to drive `setStreaming` imperatively
   * from your event handlers (see the demo's `send` / `finishStream`
   * pattern).
   */
  streaming?: boolean
}

export interface UseChatScrollReturn {
  /** Reactive state — updates trigger re-renders. */
  state: ChatScrollState

  /** Attach to your scrollable container element. */
  containerRef: (el: HTMLElement | null) => void

  /** Attach to your message-list wrapper (direct child of container). */
  contentRef: (el: HTMLElement | null) => void

  /** Underlying instance — escape hatch for advanced use. */
  instance: ChatScrollInstance

  // Re-exposed instance methods so consumers don't need to dig into `.instance`.
  pinMessage: ChatScrollInstance['pinMessage']
  pinLatest: ChatScrollInstance['pinLatest']
  pinRelative: ChatScrollInstance['pinRelative']
  scrollToBottom: ChatScrollInstance['scrollToBottom']
  lock: ChatScrollInstance['lock']
  unlock: ChatScrollInstance['unlock']
  setStreaming: ChatScrollInstance['setStreaming']
  reset: ChatScrollInstance['reset']
  savePosition: ChatScrollInstance['savePosition']
  restorePosition: ChatScrollInstance['restorePosition']
}

/**
 * React adapter — wires `@chat-scroll/core` to React's reactive state.
 *
 *     function ChatView({ messages, isLoading }) {
 *       const scroll = useChatScroll({
 *         strategy: 'pin-to-top',
 *         streaming: isLoading,        // controlled — mirrors upstream state
 *       })
 *       return (
 *         <div ref={scroll.containerRef}>
 *           <div ref={scroll.contentRef}>
 *             {messages.map((m) => <Message key={m.id} {...m} />)}
 *           </div>
 *         </div>
 *       )
 *     }
 *
 * Or omit `streaming` and call `scroll.setStreaming(true/false)` from your
 * own event handlers when you own the request lifecycle directly.
 */
export function useChatScroll(
  opts: UseChatScrollOptions = {},
): UseChatScrollReturn {
  // Single instance for the lifetime of the component.
  const instanceRef = useRef<ChatScrollInstance | null>(null)
  if (instanceRef.current === null) {
    instanceRef.current = createChatScroll(opts)
  }
  const instance = instanceRef.current

  // Keep options in sync. We exclude `onScrollChange` here — adapters own
  // the subscription via subscribe() below.
  useEffect(() => {
    instance.setOptions({
      strategy: opts.strategy,
      bottomThreshold: opts.bottomThreshold,
      scrollMargin: opts.scrollMargin,
      scrollBehavior: opts.scrollBehavior,
      scrollDurationMs: opts.scrollDurationMs,
    })
  }, [
    instance,
    opts.strategy,
    opts.bottomThreshold,
    opts.scrollMargin,
    opts.scrollBehavior,
    opts.scrollDurationMs,
  ])

  // Mirror reactive `streaming` input. Skipped entirely when undefined,
  // so imperative callers of `scroll.setStreaming` are untouched.
  useEffect(() => {
    if (opts.streaming === undefined) return
    instance.setStreaming(opts.streaming)
  }, [instance, opts.streaming])

  // Reactive state via useSyncExternalStore.
  const subscribe = useCallback(
    (cb: () => void) => instance.subscribe(cb),
    [instance],
  )
  const getSnapshot = useCallback(() => instance.state, [instance])
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  // Refs — we defer mount until both are available.
  const containerElRef = useRef<HTMLElement | null>(null)
  const contentElRef = useRef<HTMLElement | null>(null)

  const tryMount = useCallback(() => {
    const c = containerElRef.current
    const i = contentElRef.current
    if (c && i) instance.mount(c, i)
  }, [instance])

  const containerRef = useCallback(
    (el: HTMLElement | null) => {
      containerElRef.current = el
      if (el) tryMount()
    },
    [tryMount],
  )

  const contentRef = useCallback(
    (el: HTMLElement | null) => {
      contentElRef.current = el
      if (el) tryMount()
    },
    [tryMount],
  )

  // Tear down on unmount. The setup half re-mounts from the stored refs:
  // under React 18's StrictMode the simulated unmount runs `destroy()`
  // but callback refs are NOT re-invoked on the simulated remount, so
  // without this the instance would stay dead (no listeners, no gutter)
  // for the component's real lifetime.
  useEffect(() => {
    tryMount()
    return () => instance.destroy()
  }, [instance, tryMount])

  // Bind methods so they stay stable.
  return useMemo<UseChatScrollReturn>(
    () => ({
      state,
      containerRef,
      contentRef,
      instance,
      pinMessage: instance.pinMessage,
      pinLatest: instance.pinLatest,
      pinRelative: instance.pinRelative,
      scrollToBottom: instance.scrollToBottom,
      lock: instance.lock,
      unlock: instance.unlock,
      setStreaming: instance.setStreaming,
      reset: instance.reset,
      savePosition: instance.savePosition,
      restorePosition: instance.restorePosition,
    }),
    [state, containerRef, contentRef, instance],
  )
}
