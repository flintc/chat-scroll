import { createGutter } from './gutter'
import { recalcGutter } from './strategies/pin-to-top'
import type { ChatScrollInstance, ChatScrollOptions } from './types'
import { createControllerContext, STRATEGIES } from './controller/context'
import {
  attachResizeObservers,
  makeScrollListener,
  teardownDom,
} from './controller/dom'
import {
  applyContainerStyles,
  applyContentStyles,
} from './controller/dom-styles'
import { attachUserInputCancellers } from './controller/input'
import {
  referenceMessage,
  pinRelative,
  relativeMessage,
  scrollToMessage,
} from './controller/navigation'
import { getPinnedElement, pinLatest, pinMessage } from './controller/pin'
import { restorePosition, savePosition } from './controller/position'
import {
  applyBottomReservation,
  measureAtBottom,
} from './controller/reservation'
import { startAnimatedScroll } from './controller/scroll-animation'
import { commit, subscribe } from './controller/store'
import { cancelStreamingGrace, setStreaming } from './controller/streaming'

/**
 * Create a `ChatScroll` instance — the framework-agnostic core.
 *
 * Adapters wrap this with their reactivity primitives. Consumers can also use
 * it directly without a framework:
 *
 *     const scroll = createChatScroll({ strategy: 'pin-to-top' })
 *     scroll.mount(containerEl, contentEl)
 *     scroll.pinMessage(userMessageEl)
 *     // ...later
 *     scroll.destroy()
 *
 * This factory is deliberately thin: it builds the shared controller context
 * (`cc`) and delegates every capability to a focused module in `./controller`.
 * The lifecycle orchestration (mount / setOptions / reset / destroy and the
 * small lock / unlock / scrollToBottom methods) lives here; everything
 * substantive lives in the modules.
 */
export function createChatScroll(
  opts: ChatScrollOptions = {},
): ChatScrollInstance {
  const cc = createControllerContext(opts)

  function mount(container: HTMLElement, content: HTMLElement): void {
    if (cc.ctx.container === container && cc.ctx.content === content) return
    if (cc.ctx.container) teardownDom(cc)

    cc.ctx.container = container
    cc.ctx.content = content

    applyContainerStyles(cc)
    applyContentStyles(cc)
    cc.ctx.gutter = createGutter(container)
    // Strategies call this to request a smooth catch-up to the pin instead of
    // a synchronous `scrollTop = pinnedY` jump. Used after the
    // pointerdown-abort case where the user is far from the pin and a teleport
    // would be visible. Pass a GETTER so the catch-up tracks `pinnedY` across
    // mid-flight content changes — when the abort coincides with a block CSS
    // expand animation, the block keeps growing through the catch-up window
    // and `pinnedY` shifts each ResizeObserver tick. Without the getter the
    // catch-up lands at the initial value and the pin ends up visibly low.
    cc.ctx.reAnchorPin = (_target: number): void => {
      // Same completion recalc as pinMessage: the gutter is floored while the
      // catch-up runs; tighten on arrival.
      startAnimatedScroll(
        cc,
        () => cc.internal.pinnedY,
        () => recalcGutter(cc.ctx),
      )
    }

    cc.scrollListener = makeScrollListener(cc)
    container.addEventListener('scroll', cc.scrollListener, { passive: true })
    attachUserInputCancellers(cc)
    attachResizeObservers(cc)

    // Reserve the bottom-inset band before the initial snap, so an
    // `initialPosition: 'bottom'` land reads the reserved scrollHeight and the
    // first paint already clears the composer.
    applyBottomReservation(cc)

    cc.initialAnchoring = cc.options.initialPosition === 'bottom'
    if (cc.initialAnchoring) {
      container.scrollTop = container.scrollHeight
    }
    // Seed the scroll listener's delta baseline at the mount position
    // (possibly the bottom, just above). Without this, the first scroll event
    // computes its delta against 0 and an upward scrollbar drag from the
    // bottom reads as a large POSITIVE delta — masking the user's take-over
    // from the delta-gated checks.
    cc.lastSeenScrollTop = container.scrollTop
    cc.lastSeenScrollHeight = container.scrollHeight
    cc.internal.atBottom = measureAtBottom(cc)
    cc.internal.locked = cc.options.strategy === 'stick-to-bottom'
    if (cc.internal.streaming) container.style.overflowAnchor = 'none'
    commit(cc)
  }

  function setOptions(next: Partial<ChatScrollOptions>): void {
    const prevStrategy = cc.options.strategy
    const prevInset = cc.options.bottomInset
    // Ignore keys whose value is `undefined` — adapters sync options by
    // passing every key on every render, with `undefined` for options the
    // consumer never set. Spreading those verbatim would clobber resolved
    // defaults (`bottomThreshold: undefined` breaks at-bottom detection;
    // `scrollMargin: undefined` makes `pinnedY` NaN).
    const defined = Object.fromEntries(
      Object.entries(next).filter(([, v]) => v !== undefined),
    ) as Partial<ChatScrollOptions>
    cc.options = {
      ...cc.options,
      ...defined,
    }
    cc.ctx.options.bottomThreshold = cc.options.bottomThreshold
    cc.ctx.options.scrollMargin = cc.options.scrollMargin
    cc.ctx.options.bottomInset = cc.options.bottomInset
    cc.ctx.options.pinClamp = cc.options.pinClamp

    const strategyChanged = Boolean(
      next.strategy && next.strategy !== prevStrategy,
    )
    if (strategyChanged) {
      cc.strategy.reset(cc.ctx)
      cc.strategy = STRATEGIES[cc.options.strategy]
      cc.internal.locked = cc.options.strategy === 'stick-to-bottom'
      cc.internal.pinActive = false
    }

    // Re-reserve when the obstruction height changes (a composer growing to a
    // second line) or the strategy switched. The gutter math reads the new
    // inset; a still-locked stick viewport re-snaps so a growing composer
    // doesn't push the latest message behind itself.
    if (strategyChanged || cc.options.bottomInset !== prevInset) {
      applyBottomReservation(cc)
      if (
        cc.options.bottomInset !== prevInset &&
        cc.options.strategy === 'stick-to-bottom' &&
        cc.internal.locked &&
        cc.ctx.container
      ) {
        cc.ctx.container.scrollTop = cc.ctx.container.scrollHeight
        cc.internal.atBottom = measureAtBottom(cc)
      }
    }

    if (strategyChanged) commit(cc)
  }

  function scrollToBottom(): void {
    const container = cc.ctx.container
    if (!container) return
    // A programmatic jump to the bottom is the user's clear intent to move
    // AWAY from the pin (the FAB the consumer wires to this is literally a "go
    // to the bottom" affordance). Clear `pinAnchored` so the next content
    // resize doesn't write `scrollTop = pinnedY` and yank them back.
    // Wheel/touch events already clear the flag via the user-input cancellers,
    // but the FAB click never reaches the container's listeners (it's a
    // sibling, not a descendant), and any consumer that calls
    // `scrollToBottom()` from a keyboard shortcut / deep-link / notification
    // jump has the same problem.
    cc.internal.pinAnchored = false
    cc.ctx.pinAnimationInterrupted = false
    cc.navTargetEl = null
    cc.initialAnchoring = false
    // Live getter, not a captured number: content may stream in during the
    // ~320ms animation, and a stale target would land short of the real
    // bottom. The rAF loop re-reads and re-clamps every frame.
    startAnimatedScroll(
      cc,
      () => container.scrollHeight,
      // Reaching the bottom via this affordance is the user's intent to FOLLOW
      // the latest content again — re-engage the stick lock so a mid-stream
      // FAB click doesn't immediately drift away on the next chunk. Skipped on
      // abort (the user wheeled away mid-animation).
      () => {
        if (cc.options.strategy === 'stick-to-bottom') {
          cc.internal.locked = true
        } else {
          // Pin-to-top: tighten a gutter the in-flight floor kept slack.
          recalcGutter(cc.ctx)
        }
      },
    )
    // startAnimatedScroll defers its prologue commit to the caller; emit so
    // subscribers see `pinAnchored: false` + `scrollInFlight: true` while it
    // runs.
    commit(cc)
  }

  function lock(): void {
    if (cc.options.strategy !== 'stick-to-bottom') return
    if (!cc.ctx.container) return
    cc.internal.locked = true
    cc.ctx.container.scrollTop = cc.ctx.container.scrollHeight
    cc.internal.atBottom = true
    commit(cc)
  }

  function unlock(): void {
    if (cc.options.strategy !== 'stick-to-bottom') return
    if (!cc.internal.locked) return
    cc.internal.locked = false
    commit(cc)
  }

  function reset(): void {
    // Kill any pin work still in the pipeline — a pin scheduled just before a
    // thread switch must not land on the new thread's DOM.
    cc.pinEpoch++
    cc.pendingPinEl = null
    if (cc.pendingPinFrame !== null) {
      cancelAnimationFrame(cc.pendingPinFrame)
      cc.pendingPinFrame = null
    }
    if (cc.pendingLatestFrame !== null) {
      cancelAnimationFrame(cc.pendingLatestFrame)
      cc.pendingLatestFrame = null
    }
    if (cc.activeScrollAbort) {
      cc.activeScrollAbort.abort()
      cc.activeScrollAbort = null
      cc.internal.scrollInFlight = false
    }
    cc.ctx.pinAnimationInterrupted = false
    cc.navTargetEl = null
    cancelStreamingGrace(cc)
    if (cc.restoreFrame !== null) {
      cancelAnimationFrame(cc.restoreFrame)
      cc.restoreFrame = null
    }
    cc.strategy.reset(cc.ctx)
    // Re-reserve the bottom-inset band: a strategy's `reset` zeroes the
    // gutter, but the overlay composer is still there on the new thread.
    applyBottomReservation(cc)
    // A reset is a fresh thread — re-arm the initial-position anchoring so the
    // new content opens at the latest message too.
    cc.initialAnchoring = cc.options.initialPosition === 'bottom'
    if (cc.initialAnchoring && cc.ctx.container) {
      cc.ctx.container.scrollTop = cc.ctx.container.scrollHeight
    }
    if (cc.ctx.container) {
      cc.internal.atBottom = measureAtBottom(cc)
    }
    commit(cc)
  }

  function destroy(): void {
    teardownDom(cc)
    cc.listeners.clear()
    cc.ctx.container = null
    cc.ctx.content = null
    cc.ctx.pinnedEl = null
    cc.ctx.pinnedMargin = 0
    cc.ctx.pinAnimationInterrupted = false
    cc.ctx.reAnchorPin = undefined
    cc.internal.pinnedY = -1
    cc.internal.pinAnchored = false
    cc.internal.scrollInFlight = false
    cc.internal.pinActive = false
  }

  return {
    get state() {
      return cc.snapshot
    },
    get options() {
      return cc.options
    },
    mount,
    setOptions,
    pinMessage: (el: HTMLElement) => pinMessage(cc, el),
    pinLatest: (selector: string) => pinLatest(cc, selector),
    pinRelative: (selector: string, direction: -1 | 1) =>
      pinRelative(cc, selector, direction),
    getPinnedElement: () => getPinnedElement(cc),
    referenceMessage: (selector: string) => referenceMessage(cc, selector),
    relativeMessage: (selector: string, direction: -1 | 1) =>
      relativeMessage(cc, selector, direction),
    scrollToMessage: (el: HTMLElement) => scrollToMessage(cc, el),
    scrollToBottom,
    lock,
    unlock,
    setStreaming: (streaming: boolean) => setStreaming(cc, streaming),
    reset,
    savePosition: () => savePosition(cc),
    restorePosition: (pos) => restorePosition(cc, pos),
    subscribe: (listener) => subscribe(cc, listener),
    destroy,
  }
}
