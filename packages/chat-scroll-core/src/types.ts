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
   * (wheel, touchmove, ArrowUp/Down, PageUp/Down, Home/End, Space) and
   * by programmatic `scrollToBottom()` (the consumer's explicit "move
   * away from the pin" affordance). Not cleared by pointerdown /
   * touchstart / Tab / Enter / letters — those are interaction events,
   * not scroll events.
   */
  pinAnchored: boolean
  /** True while streaming mode is enabled (`overflow-anchor: none`). */
  streaming: boolean
  /** True when the bottom-stick lock is engaged (stick-to-bottom only). */
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
  /** Distance from the top of the content. */
  scrollTop: number
  /** Distance from the bottom — preserved when `atBottom` was true. */
  scrollFromBottom: number
  /** True when the saved position was at-bottom. Restoration prefers this. */
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

  /** Update options at any time. Partial — unspecified keys retain values. */
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
   * Navigate to the previous / next element matching the selector,
   * relative to the currently pinned element. `direction` is `-1`
   * (previous) or `1` (next). No-op when no message is currently
   * pinned, when the current pin isn't in the matched set, or when
   * already at an edge of the list. No-op on `'stick-to-bottom'`.
   *
   * Typical use: prev/next user-message navigation driven by buttons
   * or `cmd+↑` / `cmd+↓` keybindings.
   */
  pinRelative: (selector: string, direction: -1 | 1) => void

  /** Imperatively scroll to the bottom. Uses resolved scroll behavior. */
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
