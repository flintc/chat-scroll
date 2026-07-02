import { destroyGutter, restoreGutterStyles } from '../gutter'
import type { ControllerContext } from './context'
import { restoreContainerStyles, restoreContentStyles } from './dom-styles'
import { measureAtBottom } from './reservation'
import { commit } from './store'
import { cancelStreamingGrace } from './streaming'

/**
 * Threshold for the "consumer scrolled the container away from the pin"
 * detection in the scroll listener. The pin lives at `scrollTop = pinnedY`;
 * if `scrollTop < pinnedY - threshold` and the controller didn't initiate
 * that move (no animation in flight, no scroll-driving input), it must have
 * come from a consumer `container.scrollTo()` / `scrollBy()` /
 * `scrollIntoView()`. The threshold accommodates browser sub-pixel rounding
 * and harmless micro-scrolls from focus changes.
 */
const PIN_AWAY_THRESHOLD = 40

/**
 * Build the container scroll listener. Detects consumer-driven scrolls (vs
 * layout clamps), maintains `atBottom`, releases initial anchoring on an
 * upward drag, then hands off to the strategy.
 */
export function makeScrollListener(cc: ControllerContext): () => void {
  return () => {
    const container = cc.ctx.container
    if (!container) return
    const now = container.scrollTop
    const sh = container.scrollHeight
    cc.internal.atBottom = measureAtBottom(cc)
    // Detect "consumer scrolled the container away from the pin" — a host-app
    // call to `container.scrollTo()` / `scrollBy()` / `scrollIntoView()` that
    // didn't go through the controller. The user-input cancellers clear
    // `pinAnchored` for wheel/touchmove/keys; `scrollToBottom()` clears it for
    // the FAB; pointerdown sets `pinAnimationInterrupted` for the
    // tap-mid-pin-animation case. A consumer's *own* programmatic scroll
    // routes through none of those, so without this check the next resize
    // yanks the user back to the pin.
    //
    // The distinguishing feature of a consumer scroll is the DELTA WITHOUT a
    // corresponding scrollHeight change. Animation steps move scrollTop
    // incrementally per frame. Layout-driven clamps after a shrink produce a
    // delta TOGETHER with a scrollHeight drop (which on WebKit / mobile-safari
    // can be significantly larger than the simple frame-rate-paced
    // mathematical maximum suggests). A consumer's `scrollTo({top: 0})`
    // produces a single big delta with scrollHeight unchanged — that's the
    // signal we use.
    //
    // We require: (a) was near the pin in the previous frame, (b) is now far
    // from the pin this frame, AND (c) scrollHeight is unchanged. (c) is the
    // load-bearing piece for WebKit, whose collapse-driven clamps land 40+ px
    // below the previous scrollTop in a single frame even when the per-frame
    // layout delta is much smaller.
    //
    // The check is symmetric: a consumer can scroll away in EITHER direction
    // (scrollTo(0) toward the top, or scrollIntoView of a message below the
    // pin). Clamps only ever *decrease* scrollTop and always change
    // scrollHeight in the same frame, so (c) protects both directions equally.
    if (
      cc.options.strategy === 'pin-to-top' &&
      cc.internal.pinAnchored &&
      !cc.internal.scrollInFlight &&
      !cc.ctx.pinAnimationInterrupted &&
      cc.internal.pinnedY >= 0 &&
      Math.abs(cc.lastSeenScrollTop - cc.internal.pinnedY) <
        PIN_AWAY_THRESHOLD &&
      Math.abs(now - cc.internal.pinnedY) >= PIN_AWAY_THRESHOLD &&
      sh === cc.lastSeenScrollHeight
    ) {
      cc.internal.pinAnchored = false
    }
    cc.ctx.scrollDelta = now - cc.lastSeenScrollTop
    // Scrollbar drags emit no wheel/touch/key events; an upward move is still
    // the user taking over from the initial anchoring. Gated on scrollHeight
    // being unchanged, like the consumer-scroll detector above: layout-driven
    // clamps (a virtualizer re-measuring rows, content shrinking) produce a
    // negative delta TOGETHER with a scrollHeight change in the same frame,
    // and those must not end the anchoring.
    if (
      cc.initialAnchoring &&
      cc.ctx.scrollDelta < 0 &&
      sh === cc.lastSeenScrollHeight
    ) {
      cc.initialAnchoring = false
    }
    cc.lastSeenScrollTop = now
    cc.lastSeenScrollHeight = sh
    cc.strategy.onScroll(cc.ctx)
    commit(cc)
  }
}

/**
 * Wire the two ResizeObservers. Both call the same idempotent handler.
 *
 * - `resizeObserver` watches the content + container BORDER box: content
 *   border-box catches consumer padding changes on the content element (e.g.
 *   a `padding-bottom` reserved for an overlaid composer) that grow
 *   scrollHeight but leave the content-box the same; container border-box
 *   catches viewport resizes and any change to the container's outer box.
 * - `paddingObserver` watches the container's CONTENT box, because the gutter
 *   formula reads `container.clientHeight` and `paddingBottom` directly, so a
 *   change to the container's OWN padding (the motivating case: reserving
 *   space for a `position: fixed`/`absolute` composer by growing the
 *   container's `padding-bottom`) must recompute. Under `box-sizing:
 *   border-box` that padding change leaves the border box untouched (so the
 *   border-box observation never fires) while shrinking the content box (so
 *   this one does). A single ResizeObserver can't watch one target with two
 *   boxes, hence the second instance.
 */
export function attachResizeObservers(cc: ControllerContext): void {
  const { container, content } = cc.ctx
  if (!container || !content) return
  if (typeof ResizeObserver === 'undefined') return

  // Shared by both observers. Idempotent — it recomputes from live geometry —
  // so a resize that trips both observers in the same delivery just
  // recalculates twice, harmlessly. Reusing one function reference (rather
  // than two closures) also keeps a single logical callback for tests/tooling
  // that count them.
  const handleResize = (): void => {
    cc.strategy.onContentResize(cc.ctx)
    if (cc.initialAnchoring && cc.ctx.container) {
      // `initialPosition: 'bottom'`: keep landing at the latest content while
      // layout settles (hydration, web-font swap, late media) — until the
      // first real interaction.
      cc.ctx.container.scrollTop = cc.ctx.container.scrollHeight
    }
    if (cc.ctx.container) {
      cc.internal.atBottom = measureAtBottom(cc)
    }
    commit(cc)
  }
  cc.resizeObserver = new ResizeObserver(handleResize)
  cc.resizeObserver.observe(content, { box: 'border-box' })
  cc.resizeObserver.observe(container, { box: 'border-box' })
  cc.paddingObserver = new ResizeObserver(handleResize)
  cc.paddingObserver.observe(container, { box: 'content-box' })
}

/**
 * Tear down every DOM binding, observer, timer and rAF handle, restoring the
 * consumer's saved styles. The gutter is removed only when the controller
 * created it; an adopted (consumer-rendered) gutter stays in the DOM with
 * its inline styles restored. Operates on the currently bound elements —
 * `mount()` calls this before re-binding, `destroy()` after.
 */
export function teardownDom(cc: ControllerContext): void {
  if (cc.activeScrollAbort) {
    cc.activeScrollAbort.abort()
    cc.activeScrollAbort = null
  }
  if (cc.pendingPinFrame !== null) {
    cancelAnimationFrame(cc.pendingPinFrame)
    cc.pendingPinFrame = null
  }
  if (cc.pendingLatestFrame !== null) {
    cancelAnimationFrame(cc.pendingLatestFrame)
    cc.pendingLatestFrame = null
  }
  cc.pendingPinEl = null
  cc.lastSeenScrollTop = 0
  cc.lastSeenScrollHeight = 0
  if (cc.resizeObserver) {
    cc.resizeObserver.disconnect()
    cc.resizeObserver = null
  }
  if (cc.paddingObserver) {
    cc.paddingObserver.disconnect()
    cc.paddingObserver = null
  }
  if (cc.scrollListener && cc.ctx.container) {
    cc.ctx.container.removeEventListener('scroll', cc.scrollListener)
    cc.scrollListener = null
  }
  if (cc.ctx.container) {
    const container = cc.ctx.container
    cc.userInputListeners.forEach(({ type, fn }) =>
      container.removeEventListener(type, fn),
    )
  }
  cc.userInputListeners = []
  if (cc.ctx.gutter) {
    if (cc.savedGutterStyles) {
      // Adopted node — the framework's renderer created it and may hold
      // references to it; removing it is not the controller's call.
      // Restore the saved inline state instead: in the canonical case (an
      // empty template div) the prior height is '', so the node collapses
      // back to zero.
      restoreGutterStyles(cc.ctx.gutter, cc.savedGutterStyles)
    } else {
      destroyGutter(cc.ctx.gutter)
    }
    cc.ctx.gutter = null
  }
  cc.savedGutterStyles = null
  restoreContainerStyles(cc)
  restoreContentStyles(cc)
  cancelStreamingGrace(cc)
  if (cc.restoreFrame !== null) {
    cancelAnimationFrame(cc.restoreFrame)
    cc.restoreFrame = null
  }
  cc.navTargetEl = null
  cc.initialAnchoring = false
}
