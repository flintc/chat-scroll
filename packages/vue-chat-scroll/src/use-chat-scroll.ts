import {
  getCurrentInstance,
  isRef,
  onBeforeUnmount,
  readonly,
  ref,
  shallowRef,
  toValue,
  watch,
  watchEffect,
  type ComponentPublicInstance,
  type DeepReadonly,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue'

import {
  createChatScroll,
  type ChatScrollInstance,
  type ChatScrollOptions,
  type ChatScrollState,
  type ReferenceMessage,
  type ScrollPosition,
} from '@chat-scroll/core'

export interface UseChatScrollOptions extends ChatScrollOptions {
  /**
   * Reactive streaming flag. Accepts a plain boolean, a `Ref<boolean>`, or
   * a getter; the adapter mirrors its current value into the controller via
   * `setStreaming` whenever it changes. Use this when an upstream source
   * already owns the request lifecycle. Omit to drive `setStreaming`
   * imperatively from your event handlers.
   */
  streaming?: MaybeRefOrGetter<boolean>
}

/**
 * Signature accepted by Vue's `:ref="..."` template attribute when bound
 * to a function ref. Vue passes the element for plain HTML, or the
 * component instance for components — we narrow to an Element inside.
 */
export type TemplateRefFn = (
  el: Element | ComponentPublicInstance | null,
) => void

export interface UseChatScrollReturn {
  /** Reactive state — read-only ref. */
  state: DeepReadonly<Ref<ChatScrollState>>

  /** Set the scrollable container element (template ref). */
  containerRef: TemplateRefFn

  /** Set the message-list wrapper (template ref). */
  contentRef: TemplateRefFn

  /** Underlying instance. */
  instance: ChatScrollInstance

  pinMessage: (el: HTMLElement) => void
  pinLatest: (selector: string) => void
  pinRelative: (selector: string, direction: -1 | 1) => boolean
  getPinnedElement: () => HTMLElement | null
  referenceMessage: (selector: string) => ReferenceMessage
  relativeMessage: (selector: string, direction: -1 | 1) => HTMLElement | null
  scrollToMessage: (el: HTMLElement) => void
  scrollToBottom: () => void
  lock: () => void
  unlock: () => void
  setStreaming: (streaming: boolean) => void
  reset: () => void
  savePosition: () => ScrollPosition
  restorePosition: (pos: ScrollPosition) => void
}

/**
 * Vue 3 composable wrapping `@chat-scroll/core`.
 *
 *     <script setup>
 *     const { isLoading } = useChat()
 *     const scroll = useChatScroll({
 *       strategy: 'pin-to-top',
 *       streaming: isLoading,           // controlled — mirrors upstream ref
 *     })
 *     </script>
 *
 *     <template>
 *       <div :ref="scroll.containerRef">
 *         <div :ref="scroll.contentRef">
 *           <Message v-for="m in messages" :key="m.id" :msg="m" />
 *         </div>
 *       </div>
 *     </template>
 *
 * Or omit `streaming` and call `scroll.setStreaming(true/false)` from your
 * own handlers when you own the request lifecycle directly.
 */
export function useChatScroll(
  opts: UseChatScrollOptions | Ref<UseChatScrollOptions> = {},
): UseChatScrollReturn {
  const initialOpts = isRef(opts) ? opts.value : opts
  const instance = createChatScroll(initialOpts)

  const state = ref<ChatScrollState>({ ...instance.state })
  const off = instance.subscribe((s) => {
    state.value = { ...s }
  })

  // Watch reactive options if provided.
  if (isRef(opts)) {
    watch(
      opts,
      (next) => {
        instance.setOptions({
          strategy: next.strategy,
          bottomThreshold: next.bottomThreshold,
          scrollMargin: next.scrollMargin,
          bottomInset: next.bottomInset,
          scrollBehavior: next.scrollBehavior,
          scrollDurationMs: next.scrollDurationMs,
          pinClamp: next.pinClamp,
        })
      },
      { deep: true },
    )
  }

  // Mirror reactive `streaming` input. Skipped entirely when undefined,
  // so imperative callers of `scroll.setStreaming` are untouched.
  watchEffect(() => {
    const o = isRef(opts) ? opts.value : opts
    const v = toValue(o.streaming)
    if (v !== undefined) instance.setStreaming(v)
  })

  const containerEl = shallowRef<HTMLElement | null>(null)
  const contentEl = shallowRef<HTMLElement | null>(null)

  function tryMount(): void {
    if (containerEl.value && contentEl.value) {
      instance.mount(containerEl.value, contentEl.value)
    }
  }

  const asEl = (
    v: Element | ComponentPublicInstance | null,
  ): HTMLElement | null => {
    if (v === null) return null
    if (v instanceof Element) return v as HTMLElement
    // Component public instance — unwrap to its root DOM node.
    const root = (v as ComponentPublicInstance).$el as unknown
    return root instanceof Element ? (root as HTMLElement) : null
  }

  const containerRef: TemplateRefFn = (el) => {
    containerEl.value = asEl(el)
    tryMount()
  }
  const contentRef: TemplateRefFn = (el) => {
    contentEl.value = asEl(el)
    tryMount()
  }

  // onBeforeUnmount only works inside a component setup. If the composable
  // is used outside of one (advanced/scripting case) callers must call
  // `instance.destroy()` themselves.
  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      off()
      instance.destroy()
    })
  }

  return {
    state: readonly(state),
    containerRef,
    contentRef,
    instance,
    pinMessage: instance.pinMessage,
    pinLatest: instance.pinLatest,
    pinRelative: instance.pinRelative,
    getPinnedElement: instance.getPinnedElement,
    referenceMessage: instance.referenceMessage,
    relativeMessage: instance.relativeMessage,
    scrollToMessage: instance.scrollToMessage,
    scrollToBottom: instance.scrollToBottom,
    lock: instance.lock,
    unlock: instance.unlock,
    setStreaming: instance.setStreaming,
    reset: instance.reset,
    savePosition: instance.savePosition,
    restorePosition: instance.restorePosition,
  }
}
