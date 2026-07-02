import { calcGutterHeight, setGutterHeight } from '../gutter'
import { offsetWithin } from '../scroll-utils'
import type { PinClamp } from '../types'
import type { Strategy, StrategyContext } from './types'

/**
 * Extra offset (px) to push the pin's anchor DOWN by, over-scrolling a
 * tall message so only `clamp.visibleHeight` of it stays at the viewport
 * top. Zero when no clamp is configured or the element is at/below the
 * threshold — i.e. the normal "pin the whole message" behavior.
 *
 * `elementHeight` is the pinned element's measured height (border box,
 * from `getBoundingClientRect().height`). The result is floored at 0 so a
 * clamp configured with `visibleHeight > tallerThan` (or larger than the
 * element) never pulls the anchor upward.
 *
 * `engaged` bypasses the threshold check: the caller has already decided
 * the clamp applies (see the latch in `refreshPinnedY`), so the offset
 * tracks the live height continuously instead of collapsing to 0 the
 * moment the height dips back under `tallerThan`.
 */
export function clampOffset(
  elementHeight: number,
  clamp: PinClamp | undefined,
  engaged = false,
): number {
  if (!clamp) return 0
  if (!engaged && elementHeight <= clamp.tallerThan) return 0
  return Math.max(0, elementHeight - clamp.visibleHeight)
}

/**
 * The single source of truth for the pinned element's target `pinnedY`.
 * Used by BOTH the initial pin (`pinMessage`) and every live refresh
 * (`refreshPinnedY`) so the clamp is applied identically and persists
 * across content resizes:
 *
 *   pinnedY = max(0, offsetWithin(el) - margin + clampOffset(height, clamp))
 *
 * Reading the height live each time is deliberate — a user message's
 * height is stable, but keeping the read here (rather than baking a
 * one-shot value at pin time) means the clamp survives every recalc and
 * tracks the element if it ever does reflow.
 *
 * With `engaged` left at its default this is the pure, un-latched
 * computation (threshold decides): what `pinMessage` uses at pin time and
 * what navigation uses to answer "where does this message anchor?".
 * `refreshPinnedY` passes its latched `engaged` state so an anchored
 * reader can't be flip-flopped by a height oscillating around the
 * threshold.
 */
export function computePinnedY(
  el: HTMLElement,
  container: HTMLElement,
  margin: number,
  clamp: PinClamp | undefined,
  engaged = false,
): number {
  const offset = offsetWithin(el, container)
  const extra = clamp
    ? clampOffset(el.getBoundingClientRect().height, clamp, engaged)
    : 0
  return Math.max(0, offset - margin + extra)
}

/**
 * Per-instance clamp latch: the pinned element for which the tall-message
 * clamp has ENGAGED. Once a pin's live height has been measured above
 * `tallerThan`, the clamp stays engaged for that pin even if the height
 * later dips back under the threshold (image decode settling, late
 * markdown reflow). Without the latch, a height oscillating around
 * `tallerThan` would flip `clampOffset` between 0 and hundreds of px on
 * every resize tick — and `recalcGutter` hard-writes `scrollTop` from
 * `pinnedY` while the reader is anchored, so the viewport would jump
 * ±clampOffset per tick.
 *
 * Keyed by the strategy context (one per ChatScroll instance) with the
 * pinned element as the value, so pinning a DIFFERENT element naturally
 * resets the latch and a `setOptions`-enabled clamp still engages on the
 * next resize. The one case the latch outlives is re-pinning the SAME
 * element consecutively: a between-pins height drop below the threshold
 * is indistinguishable here from a mid-pin dip, and keeping the clamp is
 * the stable choice.
 */
const engagedClampEl = new WeakMap<StrategyContext, HTMLElement>()

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
    engagedClampEl.delete(ctx)
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
    engagedClampEl.delete(ctx)
    return 0
  }
  // Re-derive through the shared helper so the tall-message clamp is
  // re-applied on every resize. Without this, a clamped tall pin would
  // un-clamp itself the first time content above it shifted.
  //
  // The clamp decision is latched (see `engagedClampEl`): engaged if it
  // already engaged for this pinned element, or if the live height is
  // above the threshold now — never dis-engaged by a height dip. A clamp
  // removed via `setOptions` still turns it off (`clamp` undefined makes
  // the latch irrelevant, and dropping the stale entry keeps a later
  // re-enable honest to the threshold).
  const el = ctx.pinnedEl
  const clamp = ctx.options.pinClamp
  const engaged =
    clamp !== undefined &&
    (engagedClampEl.get(ctx) === el ||
      el.getBoundingClientRect().height > clamp.tallerThan)
  if (engaged) engagedClampEl.set(ctx, el)
  else engagedClampEl.delete(ctx)
  const live = computePinnedY(
    el,
    ctx.container,
    ctx.pinnedMargin,
    clamp,
    engaged,
  )
  const delta = live - ctx.state.pinnedY
  ctx.state.pinnedY = live
  return delta
}

export function recalcGutter(ctx: StrategyContext): void {
  if (!ctx.container || !ctx.content || !ctx.gutter) return
  // Floor for a bottom-overlaying obstruction (an out-of-flow composer):
  // the gutter is never shorter than `bottomInset`, so the last message
  // can always scroll clear of the composer. With no obstruction this is
  // 0 and the math below is unchanged.
  const inset = ctx.options.bottomInset
  if (ctx.state.pinnedY < 0) {
    // No pin — the gutter is pure obstruction reservation (or 0).
    setGutterHeight(ctx.gutter, inset)
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
  // is large enough to accommodate `scrollTop = pinnedY` below — but
  // never shorter than the obstruction inset, so a long response's tail
  // can still scroll above the composer.
  const tight = Math.max(
    inset,
    calcGutterHeight({
      container: ctx.container,
      gutter: ctx.gutter,
      pinnedY: ctx.state.pinnedY,
    }),
  )
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
