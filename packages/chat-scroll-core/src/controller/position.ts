import { offsetWithin } from '../scroll-utils'
import type { ScrollPosition } from '../types'
import type { ControllerContext } from './context'
import { measureAtBottom } from './reservation'
import { commit } from './store'

export function savePosition(cc: ControllerContext): ScrollPosition {
  const c = cc.ctx.container
  if (!c) {
    return { scrollTop: 0, wasAtBottom: true }
  }
  const pos: ScrollPosition = {
    scrollTop: c.scrollTop,
    wasAtBottom: measureAtBottom(cc),
  }
  // Anchor to the message at the reading position — the content child nearest
  // the viewport top. A plain top offset shifts when content ABOVE the reader
  // changes between save and restore (a history prepend, an expanded block
  // settling); landing relative to the element survives that. Saved-at-bottom
  // restores re-snap instead.
  if (!pos.wasAtBottom && cc.ctx.content) {
    let anchor: HTMLElement | null = null
    let anchorTop = -Infinity
    for (const child of Array.from(cc.ctx.content.children)) {
      if (!(child instanceof HTMLElement)) continue
      const top = offsetWithin(child, c)
      // DOM order isn't guaranteed to be visual order (windowed lists
      // force-mount out-of-range rows), so take the max top at or above the
      // viewport top instead of early-breaking.
      if (top <= c.scrollTop + 1 && top > anchorTop) {
        anchor = child
        anchorTop = top
      }
    }
    if (anchor) {
      pos.anchorEl = anchor
      pos.anchorOffset = c.scrollTop - anchorTop
    }
  }
  return pos
}

export function restorePosition(
  cc: ControllerContext,
  pos: ScrollPosition,
): void {
  const c = cc.ctx.container
  if (!c) return
  // The content swap that accompanies a thread switch fires a resize; a
  // still-engaged lock would snap to the bottom before the restore lands.
  // Release it up front — the at-bottom branch re-engages.
  cc.internal.locked = false
  cc.internal.pinAnchored = false
  cc.initialAnchoring = false
  cc.navTargetEl = null
  if (cc.activeScrollAbort) {
    cc.activeScrollAbort.abort()
    cc.internal.scrollInFlight = false
  }
  if (cc.restoreFrame !== null) cancelAnimationFrame(cc.restoreFrame)

  const apply = (): void => {
    if (cc.ctx.container !== c) return // re-mounted in between
    if (pos.wasAtBottom) {
      // The user was following this thread — they want the NEW bottom, not
      // the pixel offset of the old one. Re-engage the follow so the next
      // stream is tracked.
      c.scrollTop = c.scrollHeight
      if (cc.options.strategy === 'stick-to-bottom') cc.internal.locked = true
    } else if (pos.anchorEl?.isConnected && c.contains(pos.anchorEl)) {
      // Land relative to the anchor message — survives content changes above
      // the reading position (history prepends, expandable blocks) that shift
      // a plain top offset.
      c.scrollTop = Math.max(
        0,
        offsetWithin(pos.anchorEl, c) + (pos.anchorOffset ?? 0),
      )
    } else {
      // Anchor gone (a re-rendered thread) — measure from the TOP: messages
      // append below, so the content the user was reading keeps its
      // offset-from-top. Restoring from the bottom would shift their spot by
      // however much content arrived since the save. The browser clamps if
      // content shrank.
      c.scrollTop = Math.max(0, pos.scrollTop)
    }
  }
  // Apply now AND re-apply next frame: callers typically restore right after
  // swapping the message list in, and the synchronous write can clamp against
  // content that hasn't finished laying out.
  apply()
  cc.restoreFrame = requestAnimationFrame(() => {
    cc.restoreFrame = null
    apply()
    if (cc.ctx.container) {
      cc.internal.atBottom = measureAtBottom(cc)
    }
    commit(cc)
  })
  commit(cc)
}
