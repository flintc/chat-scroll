/**
 * Shape exposed on `window.__demo` so Playwright can drive each
 * scenario without relying on real time. Every scenario must implement
 * the keys it needs and leave the rest as no-ops.
 */
import type { ChatScrollBehavior, PinClamp } from '@chat-scroll/core'

export interface DemoApi {
  /** Pull the next assistant micro-chunk. Returns true if there's more. */
  tick: () => boolean
  /** Send a new user message + start the next assistant response. */
  sendUserMessage: (text?: string) => void
  /** End the current stream (clears `streaming` state). */
  finishStream: () => void
  /** Switch to a thread by index. Only meaningful in thread-switch demo. */
  switchThread?: (index: number) => void
  /**
   * Smoothly scroll the relevant container by `px` (negative = up) using
   * `scrollBy({ behavior: 'smooth' })`. Used by specs to simulate a
   * user wheel-scroll in a way that's visible in the recorded video.
   */
  scrollByPx?: (px: number) => void
  /**
   * Flash a brief on-screen cue/toast labelling whatever just happened.
   * Helps viewers of the recorded video connect a state change to the
   * user action that caused it.
   */
  showCue?: (text: string) => void
  /**
   * Toggle an expandable block (thinking / tool call) by zero-based
   * index — index 0 is the first block to have appeared in the
   * conversation. Used by the pin-to-top spec to simulate a user
   * expanding a prior turn's thinking block mid-stream.
   */
  toggleBlock?: (index: number, open?: boolean) => void
  /** Open an expandable block by index. */
  expandBlock?: (index: number) => void
  /** Close an expandable block by index. */
  collapseBlock?: (index: number) => void
  /** Set the controller's scroll behavior (smooth / instant / auto). */
  setScrollBehavior?: (behavior: ChatScrollBehavior) => void
  /**
   * Enable/disable the tall-message pin clamp at runtime (pin-to-top).
   * Pass `undefined` to turn it off. Used by the tall-user-message probe
   * to compare clamped vs. unclamped anchoring cross-engine.
   */
  setPinClamp?: (clamp: PinClamp | undefined) => void
}

declare global {
  interface Window {
    __demo?: DemoApi
  }
}
