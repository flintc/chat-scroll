import { calcGutterHeight, setGutterHeight } from '../gutter'
import { offsetWithin } from '../scroll-utils'
import type { Strategy, StrategyContext } from './types'

/**
 * Pin-to-top strategy (AI chat).
 *
 * Behavior:
 * - When the consumer pins a user message via `pinMessage()`, we record
 *   its absolute Y offset and grow the gutter so the user can't scroll
 *   past where the response will eventually fill.
 * - On every content resize, we recompute the gutter so it shrinks as
 *   the response grows.
 * - We never auto-scroll during streaming — scroll position is the user's.
 */
export const pinToTopStrategy: Strategy = {
  name: 'pin-to-top',

  onContentResize(ctx) {
    recalcGutter(ctx)
  },

  onScroll() {
    // Pin-to-top has no scroll-driven side effects beyond at-bottom
    // detection (handled by the controller).
  },

  reset(ctx) {
    ctx.state.pinnedY = -1
    ctx.pinnedEl = null
    ctx.pinnedMargin = 0
    ctx.state.pinAnchored = false
    ctx.state.pinActive = false
    if (ctx.gutter) setGutterHeight(ctx.gutter, 0)
  },
}

/**
 * Re-read the pinned element's live offset and update `ctx.pinnedY`.
 * Called from `recalcGutter` so that any content size change above the
 * pin (e.g. a thinking block expanding in a prior bot reply) is
 * reflected before we recompute the gutter.
 *
 * Returns the delta (new - old). Callers may use this to nudge
 * `scrollTop` and keep the pinned message visually anchored during
 * streaming, when `overflow-anchor: none` strips the browser's own
 * auto-anchoring.
 */
export function refreshPinnedY(ctx: StrategyContext): number {
  if (!ctx.container || !ctx.pinnedEl) return 0
  if (!ctx.container.contains(ctx.pinnedEl)) {
    // The pinned element was detached from the DOM (e.g. thread switch).
    // Clear the pin so subsequent recalcs don't reference a ghost node.
    ctx.pinnedEl = null
    ctx.state.pinnedY = -1
    ctx.state.pinActive = false
    return 0
  }
  const live = Math.max(
    0,
    offsetWithin(ctx.pinnedEl, ctx.container) - ctx.pinnedMargin,
  )
  const delta = live - ctx.state.pinnedY
  ctx.state.pinnedY = live
  return delta
}

export function recalcGutter(ctx: StrategyContext): void {
  if (!ctx.container || !ctx.content || !ctx.gutter) return
  if (ctx.state.pinnedY < 0) {
    setGutterHeight(ctx.gutter, 0)
    return
  }
  // `ctx.state.pinAnchored` is the authoritative "user is at the pin"
  // signal: true since `pinMessage()` until the user produces a real
  // input event (wheel, touch, pointerdown, keydown) on the container.
  // See `attachUserInputCancellers` in chat-scroll.ts.
  //
  // We can't infer this at resize-time by comparing `scrollTop` to
  // `pinnedY`: when content above the pin shrinks the browser clamps
  // `scrollTop` to `scrollHeight - clientHeight`, which doesn't match
  // either the old or the refreshed `pinnedY` in general. And clamp
  // fires a scroll event indistinguishable from user-driven scroll.
  // So we trust input events, not scroll events.
  const userWasAnchored = ctx.state.pinAnchored

  // Keep `pinnedY` honest — the pinned element's real position may
  // have shifted since the original `pinMessage()` call if anything
  // above it resized (expandable thinking/tool blocks are the
  // motivating case).
  refreshPinnedY(ctx)

  // Size the gutter against the refreshed `pinnedY` so `scrollHeight`
  // is large enough to accommodate `scrollTop = pinnedY` below.
  const tight = calcGutterHeight({
    container: ctx.container,
    gutter: ctx.gutter,
    pinnedY: ctx.state.pinnedY,
  })
  // While a controller-owned scroll animation is in flight the gutter
  // may GROW but never SHRINK. Shrinking drops `scrollHeight`, and when
  // the current `scrollTop` sits beyond the new max-scroll the browser
  // clamps it synchronously — a teleport that destroys the animation.
  // The motivating case is pinRelative() to an EARLIER turn: the
  // outgoing pin's gutter is still tall, the new pin's tight height is
  // usually 0, and without the floor the user jumps most of the way
  // instead of smooth-scrolling. The animation's completion callback
  // re-runs this recalc with `scrollInFlight` false, restoring the
  // tight-pin contract. (After a user abort, the next content resize
  // tightens instead.)
  const h = ctx.state.scrollInFlight
    ? Math.max(tight, parseFloat(ctx.gutter.style.height) || 0)
    : tight
  setGutterHeight(ctx.gutter, h)

  // If the user was sitting at the pin, restore the pin against the
  // refreshed `pinnedY`. This runs in BOTH streaming and not-streaming
  // states because the browser's auto-anchoring is unreliable across
  // browsers:
  //   - Chromium: `overflow-anchor: auto` (the default when not
  //     streaming) does auto-anchor the visible content, so without
  //     this branch the pin already stays. With this branch we just
  //     end up writing scrollTop to the same value the browser
  //     already picked — a no-op visually.
  //   - During streaming on any engine: `overflow-anchor: none` is
  //     set, so the browser does nothing and shrink-clamping pulls
  //     scrollTop to a wrong value. We HAVE to fix it.
  //   - WebKit / iOS Safari, even with `overflow-anchor: auto`, does
  //     not anchor inside nested scroll containers reliably. Pin-edges
  //     stream-ended test drifted 59px on webkit before this branch
  //     was un-gated.
  //
  // EXCEPT: skip when a controller-owned scroll animation is in flight.
  // That animation is interpolating scrollTop toward `pinnedY` over
  // ~320ms; clobbering it with a synchronous write here would make
  // pinMessage feel like a hard jump. The animation re-clamps against
  // `scrollHeight` every frame, so the gutter resize we just performed
  // still lands correctly. The animation also re-reads its target, so a
  // mid-animation `pinnedY` shift is followed automatically.
  if (userWasAnchored && !ctx.state.scrollInFlight) {
    // Special case: a pointerdown / touchstart aborted
    // an in-flight pin animation. scrollTop is "stuck" partway between
    // the animation's start and `pinnedY`. A synchronous write would
    // teleport the user — animate the catch-up instead so the motion
    // feels continuous with the (now-aborted) pin animation. The flag
    // is consumed here so subsequent resizes use the fast sync path.
    if (ctx.pinAnimationInterrupted && ctx.reAnchorPin) {
      ctx.pinAnimationInterrupted = false
      ctx.reAnchorPin(ctx.state.pinnedY)
    } else {
      ctx.container.scrollTop = ctx.state.pinnedY
    }
  }
}
