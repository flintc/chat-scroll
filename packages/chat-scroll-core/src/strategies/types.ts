import type { ChatScrollState, PinClamp } from '../types'

/**
 * Internal context handed to a strategy. Strategies are mostly stateless —
 * they read/write fields on this context object that lives on the
 * `ChatScroll` instance.
 */
export interface StrategyContext {
  container: HTMLElement | null
  content: HTMLElement | null
  gutter: HTMLElement | null

  /**
   * The DOM element currently being pinned, or null when no pin.
   *
   * We keep the reference so `state.pinnedY` can be **re-read from the
   * live element** whenever content above the pin resizes (a thinking
   * or tool-call block being expanded/collapsed is the motivating
   * case). Without this, `pinnedY` is frozen at pin-time and the
   * gutter math goes stale.
   *
   * Not part of `state` because HTMLElement references aren't useful
   * in a serialized snapshot for `useSyncExternalStore` consumers.
   */
  pinnedEl: HTMLElement | null

  /**
   * Margin applied below the pinned message (the same value passed in
   * `pinMessage`'s scrollMargin option, resolved). Carried on context so
   * `recalcGutter` can subtract it correctly when refreshing `pinnedY`.
   */
  pinnedMargin: number

  /**
   * Mutable state — strategies update fields directly, the controller's
   * `commit()` emits a frozen snapshot when fields change.
   *
   * The public observable state lives here: `atBottom`, `pinActive`,
   * `pinAnchored`, `streaming`, `locked`, `scrollInFlight`, `pinnedY`.
   */
  state: ChatScrollState

  /** Resolved options. */
  options: {
    bottomThreshold: number
    scrollMargin: number
    /**
     * Height of a bottom-overlaying obstruction (an out-of-flow
     * composer). Reserved below the content via the gutter so the last
     * message clears it. 0 when there's no overlay. See
     * `ChatScrollOptions.bottomInset`.
     */
    bottomInset: number
    /**
     * Clamp config for over-tall pinned messages, or `undefined` when off.
     * Applied to the derived `pinnedY` in the pin-to-top strategy so a
     * very tall pin is over-scrolled to leave the response room. See
     * `ChatScrollOptions.pinClamp`.
     */
    pinClamp?: PinClamp
  }

  /**
   * scrollTop delta of the scroll event currently being handled
   * (current minus previous). Set by the controller before
   * `onScroll` runs; meaningless outside of it. Lets strategies tell
   * an upward user movement (negative) from controller snaps and
   * growth-race artifacts (non-negative) — see stick-to-bottom's
   * lock-release backup.
   */
  scrollDelta: number

  /**
   * True for a couple of frames after `setStreaming(false)` when a
   * stream was running. The final chunk's growth typically renders
   * AFTER the consumer flips their loading flag; strategies that gate
   * follow-behavior on `state.streaming` honor this window so that
   * growth isn't orphaned. Owned by the controller (`setStreaming`).
   */
  streamingGrace: boolean

  /**
   * True between "pin animation aborted by an interaction event"
   * (pointerdown / touchstart while `scrollInFlight`) and the next
   * `recalcGutter` that consumes it. Disambiguates two states that look
   * identical from `pinAnchored + scrollInFlight + scrollTop`:
   *   - The user tapped a block mid-pin-animation. We want to re-anchor
   *     to the pin; a synchronous `scrollTop = pinnedY` is a visible
   *     teleport, so we animate the catch-up instead.
   *   - The user (consumer) scrolled away by some other means. We want
   *     to give up the pin; this flag is *not* set, so the scroll-event
   *     check in the controller clears `pinAnchored` instead.
   * Strategies treat this as a hint, not state. The controller owns the
   * flag's lifecycle (set on abort, cleared on consume / new pin / FAB).
   */
  pinAnimationInterrupted: boolean

  /**
   * Animated re-anchor callback. The controller wires this up at mount
   * time; strategies call it instead of writing `scrollTop` directly
   * when they want a smooth catch-up rather than a synchronous jump.
   * The catch-up tracks the live `pinnedY` itself, so there is no
   * target argument — mid-flight content changes are followed.
   */
  reAnchorPin?: () => void
}

export interface Strategy {
  readonly name: 'pin-to-top' | 'stick-to-bottom'

  /** Called from ResizeObserver — content size changed. */
  onContentResize: (ctx: StrategyContext) => void

  /** Called on every scroll event after at-bottom detection runs. */
  onScroll: (ctx: StrategyContext) => void

  /** Reset per-thread state. */
  reset: (ctx: StrategyContext) => void
}
