import { shouldReduceMotion } from '../smooth-scroll'
import { computePinnedY, recalcGutter } from '../strategies/pin-to-top'
import type { ControllerContext } from './context'
import { startAnimatedScroll } from './scroll-animation'
import { commit } from './store'

export function pinMessage(cc: ControllerContext, el: HTMLElement): void {
  if (cc.options.strategy !== 'pin-to-top') return
  const container = cc.ctx.container
  if (!container) return

  // Record the intent synchronously (see `pendingPinEl` / `pinEpoch`); only
  // the layout measurement waits for the next frame.
  cc.pendingPinEl = el
  const epoch = ++cc.pinEpoch
  if (cc.pendingPinFrame !== null) cancelAnimationFrame(cc.pendingPinFrame)
  cc.pendingPinFrame = requestAnimationFrame(() => {
    cc.pendingPinFrame = null
    if (epoch !== cc.pinEpoch) return
    if (cc.pendingPinEl === el) cc.pendingPinEl = null
    cc.navTargetEl = null
    cc.initialAnchoring = false
    el.style.scrollMarginTop = `${cc.options.scrollMargin}px`
    // Centralized pin math (shared with `refreshPinnedY`) so the
    // tall-message clamp is applied on the initial pin too — not just on
    // later resizes.
    cc.internal.pinnedY = computePinnedY(
      el,
      container,
      cc.options.scrollMargin,
      cc.options.pinClamp,
    )
    cc.ctx.pinnedEl = el
    cc.ctx.pinnedMargin = cc.options.scrollMargin
    cc.internal.pinAnchored = true
    cc.internal.pinActive = true
    // Seed the consumer-scroll detector's baseline at pinnedY so the first
    // scroll event after pin lands compares against a sensible value (not 0,
    // which would always look like a big jump on the very first frame). See
    // `lastSeenScrollTop`.
    cc.lastSeenScrollTop = cc.internal.pinnedY
    cc.lastSeenScrollHeight = container.scrollHeight
    // Starting a new pin clears any pending "the previous animation was
    // interrupted" state — that flag refers to whatever pin was in flight
    // when the user tapped, and we're now starting fresh.
    cc.ctx.pinAnimationInterrupted = false
    // Mark scroll-in-flight BEFORE recalcGutter so its re-anchor branch
    // doesn't clobber the about-to-start smooth-scroll animation.
    // `startAnimatedScroll` below would set this anyway, but only after
    // recalcGutter has already written scrollTop synchronously.
    // `startAnimatedScroll` does the right thing in reduced-motion mode and
    // clears it again then.
    if (!shouldReduceMotion(cc.options.scrollBehavior)) {
      cc.internal.scrollInFlight = true
    }
    recalcGutter(cc.ctx)
    // Drive an rAF-owned scroll animation, not native
    // `container.scrollTo({behavior: 'smooth'})`: iOS Safari samples the
    // *stale* scrollHeight when `recalcGutter` writes a same-frame style
    // change, and the smooth animation finalises at the pre-resize
    // max-scroll. `animateScrollTo` re-clamps target against live scrollHeight
    // every frame, so the animation continues toward the now-reachable target
    // after the gutter resize commits. See the "Safari gutter race" test in
    // smooth-scroll.test.ts.
    //
    // Target is passed as a GETTER so the animation tracks live `pinnedY` — if
    // content above the pin grows or shrinks during the animation,
    // `refreshPinnedY` updates the state and the animation re-reads the target
    // each frame. Without this the animation lands at the captured value.
    //
    // On completion, recalc once more: while the animation was in flight the
    // gutter was held at a no-shrink floor (see `recalcGutter`) so a shrinking
    // `scrollHeight` couldn't clamp `scrollTop` mid-animation. Now that we've
    // arrived, tighten it back to the tight-pin contract.
    startAnimatedScroll(
      cc,
      () => cc.internal.pinnedY,
      () => recalcGutter(cc.ctx),
    )
    commit(cc)
  })
}

export function pinLatest(cc: ControllerContext, selector: string): void {
  if (cc.options.strategy !== 'pin-to-top') return
  const container = cc.ctx.container
  if (!container) return
  const epoch = ++cc.pinEpoch
  if (cc.pendingLatestFrame !== null) {
    cancelAnimationFrame(cc.pendingLatestFrame)
  }
  cc.pendingLatestFrame = requestAnimationFrame(() => {
    cc.pendingLatestFrame = null
    // A newer pin call (pinMessage / pinRelative / pinLatest) arrived while
    // this frame was pending — the newer intent wins.
    if (epoch !== cc.pinEpoch) return
    const matches = container.querySelectorAll<HTMLElement>(selector)
    const target = matches[matches.length - 1]
    if (target) pinMessage(cc, target)
  })
}

export function getPinnedElement(cc: ControllerContext): HTMLElement | null {
  return cc.pendingPinEl ?? cc.ctx.pinnedEl
}
