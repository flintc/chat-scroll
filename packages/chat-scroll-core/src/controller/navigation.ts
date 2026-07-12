import { computePinnedY } from '../strategies/pin-to-top'
import type { ReferenceMessage } from '../types'
import type { ControllerContext } from './context'
import { pinMessage } from './pin'
import { startAnimatedScroll } from './scroll-animation'
import { commit } from './store'

/**
 * The anchor Y for `el` — the exact scrollTop `pinMessage` lands on.
 * Navigation must share the pin's definition of "where this message
 * anchors": with `pinClamp` set, a tall message's anchor includes the
 * clamp offset, so a reader sitting at a clamped pin is AT the reference
 * (not `past` it — otherwise Prev would re-target the same message), and
 * `scrollToMessage` arrives where `pinMessage` would. The clamp is a
 * pin-to-top concept, so it's ignored for other strategies (same gating
 * as `pinRelative`). Deliberately the un-latched computation — the
 * anchored-refresh latch in `refreshPinnedY` only exists to stabilize
 * live resizes; navigation just needs the geometric target.
 */
function anchorTop(
  cc: ControllerContext,
  el: HTMLElement,
  container: HTMLElement,
): number {
  const clamp =
    cc.options.strategy === 'pin-to-top' ? cc.options.pinClamp : undefined
  return computePinnedY(el, container, cc.options.scrollMargin, clamp)
}

/**
 * Shared reference resolution for pinRelative / relativeMessage /
 * referenceMessage. Resolves synchronously — navigation targets
 * already-rendered messages, so there's no layout to wait for, and deferring
 * would make rapid calls race the rAF (two quick "prev" clicks would both
 * resolve against the same settled position and move one step).
 *
 * The reference adapts to where the user actually is:
 * - INTENT-anchored, strongest first: a pin scheduled this frame
 *   (`pendingPinEl`), the settled pin while the user is still at it, and the
 *   target of an in-flight `scrollToMessage`. All three make rapid successive
 *   calls resolve against where the user is HEADING, not the mid-animation
 *   scroll position.
 * - Otherwise GEOMETRIC: the last match whose margin-adjusted top sits at or
 *   above the viewport top — the turn being read. This also makes navigation
 *   usable before any pin or scroll exists.
 */
function resolveReference(
  cc: ControllerContext,
  selector: string,
): {
  matches: HTMLElement[]
  index: number
  past: boolean
  anchored: boolean
} | null {
  const container = cc.ctx.container
  if (!container) return null
  const matches = Array.from(container.querySelectorAll<HTMLElement>(selector))
  if (matches.length === 0) return null

  const anchoredEl =
    cc.pendingPinEl ??
    (cc.internal.pinAnchored ? cc.ctx.pinnedEl : null) ??
    (cc.internal.scrollInFlight ? cc.navTargetEl : null)
  if (anchoredEl) {
    const idx = matches.indexOf(anchoredEl)
    if (idx !== -1) {
      return { matches, index: idx, past: false, anchored: true }
    }
    // Anchored element not in the matched set (detached, or a different
    // selector) — fall through to the geometric reference.
  }

  const FUDGE = 2 // sub-pixel scroll positions + rounding
  const st = container.scrollTop
  let index = -1
  let refTop = 0
  for (let i = 0; i < matches.length; i++) {
    const el = matches[i]
    if (!el) continue
    // `anchorTop` floors at 0 (scrollTop can't go negative), matching the
    // scroll position pinMessage/scrollToMessage can actually reach.
    const top = anchorTop(cc, el, container)
    if (top <= st + FUDGE) {
      index = i
      refTop = top
    }
  }
  return {
    matches,
    index,
    // The viewport top sits measurably below the reference's top — the user
    // has scrolled into the content that follows it ("mid-reply" in a chat).
    past: index >= 0 && st > refTop + FUDGE,
    anchored: false,
  }
}

export function referenceMessage(
  cc: ControllerContext,
  selector: string,
): ReferenceMessage {
  const ref = resolveReference(cc, selector)
  if (!ref) return { el: null, index: -1, count: 0, past: false }
  return {
    el: ref.index >= 0 ? (ref.matches[ref.index] ?? null) : null,
    index: ref.index,
    count: ref.matches.length,
    past: ref.past,
  }
}

export function relativeMessage(
  cc: ControllerContext,
  selector: string,
  direction: -1 | 1,
): HTMLElement | null {
  const ref = resolveReference(cc, selector)
  if (!ref) return null
  let targetIdx: number
  if (direction === 1) {
    // The next match below the reference. With every match above the viewport
    // (index === -1) this resolves to the first.
    targetIdx = ref.index + 1
  } else {
    // Geometric mode, reading past the reference's top: "previous" first
    // returns the reference itself (snap back to the turn being read), then
    // walks upward on the next call. Mirrors editor go-to-previous-change.
    // Anchored mode is already AT the reference, so it always walks.
    targetIdx = !ref.anchored && ref.past ? ref.index : ref.index - 1
  }
  return targetIdx >= 0 ? (ref.matches[targetIdx] ?? null) : null
}

export function pinRelative(
  cc: ControllerContext,
  selector: string,
  direction: -1 | 1,
): boolean {
  if (cc.options.strategy !== 'pin-to-top') return false
  const target = relativeMessage(cc, selector, direction)
  if (!target) return false
  pinMessage(cc, target)
  return true
}

export function scrollToMessage(cc: ControllerContext, el: HTMLElement): void {
  const container = cc.ctx.container
  if (!container) return
  // Navigating to a message is explicit scroll intent. Release the stick
  // follow — a mid-stream snap would cancel the animation, and the
  // input-driven lock release only covers USER input, not programmatic
  // scrolls. Likewise drop the pin anchor so the next resize doesn't yank the
  // viewport back. Arriving at the bottom does NOT re-engage the lock (reading
  // the latest content and following future content are different intents —
  // use `scrollToBottom()` to follow).
  cc.internal.locked = false
  cc.internal.pinAnchored = false
  cc.ctx.pinAnimationInterrupted = false
  cc.initialAnchoring = false
  el.style.scrollMarginTop = `${cc.options.scrollMargin}px`
  cc.navTargetEl = el
  // Live getter: the element's offset can shift mid-animation (content above
  // it resizing, a virtualizer refining estimated row offsets); the animation
  // re-reads and re-clamps every frame. Shares `anchorTop` with
  // resolveReference so the target agrees with `pinMessage` for a clamped
  // tall message.
  startAnimatedScroll(cc, () => anchorTop(cc, el, container))
  commit(cc)
}
