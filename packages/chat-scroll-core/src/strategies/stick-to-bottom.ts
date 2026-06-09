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
    if (ctx.state.locked && ctx.state.streaming) {
      ctx.container.scrollTop = ctx.container.scrollHeight
    }
  },

  onScroll(ctx) {
    if (!ctx.container) return
    // If the user scrolled away from the bottom while locked, release the lock.
    if (
      ctx.state.locked &&
      !isAtBottom(ctx.container, ctx.options.bottomThreshold)
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
