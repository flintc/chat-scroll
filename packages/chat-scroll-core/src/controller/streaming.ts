import type { ControllerContext } from './context'
import { commit } from './store'

export function cancelStreamingGrace(cc: ControllerContext): void {
  if (cc.streamingGraceFrame !== null) {
    cancelAnimationFrame(cc.streamingGraceFrame)
    cc.streamingGraceFrame = null
  }
  cc.ctx.streamingGrace = false
}

export function setStreaming(cc: ControllerContext, streaming: boolean): void {
  const wasStreaming = cc.internal.streaming
  cc.internal.streaming = streaming
  if (streaming) {
    cancelStreamingGrace(cc)
    if (cc.ctx.container) cc.ctx.container.style.overflowAnchor = 'none'
    commit(cc)
    return
  }
  if (wasStreaming) {
    // Grace period: the final chunk often renders AFTER the consumer flips
    // their loading flag — the append and the flag change land in the same
    // tick, but the resulting ResizeObserver callback fires later. Without the
    // grace, stick-to-bottom stops snapping one resize too early and that last
    // growth is orphaned above the bottom. Keep following (and keep
    // `overflow-anchor: none`) for two frames; real user input still wins
    // immediately because the lock release runs at input time.
    cc.ctx.streamingGrace = true
    if (cc.streamingGraceFrame !== null) {
      cancelAnimationFrame(cc.streamingGraceFrame)
    }
    cc.streamingGraceFrame = requestAnimationFrame(() => {
      cc.streamingGraceFrame = requestAnimationFrame(() => {
        cc.streamingGraceFrame = null
        cc.ctx.streamingGrace = false
        if (cc.ctx.container) cc.ctx.container.style.overflowAnchor = ''
      })
    })
  } else if (cc.ctx.container) {
    cc.ctx.container.style.overflowAnchor = ''
  }
  commit(cc)
}
