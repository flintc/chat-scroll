import { isAtBottom } from '../scroll-utils'
import type { Strategy } from './types'

/**
 * Stick-to-bottom strategy (traditional chat).
 *
 * Behavior:
 * - While streaming AND locked, every content resize re-pins to bottom.
 * - User scrolling up past the threshold breaks the lock.
 * - Sending a message (consumer calls `lock()`) re-engages the lock.
 *
 * The streaming gate matters for post-stream interaction: once
 * `setStreaming(false)` runs, the user can expand tool/thinking blocks
 * (or re-flow content) without the controller yanking them back to the
 * bottom. They re-engage by sending or by scrolling to bottom (the
 * consumer's FAB calls `lock()` and the next `setStreaming(true)`
 * starts the snap behavior again).
 */
export const stickToBottomStrategy: Strategy = {
  name: 'stick-to-bottom',

  onContentResize(ctx) {
    if (!ctx.container) return
    // `streamingGrace` covers the resize(s) produced by the final
    // chunk when the consumer flips streaming off in the same tick as
    // the last append — the growth renders after the flag change and
    // would otherwise be orphaned above the bottom. See
    // `setStreaming` in chat-scroll.ts.
    if (ctx.state.locked && (ctx.state.streaming || ctx.streamingGrace)) {
      ctx.container.scrollTop = ctx.container.scrollHeight
    }
  },

  onScroll(ctx) {
    if (!ctx.container) return
    // The gutter, when `bottomInset` reserves space for an overlay
    // composer, is controller-owned slack below the content — "at
    // bottom" means the content's end is reachable, not the end of that
    // reserved band. Pass it as `endSlack` so the release threshold is
    // measured against the content, exactly like the controller's own
    // at-bottom detection. 0 (no gutter) reproduces the old check.
    const slack = ctx.gutter ? parseFloat(ctx.gutter.style.height) || 0 : 0
    // Position-based lock release — the BACKUP for inputs that emit no
    // wheel/touch/key events (scrollbar drags); those inputs release
    // the lock at input time in the controller. Gated on the viewport
    // having moved UP (negative delta): content growth and the
    // streaming re-snap can transiently expose a below-threshold gap
    // at scroll-event dispatch time (the next chunk renders between
    // the snap write and its scroll event), but those events carry a
    // non-negative delta. Without the gate the lock spuriously breaks
    // mid-stream and the chat stops following.
    if (
      ctx.state.locked &&
      ctx.scrollDelta < 0 &&
      !isAtBottom(ctx.container, ctx.options.bottomThreshold, slack)
    ) {
      ctx.state.locked = false
    }
  },

  reset(ctx) {
    ctx.state.locked = true
    // Snap to bottom on reset so a thread switch lands at the latest message.
    if (ctx.container) {
      ctx.container.scrollTop = ctx.container.scrollHeight
    }
  },
}
