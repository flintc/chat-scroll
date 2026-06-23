import type { ControllerContext } from './context'

/**
 * The controller takes over a handful of layout-critical styles on the
 * consumer's container and content elements, saving the prior inline values
 * so `destroy()` / re-mount restores exactly what was there.
 *
 * Container becomes a column flexbox scroll port (so the gutter sits below
 * the content); content gets `flex-shrink: 0` so a virtualizer's
 * absolutely-positioned wrapper isn't crushed to viewport height.
 */
export function applyContainerStyles(cc: ControllerContext): void {
  const container = cc.ctx.container
  if (!container) return
  cc.savedContainerStyles = {
    overflowY: container.style.overflowY,
    display: container.style.display,
    flexDirection: container.style.flexDirection,
    overflowAnchor: container.style.overflowAnchor,
  }
  container.style.overflowY = 'auto'
  container.style.display = 'flex'
  container.style.flexDirection = 'column'
}

export function applyContentStyles(cc: ControllerContext): void {
  const content = cc.ctx.content
  if (!content) return
  cc.savedContentStyles = { flexShrink: content.style.flexShrink }
  // The container is a column flexbox (so the gutter sits below the
  // content), which makes the content element a flex item with default
  // `flex-shrink: 1`. A normal message list survives that only because its
  // `min-height: auto` floor is its own text. A content element whose
  // children are absolutely positioned — a virtualizer's total-size wrapper
  // is the canonical case — has min-content height 0 and would be silently
  // crushed to the viewport height, destroying the scroll range.
  content.style.flexShrink = '0'
}

export function restoreContainerStyles(cc: ControllerContext): void {
  const container = cc.ctx.container
  if (!cc.savedContainerStyles || !container) return
  container.style.overflowY = cc.savedContainerStyles.overflowY
  container.style.display = cc.savedContainerStyles.display
  container.style.flexDirection = cc.savedContainerStyles.flexDirection
  container.style.overflowAnchor = cc.savedContainerStyles.overflowAnchor
  cc.savedContainerStyles = null
}

export function restoreContentStyles(cc: ControllerContext): void {
  const content = cc.ctx.content
  if (!cc.savedContentStyles || !content) return
  content.style.flexShrink = cc.savedContentStyles.flexShrink
  cc.savedContentStyles = null
}
