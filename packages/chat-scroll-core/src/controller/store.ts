import type { ChatScrollState } from '../types'
import type { ControllerContext } from './context'

export function statesEqual(a: ChatScrollState, b: ChatScrollState): boolean {
  return (
    a.atBottom === b.atBottom &&
    a.pinActive === b.pinActive &&
    a.pinAnchored === b.pinAnchored &&
    a.streaming === b.streaming &&
    a.locked === b.locked &&
    a.scrollInFlight === b.scrollInFlight &&
    a.pinnedY === b.pinnedY
  )
}

/**
 * Reconcile `overflow-anchor` on the container to the controller's current
 * intent. `overflow-anchor: none` disables the browser's own scroll-anchoring
 * so the controller can own `scrollTop` without the two fighting — but that
 * also strips the browser's safety net that keeps a reader's place when
 * content grows ABOVE them (a late image, expanding markdown). We only want
 * `none` while the controller is ACTIVELY holding a position the user asked to
 * stay at: locked to the bottom, anchored on the pin, or mid controller-owned
 * animation. The instant the user scrolls away mid-stream (none of those), we
 * restore the browser default so their reading position survives growth above.
 *
 * Driven from `commit` so every lock / pin / streaming / animation transition
 * reconciles synchronously, plus directly from `setStreaming`'s grace timer
 * (a `streamingGrace` flip is not part of `ChatScrollState`, so it doesn't go
 * through the state diff). Idempotent: only writes when the value changes.
 */
export function reconcileOverflowAnchor(cc: ControllerContext): void {
  const container = cc.ctx.container
  if (!container) return
  const managing =
    (cc.internal.streaming || cc.ctx.streamingGrace) &&
    (cc.internal.locked ||
      cc.internal.pinAnchored ||
      cc.internal.scrollInFlight)
  const desired = managing ? 'none' : ''
  if (container.style.overflowAnchor !== desired) {
    container.style.overflowAnchor = desired
  }
}

/**
 * The single notification funnel. Every state-affecting code path mutates
 * `cc.internal` directly and then calls `commit`; this diffs against the last
 * frozen snapshot and, only on a real change, mints a new frozen snapshot and
 * notifies `onScrollChange` plus every subscriber. The diff is what keeps
 * `useSyncExternalStore` from thrashing — snapshot identity is stable across
 * no-op commits.
 */
export function commit(cc: ControllerContext): void {
  if (statesEqual(cc.snapshot, cc.internal)) return
  cc.snapshot = Object.freeze({ ...cc.internal })
  // Any state change that flips streaming / locked / pinAnchored /
  // scrollInFlight changes whether the controller is actively managing
  // scrollTop — reconcile the browser's anchoring to match before notifying.
  reconcileOverflowAnchor(cc)
  cc.options.onScrollChange?.(cc.snapshot)
  cc.listeners.forEach((l) => l(cc.snapshot))
}

export function subscribe(
  cc: ControllerContext,
  listener: (state: ChatScrollState) => void,
): () => void {
  cc.listeners.add(listener)
  return () => {
    cc.listeners.delete(listener)
  }
}
