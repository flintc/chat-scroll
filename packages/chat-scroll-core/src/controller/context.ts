import type { SavedGutterStyles } from '../gutter'
import { pinToTopStrategy } from '../strategies/pin-to-top'
import { stickToBottomStrategy } from '../strategies/stick-to-bottom'
import type { Strategy, StrategyContext } from '../strategies/types'
import type {
  ChatScrollOptions,
  ChatScrollState,
  ResolvedChatScrollOptions,
} from '../types'

/**
 * Resolved options — every option present, plus the optional clearable
 * pair (`pinClamp`, `onScrollChange`), which have no default: `undefined`
 * means "off". The definition lives in types.ts so the public
 * `ChatScrollInstance['options']` surface and the controller share one
 * shape.
 */
export type ResolvedOptions = ResolvedChatScrollOptions

export type Listener = (state: ChatScrollState) => void

export type SavedContainerStyles = {
  overflowY: string
  display: string
  flexDirection: string
  overflowAnchor: string
}

export type SavedContentStyles = { flexShrink: string }

export type UserInputListener = { type: string; fn: () => void }

export const DEFAULTS = {
  strategy: 'stick-to-bottom' as const,
  bottomThreshold: 40,
  scrollMargin: 12,
  bottomInset: 0,
  scrollBehavior: 'auto' as const,
  scrollDurationMs: 320,
  initialPosition: 'none' as const,
}

export const STRATEGIES: Record<
  NonNullable<ChatScrollOptions['strategy']>,
  Strategy
> = {
  'pin-to-top': pinToTopStrategy,
  'stick-to-bottom': stickToBottomStrategy,
}

/**
 * The shared controller context — the single mutable object threaded through
 * every controller module. Rather than one large closure owning the
 * controller's private variables, each capability module (pin, navigation,
 * input, dom, streaming, position, …) reads and writes its slice on this
 * object.
 *
 * `ctx` is the narrower, strategy-facing view — the same object the
 * strategies receive — and `ctx.state` is aliased by `internal` here so
 * strategy writes and controller writes hit one object. Everything else is
 * controller-only bookkeeping that strategies never see.
 */
export interface ControllerContext {
  /** Strategy-facing view. `ctx.state` is the same object as `internal`. */
  ctx: StrategyContext
  /**
   * Mutable working state used by every module. Same object as `ctx.state`.
   * `snapshot` is the frozen view exposed to consumers.
   */
  internal: ChatScrollState
  /**
   * Frozen, identity-stable snapshot exposed to consumers —
   * `useSyncExternalStore` depends on this stability.
   */
  snapshot: Readonly<ChatScrollState>
  /** Resolved options. Reassigned wholesale by `setOptions`. */
  options: ResolvedOptions
  /** Active strategy. Swapped by `setOptions` when `strategy` changes. */
  strategy: Strategy
  /** State-change subscribers. */
  listeners: Set<Listener>

  // ── DOM bindings / observers ──────────────────────────────────
  resizeObserver: ResizeObserver | null
  /**
   * Second observer, watching the container's CONTENT box, so a change to
   * the container's own padding re-triggers the gutter recalc. See
   * `attachResizeObservers` for why one observer can't cover both boxes.
   */
  paddingObserver: ResizeObserver | null
  scrollListener: (() => void) | null
  userInputListeners: UserInputListener[]

  // ── Pending work (rAF handles, abort) ─────────────────────────
  pendingPinFrame: number | null
  pendingLatestFrame: number | null
  /** Deferred re-apply scheduled by `restorePosition`. */
  restoreFrame: number | null
  /** Streaming-end grace handle (see `setStreaming`). */
  streamingGraceFrame: number | null
  activeScrollAbort: AbortController | null

  // ── Pin / navigation intent ───────────────────────────────────
  /**
   * Monotonic ticket for pin operations. Every pinMessage / pinLatest call
   * takes a new ticket; a deferred rAF body whose ticket is stale aborts.
   * Makes interleaved pin calls last-call-wins instead of
   * rAF-scheduling-order-wins.
   */
  pinEpoch: number
  /**
   * The element a scheduled `pinMessage` is about to pin. `pinMessage`
   * defers its measurement one frame, but the *choice* of element is made
   * synchronously — `pinRelative` and `getPinnedElement` read this so
   * back-to-back calls within the same frame navigate from the newest
   * intent instead of the last *settled* pin.
   */
  pendingPinEl: HTMLElement | null
  /**
   * Target of an in-flight `scrollToMessage` animation. Read by reference
   * resolution so rapid navigation calls resolve against where the user is
   * HEADING, not the mid-animation scroll position. Gated on
   * `scrollInFlight` at read time.
   */
  navTargetEl: HTMLElement | null

  // ── initialPosition anchoring ─────────────────────────────────
  /**
   * True while `initialPosition: 'bottom'` is still anchoring the viewport
   * to the latest content: from mount until the first user input, the first
   * consumer scroll API call, or an upward scroll. While set, every content
   * resize re-lands at the bottom — hydration, web-font swap, late media.
   */
  initialAnchoring: boolean

  // ── Scroll-listener baselines (consumer-scroll vs clamp) ───────
  lastSeenScrollTop: number
  lastSeenScrollHeight: number

  // ── Saved consumer styles (restored on teardown) ──────────────
  savedContainerStyles: SavedContainerStyles | null
  savedContentStyles: SavedContentStyles | null

  // ── Gutter ownership ──────────────────────────────────────────
  /**
   * True when the controller created the gutter node itself (the vanilla
   * fallback) and therefore removes it on teardown. False when it adopted
   * a consumer-rendered node — teardown then restores
   * `savedGutterStyles` and leaves the node in place; removing a node
   * the framework's renderer created is not the controller's call.
   */
  gutterOwned: boolean
  /** Prior inline styles of an adopted gutter; null when owned/absent. */
  savedGutterStyles: SavedGutterStyles | null
}

/**
 * Build a fresh controller context with resolved options and seeded state.
 * The thin `createChatScroll` factory calls this, then wires the modules.
 */
export function createControllerContext(
  opts: ChatScrollOptions = {},
): ControllerContext {
  const options: ResolvedOptions = {
    strategy: opts.strategy ?? DEFAULTS.strategy,
    bottomThreshold: opts.bottomThreshold ?? DEFAULTS.bottomThreshold,
    scrollMargin: opts.scrollMargin ?? DEFAULTS.scrollMargin,
    bottomInset: opts.bottomInset ?? DEFAULTS.bottomInset,
    scrollBehavior: opts.scrollBehavior ?? DEFAULTS.scrollBehavior,
    scrollDurationMs: opts.scrollDurationMs ?? DEFAULTS.scrollDurationMs,
    initialPosition: opts.initialPosition ?? DEFAULTS.initialPosition,
    // No default — `undefined` means the clamp is off (backward compatible).
    pinClamp: opts.pinClamp,
    onScrollChange: opts.onScrollChange,
  }

  const internal: ChatScrollState = {
    atBottom: true,
    pinActive: false,
    pinAnchored: false,
    streaming: false,
    locked: options.strategy === 'stick-to-bottom',
    scrollInFlight: false,
    pinnedY: -1,
  }

  const ctx: StrategyContext = {
    container: null,
    content: null,
    gutter: null,
    pinnedEl: null,
    pinnedMargin: 0,
    state: internal,
    options: {
      bottomThreshold: options.bottomThreshold,
      scrollMargin: options.scrollMargin,
      bottomInset: options.bottomInset,
      pinClamp: options.pinClamp,
    },
    pinAnimationInterrupted: false,
    scrollDelta: 0,
    streamingGrace: false,
    // `reAnchorPin` is wired in `mount()` so it can close over the
    // controller's `startAnimatedScroll`. Strategies fall back to a
    // synchronous write when this is undefined.
  }

  return {
    ctx,
    internal,
    snapshot: Object.freeze({ ...internal }),
    options,
    strategy: STRATEGIES[options.strategy],
    listeners: new Set<Listener>(),
    resizeObserver: null,
    paddingObserver: null,
    scrollListener: null,
    userInputListeners: [],
    pendingPinFrame: null,
    pendingLatestFrame: null,
    restoreFrame: null,
    streamingGraceFrame: null,
    activeScrollAbort: null,
    pinEpoch: 0,
    pendingPinEl: null,
    navTargetEl: null,
    initialAnchoring: false,
    lastSeenScrollTop: 0,
    lastSeenScrollHeight: 0,
    savedContainerStyles: null,
    savedContentStyles: null,
    gutterOwned: false,
    savedGutterStyles: null,
  }
}
