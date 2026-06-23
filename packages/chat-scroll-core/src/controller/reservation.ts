import { setGutterHeight } from '../gutter'
import { isAtBottom } from '../scroll-utils'
import { recalcGutter } from '../strategies/pin-to-top'
import type { ControllerContext } from './context'

/**
 * `atBottom` means "the end of the CONTENT is within reach" — the gutter is
 * controller-owned slack below the content and doesn't count. Measuring
 * against raw scrollHeight would make `atBottom` flap during an in-flight pin
 * animation: the no-shrink floor keeps the gutter slack while streamed chunks
 * land, so the scrollHeight distance oscillates around the threshold even
 * though the user never loses sight of the content's end.
 */
export function measureAtBottom(cc: ControllerContext): boolean {
  const container = cc.ctx.container
  if (!container) return true
  const slack = cc.ctx.gutter
    ? parseFloat(cc.ctx.gutter.style.height) || 0
    : 0
  return isAtBottom(container, cc.options.bottomThreshold, slack)
}

/**
 * Size the gutter to reserve `bottomInset` of space below the content for an
 * obstruction overlaying the bottom of the viewport (an out-of-flow
 * composer). The reservation lives in the controller-owned gutter — we never
 * touch the consumer's container padding.
 *   - pin-to-top: folded into `recalcGutter` (gutter = max(pinReserve,
 *     inset)), so the pin still lands at the top and there's always at least
 *     `inset` of room below the last message.
 *   - stick-to-bottom: the gutter is otherwise unused, so it becomes a pure
 *     `inset`-tall spacer; snapping to the bottom then lands the reserved
 *     band behind the composer and the last message above it.
 * Idempotent — `setGutterHeight` no-ops when the value is unchanged.
 */
export function applyBottomReservation(cc: ControllerContext): void {
  const { container, gutter } = cc.ctx
  if (!container || !gutter) return
  if (cc.options.strategy === 'pin-to-top') {
    recalcGutter(cc.ctx)
  } else {
    setGutterHeight(gutter, cc.options.bottomInset)
  }
}
