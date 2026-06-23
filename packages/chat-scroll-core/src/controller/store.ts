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
