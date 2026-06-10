/**
 * @chat-scroll/core — public type surface
 *
 * Mirrors TanStack's options/state/instance pattern:
 *   ChatScrollOptions → createChatScroll(opts) → ChatScrollInstance
 */

export type ChatScrollStrategy = 'pin-to-top' | 'stick-to-bottom'

export type ChatScrollBehavior = 'auto' | 'smooth' | 'instant'

export interface ChatScrollOptions {
  /**
   * Scroll strategy.
   * - `'pin-to-top'`: pins user messages to viewport top (AI chat).
   * - `'stick-to-bottom'`: locks to bottom on new content (traditional chat).
   * @default 'stick-to-bottom'
   */
  strategy?: ChatScrollStrategy

  /**
   * Pixel threshold for "at bottom" detection.
   * User is considered at bottom when within this many px of the end.
   * @default 40
   */
  bottomThreshold?: number

  /**
   * Scroll margin applied above pinned messages (px).
   * Only used with `'pin-to-top'`.
   * @default 12
   */
  scrollMargin?: number

  /**
   * Scroll behavior.
   * - `'auto'` respects `prefers-reduced-motion`.
   * - `'smooth'` always smooth.
   * - `'instant'` always instant.
   * @default 'auto'
   */
  scrollBehavior?: ChatScrollBehavior

  /**
   * Duration of smooth-scroll animations, in milliseconds. Ignored when
   * the resolved behavior is `'instant'` (or when reduced-motion kicks
   * in). Pass `0` for an instant write while keeping `'smooth'`
   * selected.
   * @default 320
   */
  scrollDurationMs?: number

  /**
   * Called when state changes. Framework adapters use this to publish
   * reactive state into their own systems (signals, hooks, refs).
   */
  onScrollChange?: (state: ChatScrollState) => void
}

export interface ChatScrollState {
  /** True when the user is within `bottomThreshold` of the end. */
  atBottom: boolean
  /**
   * True while a pin-to-top message is set — i.e. the controller has
   * a pinned element it is sizing the gutter around. Says nothing
   * about whether the user is currently *at* the pin; see
   * `pinAnchored` for that.
   */
  pinActive: boolean
  /**
   * True while the user is still sitting at the pinned message — i.e.
   * the controller will re-anchor `scrollTop` to `pinnedY` on the next
   * content resize. Cleared by *scroll-driving* user input
   * (wheel, touchmove, ArrowUp/Down, PageUp/Down, Home/End, Space),
   * by programmatic `scrollToBottom()` (the consumer's explicit "move
   * away from the pin" affordance), and by a consumer scroll that moves
   * the viewport away from the pin in either direction (scrollTo /
   * scrollBy / scrollIntoView). Not cleared by pointerdown /
   * touchstart / Tab / Enter / letters — those are interaction events,
   * not scroll events.
   */
  pinAnchored: boolean
  /** True while streaming mode is enabled (`overflow-anchor: none`). */
  streaming: boolean
  /**
   * True when the bottom-stick lock is engaged (stick-to-bottom only).
   * Released by upward scroll-driving input (wheel-up, a downward
   * touch pan, ArrowUp / PageUp / Home / Shift+Space) the moment the
   * input arrives — not when the resulting scroll lands, which during
   * a stream would race the controller's own re-snap and lose — and,
   * as a backup for inputs that emit no wheel/touch/key events
   * (scrollbar drags), by any scroll that leaves the bottom threshold.
   * Re-engaged by `lock()` (send), `scrollToBottom()` completing, and
   * `reset()`.
   */
  locked: boolean
  /**
   * True while a controller-owned rAF scroll animation is in flight
   * (e.g. the smooth-scroll from `pinMessage` or `scrollToBottom`).
   * Useful for hiding affordances that would race the animation.
   */
  scrollInFlight: boolean
  /**
   * Absolute Y offset (in the scroll plane) of the pinned message's
   * top edge minus `scrollMargin`. -1 when no pin is active. Refreshed
   * on every content resize so it tracks the live element.
   */
  pinnedY: number
}

/**
 * Opaque token returned by `savePosition()`. Treat as readonly — pass back
 * into `restorePosition(token)` to recover scroll state across navigation.
 */
export interface ScrollPosition {
  /** Distance from the top of the content. Used when `wasAtBottom` is false. */
  scrollTop: number
  /** True when the saved position was at-bottom — restoration re-snaps to the (new) bottom. */
  wasAtBottom: boolean
}

export interface ChatScrollInstance {
  /** Current state — read-only snapshot. Subscribe via `onScrollChange`. */
  readonly state: ChatScrollState

  /** Current resolved options. */
  readonly options: Required<Omit<ChatScrollOptions, 'onScrollChange'>> & {
    onScrollChange?: ChatScrollOptions['onScrollChange']
  }

  /**
   * Wire up the scrollable container and content wrapper.
   * Idempotent — calling with the same elements is a no-op; calling with
   * new elements re-mounts.
   */
  mount: (container: HTMLElement, content: HTMLElement) => void

  /**
   * Update options at any time. Partial — unspecified keys retain their
   * values, and keys explicitly passed as `undefined` are ignored too
   * (so adapters can pass every key on every render).
   */
  setOptions: (opts: Partial<ChatScrollOptions>) => void

  /**
   * Pin a message element to the top of the viewport.
   * No-op when strategy is `'stick-to-bottom'`.
   */
  pinMessage: (el: HTMLElement) => void

  /**
   * Convenience: query the container for the last element matching the
   * selector and pin it. Defers to the next animation frame so the
   * element has been laid out.
   */
  pinLatest: (selector: string) => void

  /**
   * Pin the previous / next element matching the selector. `direction`
   * is `-1` (previous) or `1` (next). Returns `true` when a target was
   * pinned, `false` at the edges of the list (or on
   * `'stick-to-bottom'`) — wire it to your buttons' disabled state.
   *
   * The reference point adapts to where the user actually is:
   * - While they're still anchored at the pin, navigation is relative
   *   to the pinned element.
   * - After they scroll away (wheel, touch, keys, a consumer scroll),
   *   navigation is relative to the match nearest the viewport top —
   *   i.e. the turn they're currently reading. In that mode `-1` first
   *   re-pins the turn being read when the viewport sits below its top
   *   (like an editor's go-to-previous-change), then walks upward.
   *   This also means pinRelative works before any pin exists.
   *
   * Resolves synchronously against the rendered DOM, so back-to-back
   * calls (rapid clicks, held keybindings) accumulate correctly.
   *
   * Typical use: prev/next user-message navigation driven by buttons
   * or `cmd+↑` / `cmd+↓` keybindings.
   */
  pinRelative: (selector: string, direction: -1 | 1) => boolean

  /**
   * The element currently pinned — including one whose `pinMessage`
   * call is still waiting on its measurement frame. `null` when no pin
   * is active. Useful for navigation UI: disabling prev/next at the
   * edges, or highlighting the pinned turn.
   */
  getPinnedElement: () => HTMLElement | null

  /**
   * Imperatively scroll to the bottom. Uses resolved scroll behavior;
   * the target tracks live `scrollHeight`, so content streaming in
   * mid-animation doesn't leave the scroll short of the real bottom.
   * Side effects: clears `pinAnchored` (pin-to-top); re-engages the
   * lock once the scroll completes un-aborted (stick-to-bottom), so a
   * FAB wired to this resumes following the stream.
   */
  scrollToBottom: () => void

  /** Engage the stick-to-bottom lock. No-op when strategy is `'pin-to-top'`. */
  lock: () => void

  /** Release the stick-to-bottom lock. No-op when strategy is `'pin-to-top'`. */
  unlock: () => void

  /** Toggle streaming mode (`overflow-anchor` on container). */
  setStreaming: (streaming: boolean) => void

  /**
   * Reset all per-thread state — call on conversation switch.
   * Clears the pin, releases the lock, and zeroes the gutter.
   * Listeners and observers are preserved.
   */
  reset: () => void

  /** Snapshot current scroll state. */
  savePosition: () => ScrollPosition

  /** Apply a previously saved scroll snapshot. */
  restorePosition: (pos: ScrollPosition) => void

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe: (listener: (state: ChatScrollState) => void) => () => void

  /** Tear down listeners, observer, gutter element. */
  destroy: () => void
}
