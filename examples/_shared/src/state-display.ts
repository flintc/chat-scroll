import type { ChatScrollState, ChatScrollStrategy } from '@chat-scroll/core'

/**
 * Format the controller's state into a single status-line string for
 * the demo UI. Shared across vanilla / solid / vue so every framework's
 * scenarios show the same fields in the same order.
 *
 * Field names mirror the actual `ChatScrollState` property names so the
 * line is self-documenting — what you see in the demo is what `state.X`
 * is in code.
 *
 *   strategy=pin-to-top streaming=· pinActive=✓ pinAnchored=✓ atBottom=· animating=· pinnedY=288
 *   strategy=stick-to-bottom streaming=· locked=✓ atBottom=✓ animating=·
 *
 * The `.status` row uses `white-space: nowrap` + `text-overflow: ellipsis`,
 * so on narrow viewports (side-by-side at ~280px panel width) the tail
 * may ellipsize — the leftmost fields stay readable. Wrapping is what
 * we avoid, since it would shrink `.chat__scroll`'s clientHeight.
 *
 * Tags use ✓ / · (mid-dot) to keep boolean changes glanceable.
 * `pinnedY` shows the rounded value, or `—` when no pin is set
 * (-1 sentinel).
 */
export function formatState(
  strategy: ChatScrollStrategy,
  s: ChatScrollState,
  extra?: string,
): string {
  const t = (on: boolean): string => (on ? '✓' : '·')
  const pinnedY = s.pinnedY < 0 ? '—' : Math.round(s.pinnedY).toString()
  const strategyBits =
    strategy === 'stick-to-bottom'
      ? `locked=${t(s.locked)}`
      : `pinActive=${t(s.pinActive)} pinAnchored=${t(s.pinAnchored)}`
  const tailExtra = extra ? ` ${extra}` : ''
  const pinnedYBit = strategy === 'pin-to-top' ? ` pinnedY=${pinnedY}` : ''
  return (
    `strategy=${strategy} streaming=${t(s.streaming)} ${strategyBits} ` +
    `atBottom=${t(s.atBottom)} animating=${t(s.scrollInFlight)}${pinnedYBit}${tailExtra}`
  )
}
