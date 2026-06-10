import {
  createRenderEffect,
  createSignal,
  getOwner,
  onCleanup,
  type Accessor,
} from 'solid-js'

import {
  createChatScroll as createCoreInstance,
  type ChatScrollInstance,
  type ChatScrollOptions,
  type ChatScrollState,
  type ScrollPosition,
} from '@chat-scroll/core'

export interface CreateChatScrollOptions extends ChatScrollOptions {
  /**
   * Reactive streaming flag. Pass a Solid accessor (typically a signal
   * getter or `() => upstream.isRunning`); the adapter mirrors its value
   * into the controller via `setStreaming` whenever it changes. Use this
   * when an upstream source already owns the request lifecycle. Omit to
   * drive `setStreaming` imperatively from your event handlers.
   */
  streaming?: Accessor<boolean>
}

export interface CreateChatScrollReturn {
  /** Reactive state accessor — call to read current state. */
  state: Accessor<ChatScrollState>

  /** Pass to your container element's `ref={…}` attribute. */
  containerRef: (el: HTMLElement) => void

  /** Pass to your message-list wrapper's `ref={…}` attribute. */
  contentRef: (el: HTMLElement) => void

  /** Underlying instance. */
  instance: ChatScrollInstance

  pinMessage: (el: HTMLElement) => void
  pinLatest: (selector: string) => void
  pinRelative: (selector: string, direction: -1 | 1) => boolean
  getPinnedElement: () => HTMLElement | null
  scrollToBottom: () => void
  lock: () => void
  unlock: () => void
  setStreaming: (streaming: boolean) => void
  reset: () => void
  savePosition: () => ScrollPosition
  restorePosition: (pos: ScrollPosition) => void
}

/**
 * Solid composable wrapping `@chat-scroll/core`.
 *
 *     const scroll = createChatScroll({
 *       strategy: 'pin-to-top',
 *       streaming: () => agent.isRunning,   // controlled — mirrors upstream
 *     })
 *
 *     <div ref={scroll.containerRef}>
 *       <div ref={scroll.contentRef}>
 *         <For each={messages()}>{(m) => <Bubble msg={m} />}</For>
 *       </div>
 *     </div>
 *
 * Or omit `streaming` and call `scroll.setStreaming(true/false)` from your
 * own handlers when you own the request lifecycle directly.
 */
export function createChatScroll(
  opts: CreateChatScrollOptions = {},
): CreateChatScrollReturn {
  const instance = createCoreInstance(opts)

  const [state, setState] = createSignal<ChatScrollState>({ ...instance.state })
  const off = instance.subscribe((s) => setState({ ...s }))

  // Mirror reactive `streaming` input. `createRenderEffect` runs
  // synchronously on creation and on each dep change, so the controller
  // is in sync before the caller even returns. Skipped entirely when
  // `streaming` is omitted, so imperative callers of
  // `scroll.setStreaming` are untouched.
  if (opts.streaming) {
    const streamingAccessor = opts.streaming
    createRenderEffect(() => instance.setStreaming(streamingAccessor()))
  }

  let containerEl: HTMLElement | null = null
  let contentEl: HTMLElement | null = null
  function tryMount(): void {
    if (containerEl && contentEl) instance.mount(containerEl, contentEl)
  }

  const containerRef = (el: HTMLElement): void => {
    containerEl = el
    tryMount()
  }
  const contentRef = (el: HTMLElement): void => {
    contentEl = el
    tryMount()
  }

  if (getOwner()) {
    onCleanup(() => {
      off()
      instance.destroy()
    })
  }

  return {
    state,
    containerRef,
    contentRef,
    instance,
    pinMessage: instance.pinMessage,
    pinLatest: instance.pinLatest,
    pinRelative: instance.pinRelative,
    getPinnedElement: instance.getPinnedElement,
    scrollToBottom: instance.scrollToBottom,
    lock: instance.lock,
    unlock: instance.unlock,
    setStreaming: instance.setStreaming,
    reset: instance.reset,
    savePosition: instance.savePosition,
    restorePosition: instance.restorePosition,
  }
}
