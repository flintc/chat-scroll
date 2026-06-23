import type { ControllerContext } from './context'
import { commit } from './store'

/**
 * Cancel any in-flight rAF animation when the user touches or wheels the
 * container. UX standard: never fight user input.
 *
 * ALSO: a real *scroll-driving* user input is the most reliable signal that
 * the user is intentionally moving the viewport, so we use it to clear
 * `ctx.pinAnchored`. Without that, every user scroll-away would still look
 * like "at the pin" to the resize-time math and we'd snap them back. Plain
 * scroll events aren't enough — programmatic scrolls and browser-driven
 * clamps also fire scroll events, so we can't distinguish them at scroll
 * time.
 *
 * We split the input set deliberately:
 *   - `abort-only` events: pointerdown/touchstart. These could be a tap on an
 *     in-page button (e.g. expanding a `<details>` block), not a scroll.
 *     Aborting an in-flight scroll animation is still correct here — the user
 *     is engaged with the page — but clearing `pinAnchored` would drop the
 *     pin on a non-scroll tap and a subsequent expand would visibly drift the
 *     pin by the block's height. When the abort interrupts an in-flight pin
 *     animation, we also flag `pinAnimationInterrupted` so the next resize
 *     knows to *animate* the catch-up to the pin rather than teleport.
 *   - `scroll-driving` events: wheel, touchmove, and a curated set of keydown
 *     keys (arrows, PageUp/Down, Home/End, Space). We clear `pinAnchored`
 *     synchronously UNLESS the event's target sits inside a descendant
 *     scrollable that can absorb the event's delta. The descendant-scrollable
 *     check handles the case where a horizontal pan on a wide code block (or
 *     any other inner-scrolling content) bubbles to the chat's wheel listener
 *     but the chat itself doesn't move.
 *
 * Without the pointerdown-mid-animation guard and the nested-scroll guard
 * below, tapping a tool-call summary in a prior bot reply drifts the pin by
 * the block's height, because pointerdown clears `pinAnchored` and a
 * subsequent expand shifts the anchor.
 */
export function attachUserInputCancellers(cc: ControllerContext): void {
  const container = cc.ctx.container
  if (!container) return

  const abortAnim = (): boolean => {
    const wasInFlight = cc.internal.scrollInFlight
    cc.activeScrollAbort?.abort()
    cc.internal.scrollInFlight = false
    // Any user input ends the initial-position anchoring — the user has
    // taken over the viewport.
    cc.initialAnchoring = false
    return wasInFlight
  }
  // If an abort cut a pin animation short while the pin is being preserved,
  // the resize that follows must animate the catch-up rather than teleport.
  // The flag is consumed by the strategy on the next `recalcGutter`. Every
  // "preserve the pin" path below that aborted an in-flight animation goes
  // through this.
  const flagInterruptedPinAnimation = (wasInFlight: boolean): void => {
    if (wasInFlight && cc.internal.pinAnchored) {
      cc.ctx.pinAnimationInterrupted = true
    }
  }
  const abortOnly = (): void => {
    flagInterruptedPinAnimation(abortAnim())
    commit(cc)
  }

  // Walk from `target` up to (but not including) `container` looking for a
  // scrollable ancestor that can absorb the given delta. Used by the
  // wheel/touchmove handlers to recognize when an input event belongs to a
  // nested scrollable inside the chat — a horizontally-pannable code block,
  // an inner panel — so we don't falsely clear `pinAnchored` for an event
  // that never moved the chat's own scrollTop.
  const findDescendantScrollable = (
    target: EventTarget | null,
    deltaX: number,
    deltaY: number,
  ): HTMLElement | null => {
    const view = container.ownerDocument.defaultView
    if (!view) return null
    let el = target instanceof HTMLElement ? target : null
    while (el && el !== container) {
      const cs = view.getComputedStyle(el)
      const ox = cs.overflowX
      const oy = cs.overflowY
      if (
        Math.abs(deltaX) > 0 &&
        (ox === 'auto' || ox === 'scroll') &&
        el.scrollWidth > el.clientWidth
      ) {
        return el
      }
      if (
        Math.abs(deltaY) > 0 &&
        (oy === 'auto' || oy === 'scroll') &&
        el.scrollHeight > el.clientHeight
      ) {
        return el
      }
      el = el.parentElement
    }
    return null
  }

  const clearPinAnchored = (): void => {
    cc.internal.pinAnchored = false
    cc.ctx.pinAnimationInterrupted = false
  }

  // Release the stick-to-bottom lock from the INPUT event, not from the
  // resulting scroll position. While streaming, the strategy re-snaps
  // `scrollTop` to the bottom on every content tick — which cancels the
  // browser's in-progress wheel/touch scroll before it can produce a scroll
  // event that observably leaves the bottom. A position-based release alone
  // therefore loses that race and the chat "swallows" upward scrolls
  // mid-stream: the user wheels up, the next chunk snaps them straight back.
  // Same principle the pin strategy documents: trust input events, not scroll
  // events. The position-based release in the strategy's `onScroll` remains
  // as a backup for inputs that produce no wheel/touch/key events at all
  // (scrollbar drags).
  const releaseStickLock = (): void => {
    if (cc.options.strategy !== 'stick-to-bottom') return
    if (!cc.internal.locked) return
    // An upward scroll needs somewhere to go. Before the content overflows
    // (scrollTop pinned at 0), a wheel-up is a no-op and must not silently
    // kill the lock.
    if (container.scrollTop <= 0) return
    cc.internal.locked = false
  }

  const onWheel = (ev: Event): void => {
    const wasInFlight = abortAnim()
    const we = ev as WheelEvent
    const dx = typeof we.deltaX === 'number' ? we.deltaX : 0
    const dy = typeof we.deltaY === 'number' ? we.deltaY : 0
    // Horizontal-only wheel can never move the chat vertically. Still check
    // for a descendant scrollable that can absorb the horizontal delta — that
    // path through findDescendantScrollable does it without a separate
    // special case.
    if (findDescendantScrollable(ev.target, dx, dy)) {
      flagInterruptedPinAnimation(wasInFlight)
      commit(cc)
      return
    }
    // No descendant absorbed the event, but if there's also no vertical
    // delta, the chat itself won't move — treat as a non-scroll-driving event
    // so the pin stays.
    if (dy === 0) {
      flagInterruptedPinAnimation(wasInFlight)
      commit(cc)
      return
    }
    if (dy < 0) releaseStickLock()
    clearPinAnchored()
    commit(cc)
  }

  // Last touch Y, tracked across touchstart/touchmove so the touchmove
  // handler can tell pan direction (finger moving DOWN the screen scrolls the
  // content UP, away from the bottom).
  let lastTouchY: number | null = null
  const touchY = (ev: Event): number | null => {
    const t = (ev as TouchEvent).touches?.[0]
    return typeof t?.clientY === 'number' ? t.clientY : null
  }
  const onTouchstart = (ev: Event): void => {
    lastTouchY = touchY(ev)
    flagInterruptedPinAnimation(abortAnim())
    commit(cc)
  }
  const onTouchmove = (ev: Event): void => {
    const wasInFlight = abortAnim()
    // Touchmove doesn't carry per-event delta in a friendly form (it's
    // tracked across `touchstart` + cumulative positions). Use a conservative
    // descendant check: if the target is *inside* any scrollable element,
    // assume the inner scroll is consuming the gesture. Pass `Infinity` for
    // both axes so any scrollable ancestor matches regardless of orientation.
    if (findDescendantScrollable(ev.target, Infinity, Infinity)) {
      flagInterruptedPinAnimation(wasInFlight)
      commit(cc)
      return
    }
    const y = touchY(ev)
    // Finger moving down (y increasing) pans the content up — the user is
    // scrolling toward older messages. Unknown direction (no touch points
    // exposed) is treated as upward so the user's gesture always wins over
    // the lock.
    if (y === null || lastTouchY === null || y > lastTouchY) {
      releaseStickLock()
    }
    if (y !== null) lastTouchY = y
    clearPinAnchored()
    commit(cc)
  }

  // Keyboard/mouse parity for in-chat interactions. A "scroll key" is only
  // scroll intent when the browser will actually scroll the chat with it:
  //  - inside an editable (input/textarea/select/contenteditable), arrows and
  //    Home/End move the caret and Space types — none of them scroll the
  //    chat;
  //  - Space on an activatable element (button, <summary>, link) ACTIVATES
  //    it. A mouse click on the same element preserves the pin via the
  //    pointerdown path; Tab+Space must get the same treatment, or keyboard
  //    users see the pin drift on every tool-block toggle.
  const isEditableTarget = (t: EventTarget | null): boolean =>
    t instanceof HTMLElement &&
    t.closest(
      'input, textarea, select, [contenteditable="true"], [contenteditable=""]',
    ) !== null
  const isActivatableTarget = (t: EventTarget | null): boolean =>
    t instanceof HTMLElement &&
    t.closest('button, summary, a[href], [role="button"]') !== null

  const onKeydown = (ev: Event): void => {
    const wasInFlight = abortAnim()
    const e = ev as KeyboardEvent
    const isScrollKey =
      e.key === 'ArrowUp' ||
      e.key === 'ArrowDown' ||
      e.key === 'PageUp' ||
      e.key === 'PageDown' ||
      e.key === 'Home' ||
      e.key === 'End' ||
      e.key === ' '
    if (!isScrollKey) {
      // Tab / Enter / letter keys: same semantics as pointerdown — an
      // interaction event, not a scroll event. Preserve the pin and flag
      // mid-animation interruption for an animated catch-up.
      flagInterruptedPinAnimation(wasInFlight)
      commit(cc)
      return
    }
    // The focused element consumes the key (see above): interaction, not
    // scroll intent.
    if (
      isEditableTarget(ev.target) ||
      (e.key === ' ' && isActivatableTarget(ev.target))
    ) {
      flagInterruptedPinAnimation(wasInFlight)
      commit(cc)
      return
    }
    // Scroll-driving key. If focus is in a descendant scrollable (e.g. an
    // inner panel), the key targets that scrollable, not the chat — preserve
    // the pin.
    if (findDescendantScrollable(ev.target, Infinity, Infinity)) {
      flagInterruptedPinAnimation(wasInFlight)
      commit(cc)
      return
    }
    const scrollsUp =
      e.key === 'ArrowUp' ||
      e.key === 'PageUp' ||
      e.key === 'Home' ||
      (e.key === ' ' && e.shiftKey)
    if (scrollsUp) releaseStickLock()
    clearPinAnchored()
    commit(cc)
  }

  const bind = (type: string, fn: (ev: Event) => void): void => {
    container.addEventListener(type, fn, { passive: true })
    cc.userInputListeners.push({ type, fn: fn as () => void })
  }
  bind('wheel', onWheel)
  bind('touchmove', onTouchmove)
  bind('touchstart', onTouchstart)
  bind('pointerdown', abortOnly)
  bind('keydown', onKeydown)
}
