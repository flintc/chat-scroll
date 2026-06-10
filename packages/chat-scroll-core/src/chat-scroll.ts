import { createGutter, destroyGutter, setGutterHeight } from './gutter'
import { isAtBottom, offsetWithin } from './scroll-utils'
import { animateScrollTo, shouldReduceMotion } from './smooth-scroll'
import { pinToTopStrategy, recalcGutter } from './strategies/pin-to-top'
import { stickToBottomStrategy } from './strategies/stick-to-bottom'
import type { Strategy, StrategyContext } from './strategies/types'
import type {
  ChatScrollInstance,
  ChatScrollOptions,
  ChatScrollState,
  ScrollPosition,
} from './types'

const DEFAULTS = {
  strategy: 'stick-to-bottom' as const,
  bottomThreshold: 40,
  scrollMargin: 12,
  scrollBehavior: 'auto' as const,
  scrollDurationMs: 320,
  initialPosition: 'none' as const,
}

const STRATEGIES: Record<NonNullable<ChatScrollOptions['strategy']>, Strategy> =
  {
    'pin-to-top': pinToTopStrategy,
    'stick-to-bottom': stickToBottomStrategy,
  }

/**
 * Create a `ChatScroll` instance — the framework-agnostic core.
 *
 * Adapters wrap this with their reactivity primitives. Consumers can
 * also use it directly without a framework:
 *
 *     const scroll = createChatScroll({ strategy: 'pin-to-top' })
 *     scroll.mount(containerEl, contentEl)
 *     scroll.pinMessage(userMessageEl)
 *     // ...later
 *     scroll.destroy()
 */
export function createChatScroll(
  opts: ChatScrollOptions = {},
): ChatScrollInstance {
  // ── Resolved options ────────────────────────────────────────────
  let options: Required<Omit<ChatScrollOptions, 'onScrollChange'>> & {
    onScrollChange?: ChatScrollOptions['onScrollChange']
  } = {
    strategy: opts.strategy ?? DEFAULTS.strategy,
    bottomThreshold: opts.bottomThreshold ?? DEFAULTS.bottomThreshold,
    scrollMargin: opts.scrollMargin ?? DEFAULTS.scrollMargin,
    scrollBehavior: opts.scrollBehavior ?? DEFAULTS.scrollBehavior,
    scrollDurationMs: opts.scrollDurationMs ?? DEFAULTS.scrollDurationMs,
    initialPosition: opts.initialPosition ?? DEFAULTS.initialPosition,
    onScrollChange: opts.onScrollChange,
  }

  // ── State ───────────────────────────────────────────────────────
  // `internal` is the mutable working state used by strategies.
  // `snapshot` is a frozen, identity-stable view exposed to consumers —
  // useSyncExternalStore depends on this stability.
  const internal: ChatScrollState = {
    atBottom: true,
    pinActive: false,
    pinAnchored: false,
    streaming: false,
    locked: options.strategy === 'stick-to-bottom',
    scrollInFlight: false,
    pinnedY: -1,
  }
  let snapshot: Readonly<ChatScrollState> = Object.freeze({ ...internal })

  // ── Strategy context ────────────────────────────────────────────
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
    },
    pinAnimationInterrupted: false,
    scrollDelta: 0,
    streamingGrace: false,
    // `reAnchorPin` is wired in `mount()` so it can close over the
    // controller's `startAnimatedScroll`. Strategies fall back to a
    // synchronous write when this is undefined.
  }

  // ── Subscribers ─────────────────────────────────────────────────
  const listeners = new Set<(s: ChatScrollState) => void>()

  function commit(): void {
    if (statesEqual(snapshot, internal)) return
    snapshot = Object.freeze({ ...internal })
    options.onScrollChange?.(snapshot)
    listeners.forEach((l) => l(snapshot))
  }

  // ── Active strategy ─────────────────────────────────────────────
  let strategy: Strategy = STRATEGIES[options.strategy]

  // ── DOM bindings ────────────────────────────────────────────────
  let resizeObserver: ResizeObserver | null = null
  let scrollListener: (() => void) | null = null
  let userInputListeners: Array<{ type: string; fn: () => void }> = []
  let pendingPinFrame: number | null = null
  let pendingLatestFrame: number | null = null
  let activeScrollAbort: AbortController | null = null
  // The element a scheduled `pinMessage` is about to pin. `pinMessage`
  // defers its measurement one frame, but the *choice* of element is
  // made synchronously — `pinRelative` and `getPinnedElement` read this
  // so back-to-back calls within the same frame navigate from the
  // newest intent instead of the last *settled* pin (two rapid "prev"
  // clicks must move two turns, not one).
  let pendingPinEl: HTMLElement | null = null
  // Target of an in-flight `scrollToMessage` animation. Read by the
  // reference resolution (`referenceMessage` / `relativeMessage` /
  // `pinRelative`) so rapid navigation calls resolve against where the
  // user is HEADING, not the mid-animation scroll position. Gated on
  // `scrollInFlight` at read time — once the animation completes or
  // aborts, the geometric reference takes over (and at completion the
  // two agree).
  let navTargetEl: HTMLElement | null = null
  // True while `initialPosition: 'bottom'` is still anchoring the
  // viewport to the latest content: from mount until the first user
  // input, the first consumer scroll API call, or an upward scroll
  // (scrollbar drags emit no input events). While set, every content
  // resize re-lands at the bottom — hydration, web-font swap, and
  // late-loading media all grow content after the first paint.
  let initialAnchoring = false
  // Deferred re-apply scheduled by `restorePosition` (the destination
  // thread may not have finished laying out when it's called).
  let restoreFrame: number | null = null
  // Streaming-end grace (see `setStreaming`).
  let streamingGraceFrame: number | null = null

  function cancelStreamingGrace(): void {
    if (streamingGraceFrame !== null) {
      cancelAnimationFrame(streamingGraceFrame)
      streamingGraceFrame = null
    }
    ctx.streamingGrace = false
  }
  // Monotonic ticket for pin operations. Every pinMessage / pinLatest
  // call takes a new ticket; a deferred rAF body whose ticket is stale
  // aborts. This makes interleaved pin calls last-call-wins instead of
  // rAF-scheduling-order-wins (pinLatest scheduled before a pinRelative
  // would otherwise clobber the navigation when its frame fires).
  let pinEpoch = 0
  // Last scrollTop / scrollHeight values seen by the scroll listener.
  // Used to detect a consumer's synchronous
  // `container.scrollTo({top: X})`, which produces a single large delta
  // across one scroll event, but does NOT change scrollHeight. A
  // layout-driven clamp (content above the pin shrinking) also
  // produces a scroll-event delta — sometimes a larger one than you'd
  // expect on WebKit / mobile-safari — but the scrollHeight changes
  // in lockstep with the clamp. By gating the detection on "scrollTop
  // crossed the threshold AND scrollHeight didn't change," we
  // distinguish consumer scrolls from clamps without conflating.
  let lastSeenScrollTop = 0
  let lastSeenScrollHeight = 0
  // Threshold for the "consumer scrolled the container away from the
  // pin" detection in the scroll listener. The pin lives
  // at `scrollTop = pinnedY`; if `scrollTop < pinnedY - threshold` and
  // the controller didn't initiate that move (no animation in flight,
  // no scroll-driving input), it must have come from a consumer
  // `container.scrollTo()` / `scrollBy()` / `scrollIntoView()`. The
  // threshold accommodates browser sub-pixel rounding and harmless
  // micro-scrolls from focus changes.
  const PIN_AWAY_THRESHOLD = 40
  let savedContainerStyles: {
    overflowY: string
    display: string
    flexDirection: string
    overflowAnchor: string
  } | null = null
  let savedContentStyles: { flexShrink: string } | null = null

  function applyContainerStyles(container: HTMLElement): void {
    savedContainerStyles = {
      overflowY: container.style.overflowY,
      display: container.style.display,
      flexDirection: container.style.flexDirection,
      overflowAnchor: container.style.overflowAnchor,
    }
    container.style.overflowY = 'auto'
    container.style.display = 'flex'
    container.style.flexDirection = 'column'
  }

  function applyContentStyles(content: HTMLElement): void {
    savedContentStyles = { flexShrink: content.style.flexShrink }
    // The container is a column flexbox (so the gutter sits below the
    // content), which makes the content element a flex item with
    // default `flex-shrink: 1`. A normal message list survives that
    // only because its `min-height: auto` floor is its own text. A
    // content element whose children are absolutely positioned — a
    // virtualizer's total-size wrapper is the canonical case — has
    // min-content height 0 and would be silently crushed to the
    // viewport height, destroying the scroll range.
    content.style.flexShrink = '0'
  }

  function restoreContainerStyles(container: HTMLElement): void {
    if (!savedContainerStyles) return
    container.style.overflowY = savedContainerStyles.overflowY
    container.style.display = savedContainerStyles.display
    container.style.flexDirection = savedContainerStyles.flexDirection
    container.style.overflowAnchor = savedContainerStyles.overflowAnchor
    savedContainerStyles = null
  }

  function restoreContentStyles(content: HTMLElement): void {
    if (!savedContentStyles) return
    content.style.flexShrink = savedContentStyles.flexShrink
    savedContentStyles = null
  }

  function teardownDom(): void {
    if (activeScrollAbort) {
      activeScrollAbort.abort()
      activeScrollAbort = null
    }
    if (pendingPinFrame !== null) {
      cancelAnimationFrame(pendingPinFrame)
      pendingPinFrame = null
    }
    if (pendingLatestFrame !== null) {
      cancelAnimationFrame(pendingLatestFrame)
      pendingLatestFrame = null
    }
    pendingPinEl = null
    lastSeenScrollTop = 0
    lastSeenScrollHeight = 0
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
    if (scrollListener && ctx.container) {
      ctx.container.removeEventListener('scroll', scrollListener)
      scrollListener = null
    }
    if (ctx.container) {
      userInputListeners.forEach(({ type, fn }) =>
        ctx.container?.removeEventListener(type, fn),
      )
    }
    userInputListeners = []
    if (ctx.gutter) {
      destroyGutter(ctx.gutter)
      ctx.gutter = null
    }
    if (ctx.container) {
      restoreContainerStyles(ctx.container)
    }
    if (ctx.content) {
      restoreContentStyles(ctx.content)
    }
    cancelStreamingGrace()
    if (restoreFrame !== null) {
      cancelAnimationFrame(restoreFrame)
      restoreFrame = null
    }
    navTargetEl = null
    initialAnchoring = false
  }

  // Cancel any in-flight rAF animation when the user touches or wheels
  // the container. UX standard: never fight user input.
  //
  // ALSO: a real *scroll-driving* user input is the most reliable
  // signal that the user is intentionally moving the viewport, so we
  // use it to clear `ctx.pinAnchored`. Without that, every user
  // scroll-away would still look like "at the pin" to the resize-time
  // math and we'd snap them back. Plain scroll events aren't enough
  // — programmatic scrolls and browser-driven clamps also fire
  // scroll events, so we can't distinguish them at scroll time.
  //
  // We split the input set deliberately:
  //   - `abort-only` events: pointerdown/touchstart. These could be a
  //     tap on an in-page button (e.g. expanding a `<details>` block),
  //     not a scroll. Aborting an in-flight scroll animation is still
  //     correct here — the user is engaged with the page — but
  //     clearing `pinAnchored` would drop the pin on a non-scroll tap
  //     and a subsequent expand would visibly drift the pin by the
  //     block's height. When the abort interrupts an in-flight pin
  //     animation, we also flag `pinAnimationInterrupted` so the next
  //     resize knows to *animate* the catch-up to the pin rather than
  //     teleport.
  //   - `scroll-driving` events: wheel, touchmove, and a curated set
  //     of keydown keys (arrows, PageUp/Down, Home/End, Space). We
  //     clear `pinAnchored` synchronously UNLESS the event's target
  //     sits inside a descendant scrollable that can absorb the
  //     event's delta. The descendant-scrollable check handles the
  //     case where a horizontal pan on a wide code block (or any
  //     other inner-scrolling content) bubbles to the chat's wheel
  //     listener but the chat itself doesn't move.
  //
  // Without the pointerdown-mid-animation guard and the nested-scroll
  // guard below, tapping a tool-call summary in a prior bot reply
  // drifts the pin by the block's height, because pointerdown clears
  // `pinAnchored` and a subsequent expand shifts the anchor.
  function attachUserInputCancellers(container: HTMLElement): void {
    const abortAnim = (): boolean => {
      const wasInFlight = internal.scrollInFlight
      activeScrollAbort?.abort()
      internal.scrollInFlight = false
      // Any user input ends the initial-position anchoring — the user
      // has taken over the viewport.
      initialAnchoring = false
      return wasInFlight
    }
    // If an abort cut a pin animation short while the pin is being
    // preserved, the resize that follows must animate the catch-up
    // rather than teleport. The flag is consumed by the strategy on the
    // next `recalcGutter`. Every "preserve the pin" path below that
    // aborted an in-flight animation goes through this.
    const flagInterruptedPinAnimation = (wasInFlight: boolean): void => {
      if (wasInFlight && internal.pinAnchored) {
        ctx.pinAnimationInterrupted = true
      }
    }
    const abortOnly = (): void => {
      flagInterruptedPinAnimation(abortAnim())
      commit()
    }

    // Walk from `target` up to (but not including) `container` looking
    // for a scrollable ancestor that can absorb the given delta. Used
    // by the wheel/touchmove handlers to recognize when
    // an input event belongs to a nested scrollable inside the chat —
    // a horizontally-pannable code block, an inner panel — so we don't
    // falsely clear `pinAnchored` for an event that never moved the
    // chat's own scrollTop.
    const findDescendantScrollable = (
      target: EventTarget | null,
      deltaX: number,
      deltaY: number,
    ): HTMLElement | null => {
      const view = container.ownerDocument.defaultView
      if (!view) return null
      let el = target instanceof HTMLElement ? target : null
      while (el && el !== container) {
        const cs = view.getComputedStyle(el)
        const ox = cs.overflowX
        const oy = cs.overflowY
        if (
          Math.abs(deltaX) > 0 &&
          (ox === 'auto' || ox === 'scroll') &&
          el.scrollWidth > el.clientWidth
        ) {
          return el
        }
        if (
          Math.abs(deltaY) > 0 &&
          (oy === 'auto' || oy === 'scroll') &&
          el.scrollHeight > el.clientHeight
        ) {
          return el
        }
        el = el.parentElement
      }
      return null
    }

    const clearPinAnchored = (): void => {
      internal.pinAnchored = false
      ctx.pinAnimationInterrupted = false
    }

    // Release the stick-to-bottom lock from the INPUT event, not from
    // the resulting scroll position. While streaming, the strategy
    // re-snaps `scrollTop` to the bottom on every content tick — which
    // cancels the browser's in-progress wheel/touch scroll before it
    // can produce a scroll event that observably leaves the bottom.
    // A position-based release alone therefore loses that race and the
    // chat "swallows" upward scrolls mid-stream: the user wheels up,
    // the next chunk snaps them straight back. Same principle the pin
    // strategy documents: trust input events, not scroll events.
    // The position-based release in the strategy's `onScroll` remains
    // as a backup for inputs that produce no wheel/touch/key events
    // at all (scrollbar drags).
    const releaseStickLock = (): void => {
      if (options.strategy !== 'stick-to-bottom') return
      if (!internal.locked) return
      // An upward scroll needs somewhere to go. Before the content
      // overflows (scrollTop pinned at 0), a wheel-up is a no-op and
      // must not silently kill the lock.
      if (container.scrollTop <= 0) return
      internal.locked = false
    }

    const onWheel = (ev: Event): void => {
      const wasInFlight = abortAnim()
      const we = ev as WheelEvent
      const dx = typeof we.deltaX === 'number' ? we.deltaX : 0
      const dy = typeof we.deltaY === 'number' ? we.deltaY : 0
      // Horizontal-only wheel can never move the chat vertically.
      // Still check for a descendant scrollable that can absorb the
      // horizontal delta — that path through findDescendantScrollable
      // does it without a separate special case.
      if (findDescendantScrollable(ev.target, dx, dy)) {
        flagInterruptedPinAnimation(wasInFlight)
        commit()
        return
      }
      // No descendant absorbed the event, but if there's also no
      // vertical delta, the chat itself won't move — treat as a non-
      // scroll-driving event so the pin stays.
      if (dy === 0) {
        flagInterruptedPinAnimation(wasInFlight)
        commit()
        return
      }
      if (dy < 0) releaseStickLock()
      clearPinAnchored()
      commit()
    }
    // Last touch Y, tracked across touchstart/touchmove so the
    // touchmove handler can tell pan direction (finger moving DOWN the
    // screen scrolls the content UP, away from the bottom).
    let lastTouchY: number | null = null
    const touchY = (ev: Event): number | null => {
      const t = (ev as TouchEvent).touches?.[0]
      return typeof t?.clientY === 'number' ? t.clientY : null
    }
    const onTouchstart = (ev: Event): void => {
      lastTouchY = touchY(ev)
      flagInterruptedPinAnimation(abortAnim())
      commit()
    }
    const onTouchmove = (ev: Event): void => {
      const wasInFlight = abortAnim()
      // Touchmove doesn't carry per-event delta in a friendly form
      // (it's tracked across `touchstart` + cumulative positions). Use
      // a conservative descendant check: if the target is *inside* any
      // scrollable element, assume the inner scroll is consuming the
      // gesture. Pass `Infinity` for both axes so any
      // scrollable ancestor matches regardless of orientation.
      if (findDescendantScrollable(ev.target, Infinity, Infinity)) {
        flagInterruptedPinAnimation(wasInFlight)
        commit()
        return
      }
      const y = touchY(ev)
      // Finger moving down (y increasing) pans the content up — the
      // user is scrolling toward older messages. Unknown direction
      // (no touch points exposed) is treated as upward so the user's
      // gesture always wins over the lock.
      if (y === null || lastTouchY === null || y > lastTouchY) {
        releaseStickLock()
      }
      if (y !== null) lastTouchY = y
      clearPinAnchored()
      commit()
    }
    // Keyboard/mouse parity for in-chat interactions. A "scroll key"
    // is only scroll intent when the browser will actually scroll the
    // chat with it:
    //  - inside an editable (input/textarea/select/contenteditable),
    //    arrows and Home/End move the caret and Space types — none of
    //    them scroll the chat;
    //  - Space on an activatable element (button, <summary>, link)
    //    ACTIVATES it. A mouse click on the same element preserves the
    //    pin via the pointerdown path; Tab+Space must get the same
    //    treatment, or keyboard users see the pin drift on every
    //    tool-block toggle.
    const isEditableTarget = (t: EventTarget | null): boolean =>
      t instanceof HTMLElement &&
      t.closest(
        'input, textarea, select, [contenteditable="true"], [contenteditable=""]',
      ) !== null
    const isActivatableTarget = (t: EventTarget | null): boolean =>
      t instanceof HTMLElement &&
      t.closest('button, summary, a[href], [role="button"]') !== null

    const onKeydown = (ev: Event): void => {
      const wasInFlight = abortAnim()
      const e = ev as KeyboardEvent
      const isScrollKey =
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'PageUp' ||
        e.key === 'PageDown' ||
        e.key === 'Home' ||
        e.key === 'End' ||
        e.key === ' '
      if (!isScrollKey) {
        // Tab / Enter / letter keys: same semantics as pointerdown —
        // an interaction event, not a scroll event. Preserve the pin
        // and flag mid-animation interruption for an animated catch-up.
        flagInterruptedPinAnimation(wasInFlight)
        commit()
        return
      }
      // The focused element consumes the key (see above): interaction,
      // not scroll intent.
      if (
        isEditableTarget(ev.target) ||
        (e.key === ' ' && isActivatableTarget(ev.target))
      ) {
        flagInterruptedPinAnimation(wasInFlight)
        commit()
        return
      }
      // Scroll-driving key. If focus is in a descendant scrollable
      // (e.g. an inner panel), the key targets that scrollable, not
      // the chat — preserve the pin.
      if (findDescendantScrollable(ev.target, Infinity, Infinity)) {
        flagInterruptedPinAnimation(wasInFlight)
        commit()
        return
      }
      const scrollsUp =
        e.key === 'ArrowUp' ||
        e.key === 'PageUp' ||
        e.key === 'Home' ||
        (e.key === ' ' && e.shiftKey)
      if (scrollsUp) releaseStickLock()
      clearPinAnchored()
      commit()
    }

    const bind = (
      type: string,
      fn: (ev: Event) => void,
    ): void => {
      container.addEventListener(type, fn, { passive: true })
      userInputListeners.push({ type, fn: fn as () => void })
    }
    bind('wheel', onWheel)
    bind('touchmove', onTouchmove)
    bind('touchstart', onTouchstart)
    bind('pointerdown', abortOnly)
    bind('keydown', onKeydown)
  }

  function startAnimatedScroll(
    target: number | (() => number),
    onComplete?: () => void,
  ): void {
    if (!ctx.container) return
    activeScrollAbort?.abort()
    activeScrollAbort = new AbortController()
    const signal = activeScrollAbort.signal
    const reducedMotion = shouldReduceMotion(options.scrollBehavior)
    // Only mark scrollInFlight when an actual rAF loop will run. In
    // reduced-motion (or `'instant'`) mode, animateScrollTo writes
    // scrollTop synchronously and returns a resolved promise — no
    // interpolation to protect, and the flag would otherwise stay set
    // until microtasks drain, blocking the next sync recalcGutter.
    // Prologue: just mark the flag — the caller (pinMessage rAF /
    // scrollToBottom) commits at the end of its own work. Emitting
    // here would double-commit and, because subscribers may force a
    // layout in their render path, can introduce micro-jitter in the
    // smooth-scroll animation that fires the same frame.
    if (!reducedMotion) internal.scrollInFlight = true
    void animateScrollTo(ctx.container, target, {
      reducedMotion,
      duration: options.scrollDurationMs,
      signal,
    }).finally(() => {
      // Epilogue runs asynchronously after the animation settles or
      // aborts. No external committer is going to fire then, so we
      // must emit so subscribers see `scrollInFlight: false`.
      if (activeScrollAbort?.signal === signal) {
        internal.scrollInFlight = false
        // `onComplete` only fires when the animation ran to its end —
        // an abort (user wheel/touch, superseding scroll) means the
        // user took over and the caller's intent no longer stands.
        if (!signal.aborted) onComplete?.()
        commit()
      }
    })
  }

  // `atBottom` means "the end of the CONTENT is within reach" — the
  // gutter is controller-owned slack below the content and doesn't
  // count. Measuring against raw scrollHeight would make `atBottom`
  // flap during an in-flight pin animation: the no-shrink floor keeps
  // the gutter slack while streamed chunks land, so the scrollHeight
  // distance oscillates around the threshold even though the user
  // never loses sight of the content's end.
  function measureAtBottom(container: HTMLElement): boolean {
    const slack = ctx.gutter ? parseFloat(ctx.gutter.style.height) || 0 : 0
    return isAtBottom(container, options.bottomThreshold, slack)
  }

  // ── Public API ──────────────────────────────────────────────────
  function mount(container: HTMLElement, content: HTMLElement): void {
    if (ctx.container === container && ctx.content === content) return
    if (ctx.container) teardownDom()

    ctx.container = container
    ctx.content = content

    applyContainerStyles(container)
    applyContentStyles(content)
    ctx.gutter = createGutter(container)
    // Strategies call this to request a smooth catch-up to the pin
    // instead of a synchronous `scrollTop = pinnedY` jump. Used after
    // the pointerdown-abort case where the user is far from
    // the pin and a teleport would be visible. Pass a GETTER so the
    // catch-up tracks `pinnedY` across mid-flight content changes —
    // when the abort coincides with a block CSS expand animation, the
    // block keeps growing through the catch-up window and `pinnedY`
    // shifts each ResizeObserver tick. Without the getter the catch-
    // up lands at the initial value and the pin ends up visibly low.
    ctx.reAnchorPin = (_target: number): void => {
      // Same completion recalc as pinMessage: the gutter is floored
      // while the catch-up runs; tighten on arrival.
      startAnimatedScroll(
        () => internal.pinnedY,
        () => recalcGutter(ctx),
      )
    }

    scrollListener = () => {
      if (!ctx.container) return
      const now = ctx.container.scrollTop
      const sh = ctx.container.scrollHeight
      internal.atBottom = measureAtBottom(ctx.container)
      // Detect "consumer scrolled the container away from the pin" — a
      // host-app call to `container.scrollTo()` / `scrollBy()` /
      // `scrollIntoView()` that didn't go through the controller. The
      // user-input cancellers clear `pinAnchored` for
      // wheel/touchmove/keys; `scrollToBottom()` clears it for the
      // FAB; pointerdown sets `pinAnimationInterrupted` for the
      // tap-mid-pin-animation case. A consumer's *own* programmatic
      // scroll routes through none of those, so without this check
      // the next resize yanks the user back to the pin.
      //
      // The distinguishing feature of a consumer scroll is the
      // DELTA WITHOUT a corresponding scrollHeight change. Animation
      // steps move scrollTop incrementally per frame. Layout-driven
      // clamps after a shrink produce a delta TOGETHER with a
      // scrollHeight drop (which on WebKit / mobile-safari can be
      // significantly larger than the simple frame-rate-paced
      // mathematical maximum suggests). A consumer's
      // `scrollTo({top: 0})` produces a single big delta with
      // scrollHeight unchanged — that's the signal we use.
      //
      // We require: (a) was near the pin in the previous frame, (b)
      // is now far from the pin this frame, AND (c) scrollHeight is
      // unchanged. (c) is the load-bearing piece for WebKit, whose
      // collapse-driven clamps land 40+ px below the previous
      // scrollTop in a single frame even when the per-frame layout
      // delta is much smaller.
      //
      // The check is symmetric: a consumer can scroll away in EITHER
      // direction (scrollTo(0) toward the top, or scrollIntoView of a
      // message below the pin). Clamps only ever *decrease* scrollTop
      // and always change scrollHeight in the same frame, so (c)
      // protects both directions equally.
      if (
        options.strategy === 'pin-to-top' &&
        internal.pinAnchored &&
        !internal.scrollInFlight &&
        !ctx.pinAnimationInterrupted &&
        internal.pinnedY >= 0 &&
        Math.abs(lastSeenScrollTop - internal.pinnedY) < PIN_AWAY_THRESHOLD &&
        Math.abs(now - internal.pinnedY) >= PIN_AWAY_THRESHOLD &&
        sh === lastSeenScrollHeight
      ) {
        internal.pinAnchored = false
      }
      ctx.scrollDelta = now - lastSeenScrollTop
      // Scrollbar drags emit no wheel/touch/key events; an upward
      // move is still the user taking over from the initial anchoring.
      // Gated on scrollHeight being unchanged, like the consumer-
      // scroll detector above: layout-driven clamps (a virtualizer
      // re-measuring rows, content shrinking) produce a negative
      // delta TOGETHER with a scrollHeight change in the same frame,
      // and those must not end the anchoring.
      if (
        initialAnchoring &&
        ctx.scrollDelta < 0 &&
        sh === lastSeenScrollHeight
      ) {
        initialAnchoring = false
      }
      lastSeenScrollTop = now
      lastSeenScrollHeight = sh
      strategy.onScroll(ctx)
      commit()
    }
    container.addEventListener('scroll', scrollListener, { passive: true })
    attachUserInputCancellers(container)

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        strategy.onContentResize(ctx)
        if (initialAnchoring && ctx.container) {
          // `initialPosition: 'bottom'`: keep landing at the latest
          // content while layout settles (hydration, web-font swap,
          // late media) — until the first real interaction.
          ctx.container.scrollTop = ctx.container.scrollHeight
        }
        if (ctx.container) {
          internal.atBottom = measureAtBottom(ctx.container)
        }
        commit()
      })
      // Observe BOTH content and container, and ask for the BORDER box.
      // - Content border-box catches consumer padding changes on the
      //   content element: those grow scrollHeight but leave the
      //   content-box (the default) the same, so a content-box observer
      //   wouldn't fire and the gutter would go stale.
      // - Container border-box catches viewport resizes AND container
      //   padding mutations (clientHeight changes either way), which
      //   the gutter formula reads directly. Without this the pin drifts
      //   on window resize / device-orientation change.
      resizeObserver.observe(content, { box: 'border-box' })
      resizeObserver.observe(container, { box: 'border-box' })
    }

    initialAnchoring = options.initialPosition === 'bottom'
    if (initialAnchoring) {
      container.scrollTop = container.scrollHeight
    }
    // Seed the scroll listener's delta baseline at the mount position
    // (possibly the bottom, just above). Without this, the first scroll
    // event computes its delta against 0 and an upward scrollbar drag
    // from the bottom reads as a large POSITIVE delta — masking the
    // user's take-over from the delta-gated checks.
    lastSeenScrollTop = container.scrollTop
    lastSeenScrollHeight = container.scrollHeight
    internal.atBottom = measureAtBottom(container)
    internal.locked = options.strategy === 'stick-to-bottom'
    if (internal.streaming) container.style.overflowAnchor = 'none'
    commit()
  }

  function setOptions(next: Partial<ChatScrollOptions>): void {
    const prevStrategy = options.strategy
    // Ignore keys whose value is `undefined` — adapters sync options by
    // passing every key on every render, with `undefined` for options
    // the consumer never set. Spreading those verbatim would clobber
    // resolved defaults (`bottomThreshold: undefined` breaks at-bottom
    // detection; `scrollMargin: undefined` makes `pinnedY` NaN).
    const defined = Object.fromEntries(
      Object.entries(next).filter(([, v]) => v !== undefined),
    ) as Partial<ChatScrollOptions>
    options = {
      ...options,
      ...defined,
    }
    ctx.options.bottomThreshold = options.bottomThreshold
    ctx.options.scrollMargin = options.scrollMargin

    if (next.strategy && next.strategy !== prevStrategy) {
      strategy.reset(ctx)
      strategy = STRATEGIES[options.strategy]
      internal.locked = options.strategy === 'stick-to-bottom'
      internal.pinActive = false
      commit()
    }
  }

  function pinMessage(el: HTMLElement): void {
    if (options.strategy !== 'pin-to-top') return
    if (!ctx.container) return
    const container = ctx.container

    // Record the intent synchronously (see `pendingPinEl` / `pinEpoch`);
    // only the layout measurement waits for the next frame.
    pendingPinEl = el
    const epoch = ++pinEpoch
    if (pendingPinFrame !== null) cancelAnimationFrame(pendingPinFrame)
    pendingPinFrame = requestAnimationFrame(() => {
      pendingPinFrame = null
      if (epoch !== pinEpoch) return
      if (pendingPinEl === el) pendingPinEl = null
      navTargetEl = null
      initialAnchoring = false
      el.style.scrollMarginTop = `${options.scrollMargin}px`
      const offset = offsetWithin(el, container)
      internal.pinnedY = Math.max(0, offset - options.scrollMargin)
      ctx.pinnedEl = el
      ctx.pinnedMargin = options.scrollMargin
      internal.pinAnchored = true
      internal.pinActive = true
      // Seed the consumer-scroll detector's baseline at pinnedY so
      // the first scroll event after pin lands compares against a
      // sensible value (not 0, which would always look like a big
      // jump on the very first frame). See `lastSeenScrollTop`.
      lastSeenScrollTop = internal.pinnedY
      lastSeenScrollHeight = container.scrollHeight
      // Starting a new pin clears any pending "the previous animation
      // was interrupted" state — that flag refers to whatever pin was
      // in flight when the user tapped, and we're now starting fresh.
      ctx.pinAnimationInterrupted = false
      // Mark scroll-in-flight BEFORE recalcGutter so its re-anchor
      // branch doesn't clobber the about-to-start smooth-scroll
      // animation. `startAnimatedScroll` below would set this anyway,
      // but only after recalcGutter has already written scrollTop
      // synchronously. `startAnimatedScroll` does the right thing in
      // reduced-motion mode and clears it again then.
      if (!shouldReduceMotion(options.scrollBehavior)) {
        internal.scrollInFlight = true
      }
      recalcGutter(ctx)
      // Drive an rAF-owned scroll animation, not native
      // `container.scrollTo({behavior: 'smooth'})`: iOS Safari samples
      // the *stale* scrollHeight when `recalcGutter` writes a same-frame
      // style change, and the smooth animation finalises at the
      // pre-resize max-scroll. `animateScrollTo` re-clamps target
      // against live scrollHeight every frame, so the animation
      // continues toward the now-reachable target after the gutter
      // resize commits. See the
      // "Safari gutter race" test in smooth-scroll.test.ts.
      //
      // Target is passed as a GETTER so the animation tracks live
      // `pinnedY` — if content above the pin grows or shrinks during
      // the animation, `refreshPinnedY` updates the state and the
      // animation re-reads the target each frame. Without this the
      // animation lands at the captured value.
      //
      // On completion, recalc once more: while the animation was in
      // flight the gutter was held at a no-shrink floor (see
      // `recalcGutter`) so a shrinking `scrollHeight` couldn't clamp
      // `scrollTop` mid-animation. Now that we've arrived, tighten it
      // back to the tight-pin contract.
      startAnimatedScroll(
        () => internal.pinnedY,
        () => recalcGutter(ctx),
      )
      commit()
    })
  }

  function pinLatest(selector: string): void {
    if (options.strategy !== 'pin-to-top') return
    if (!ctx.container) return
    const container = ctx.container
    const epoch = ++pinEpoch
    if (pendingLatestFrame !== null) cancelAnimationFrame(pendingLatestFrame)
    pendingLatestFrame = requestAnimationFrame(() => {
      pendingLatestFrame = null
      // A newer pin call (pinMessage / pinRelative / pinLatest) arrived
      // while this frame was pending — the newer intent wins.
      if (epoch !== pinEpoch) return
      const matches = container.querySelectorAll<HTMLElement>(selector)
      const target = matches[matches.length - 1]
      if (target) pinMessage(target)
    })
  }

  // Shared reference resolution for pinRelative / relativeMessage /
  // referenceMessage. Resolves synchronously — navigation targets
  // already-rendered messages, so there's no layout to wait for, and
  // deferring would make rapid calls race the rAF (two quick "prev"
  // clicks would both resolve against the same settled position and
  // move one step).
  //
  // The reference adapts to where the user actually is:
  // - INTENT-anchored, strongest first: a pin scheduled this frame
  //   (`pendingPinEl`), the settled pin while the user is still at it,
  //   and the target of an in-flight `scrollToMessage`. All three make
  //   rapid successive calls resolve against where the user is
  //   HEADING, not the mid-animation scroll position.
  // - Otherwise GEOMETRIC: the last match whose margin-adjusted top
  //   sits at or above the viewport top — the turn being read. This
  //   also makes navigation usable before any pin or scroll exists.
  function resolveReference(selector: string): {
    matches: HTMLElement[]
    index: number
    past: boolean
    anchored: boolean
  } | null {
    if (!ctx.container) return null
    const container = ctx.container
    const matches = Array.from(
      container.querySelectorAll<HTMLElement>(selector),
    )
    if (matches.length === 0) return null

    const anchoredEl =
      pendingPinEl ??
      (internal.pinAnchored ? ctx.pinnedEl : null) ??
      (internal.scrollInFlight ? navTargetEl : null)
    if (anchoredEl) {
      const idx = matches.indexOf(anchoredEl)
      if (idx !== -1) {
        return { matches, index: idx, past: false, anchored: true }
      }
      // Anchored element not in the matched set (detached, or a
      // different selector) — fall through to the geometric reference.
    }

    const FUDGE = 2 // sub-pixel scroll positions + rounding
    const st = container.scrollTop
    let index = -1
    let refTop = 0
    for (let i = 0; i < matches.length; i++) {
      const el = matches[i]
      if (!el) continue
      const top = offsetWithin(el, container) - options.scrollMargin
      if (top <= st + FUDGE) {
        index = i
        refTop = top
      }
    }
    return {
      matches,
      index,
      // The viewport top sits measurably below the reference's top —
      // the user has scrolled into the content that follows it
      // ("mid-reply" in a chat).
      past: index >= 0 && st > refTop + FUDGE,
      anchored: false,
    }
  }

  function referenceMessage(selector: string): {
    el: HTMLElement | null
    index: number
    count: number
    past: boolean
  } {
    const ref = resolveReference(selector)
    if (!ref) return { el: null, index: -1, count: 0, past: false }
    return {
      el: ref.index >= 0 ? (ref.matches[ref.index] ?? null) : null,
      index: ref.index,
      count: ref.matches.length,
      past: ref.past,
    }
  }

  function relativeMessage(
    selector: string,
    direction: -1 | 1,
  ): HTMLElement | null {
    const ref = resolveReference(selector)
    if (!ref) return null
    let targetIdx: number
    if (direction === 1) {
      // The next match below the reference. With every match above the
      // viewport (index === -1) this resolves to the first.
      targetIdx = ref.index + 1
    } else {
      // Geometric mode, reading past the reference's top: "previous"
      // first returns the reference itself (snap back to the turn
      // being read), then walks upward on the next call. Mirrors
      // editor go-to-previous-change. Anchored mode is already AT the
      // reference, so it always walks.
      targetIdx = !ref.anchored && ref.past ? ref.index : ref.index - 1
    }
    return targetIdx >= 0 ? (ref.matches[targetIdx] ?? null) : null
  }

  function pinRelative(selector: string, direction: -1 | 1): boolean {
    if (options.strategy !== 'pin-to-top') return false
    const target = relativeMessage(selector, direction)
    if (!target) return false
    pinMessage(target)
    return true
  }

  function scrollToMessage(el: HTMLElement): void {
    if (!ctx.container) return
    const container = ctx.container
    // Navigating to a message is explicit scroll intent. Release the
    // stick follow — a mid-stream snap would cancel the animation, and
    // the input-driven lock release only covers USER input, not
    // programmatic scrolls. Likewise drop the pin anchor so the next
    // resize doesn't yank the viewport back. Arriving at the bottom
    // does NOT re-engage the lock (reading the latest content and
    // following future content are different intents — use
    // `scrollToBottom()` to follow).
    internal.locked = false
    internal.pinAnchored = false
    ctx.pinAnimationInterrupted = false
    initialAnchoring = false
    el.style.scrollMarginTop = `${options.scrollMargin}px`
    navTargetEl = el
    // Live getter: the element's offset can shift mid-animation
    // (content above it resizing, a virtualizer refining estimated row
    // offsets); the animation re-reads and re-clamps every frame.
    startAnimatedScroll(() =>
      Math.max(0, offsetWithin(el, container) - options.scrollMargin),
    )
    commit()
  }

  function getPinnedElement(): HTMLElement | null {
    return pendingPinEl ?? ctx.pinnedEl
  }

  function scrollToBottom(): void {
    if (!ctx.container) return
    // A programmatic jump to the bottom is the user's clear intent to
    // move AWAY from the pin (the FAB the consumer wires to this is
    // literally a "go to the bottom" affordance). Clear `pinAnchored`
    // so the next content resize doesn't write `scrollTop = pinnedY`
    // and yank them back. Wheel/touch events already clear the flag
    // via the user-input cancellers, but the FAB click never reaches
    // the container's listeners (it's a sibling, not a descendant),
    // and any consumer that calls `scrollToBottom()` from a keyboard
    // shortcut / deep-link / notification jump has the same problem.
    internal.pinAnchored = false
    ctx.pinAnimationInterrupted = false
    navTargetEl = null
    initialAnchoring = false
    // Live getter, not a captured number: content may stream in during
    // the ~320ms animation, and a stale target would land short of the
    // real bottom. The rAF loop re-reads and re-clamps every frame.
    const container = ctx.container
    startAnimatedScroll(
      () => container.scrollHeight,
      // Reaching the bottom via this affordance is the user's intent to
      // FOLLOW the latest content again — re-engage the stick lock so a
      // mid-stream FAB click doesn't immediately drift away on the next
      // chunk. Skipped on abort (the user wheeled away mid-animation).
      () => {
        if (options.strategy === 'stick-to-bottom') {
          internal.locked = true
        } else {
          // Pin-to-top: tighten a gutter the in-flight floor kept slack.
          recalcGutter(ctx)
        }
      },
    )
    // startAnimatedScroll defers its prologue commit to the caller;
    // emit so subscribers see `pinAnchored: false` + `scrollInFlight:
    // true` while it runs.
    commit()
  }

  function lock(): void {
    if (options.strategy !== 'stick-to-bottom') return
    if (!ctx.container) return
    internal.locked = true
    ctx.container.scrollTop = ctx.container.scrollHeight
    internal.atBottom = true
    commit()
  }

  function unlock(): void {
    if (options.strategy !== 'stick-to-bottom') return
    if (!internal.locked) return
    internal.locked = false
    commit()
  }

  function setStreaming(streaming: boolean): void {
    const wasStreaming = internal.streaming
    internal.streaming = streaming
    if (streaming) {
      cancelStreamingGrace()
      if (ctx.container) ctx.container.style.overflowAnchor = 'none'
      commit()
      return
    }
    if (wasStreaming) {
      // Grace period: the final chunk often renders AFTER the consumer
      // flips their loading flag — the append and the flag change land
      // in the same tick, but the resulting ResizeObserver callback
      // fires later. Without the grace, stick-to-bottom stops snapping
      // one resize too early and that last growth is orphaned above
      // the bottom. Keep following (and keep `overflow-anchor: none`)
      // for two frames; real user input still wins immediately because
      // the lock release runs at input time.
      ctx.streamingGrace = true
      if (streamingGraceFrame !== null) {
        cancelAnimationFrame(streamingGraceFrame)
      }
      streamingGraceFrame = requestAnimationFrame(() => {
        streamingGraceFrame = requestAnimationFrame(() => {
          streamingGraceFrame = null
          ctx.streamingGrace = false
          if (ctx.container) ctx.container.style.overflowAnchor = ''
        })
      })
    } else if (ctx.container) {
      ctx.container.style.overflowAnchor = ''
    }
    commit()
  }

  function reset(): void {
    // Kill any pin work still in the pipeline — a pin scheduled just
    // before a thread switch must not land on the new thread's DOM.
    pinEpoch++
    pendingPinEl = null
    if (pendingPinFrame !== null) {
      cancelAnimationFrame(pendingPinFrame)
      pendingPinFrame = null
    }
    if (pendingLatestFrame !== null) {
      cancelAnimationFrame(pendingLatestFrame)
      pendingLatestFrame = null
    }
    if (activeScrollAbort) {
      activeScrollAbort.abort()
      activeScrollAbort = null
      internal.scrollInFlight = false
    }
    ctx.pinAnimationInterrupted = false
    navTargetEl = null
    cancelStreamingGrace()
    if (restoreFrame !== null) {
      cancelAnimationFrame(restoreFrame)
      restoreFrame = null
    }
    strategy.reset(ctx)
    // A reset is a fresh thread — re-arm the initial-position anchoring
    // so the new content opens at the latest message too.
    initialAnchoring = options.initialPosition === 'bottom'
    if (initialAnchoring && ctx.container) {
      ctx.container.scrollTop = ctx.container.scrollHeight
    }
    if (ctx.container) {
      internal.atBottom = measureAtBottom(ctx.container)
    }
    commit()
  }

  function savePosition(): ScrollPosition {
    if (!ctx.container) {
      return { scrollTop: 0, wasAtBottom: true }
    }
    const c = ctx.container
    return {
      scrollTop: c.scrollTop,
      wasAtBottom: measureAtBottom(c),
    }
  }

  function restorePosition(pos: ScrollPosition): void {
    if (!ctx.container) return
    const c = ctx.container
    // The content swap that accompanies a thread switch fires a resize;
    // a still-engaged lock would snap to the bottom before the restore
    // lands. Release it up front — the at-bottom branch re-engages.
    internal.locked = false
    internal.pinAnchored = false
    initialAnchoring = false
    navTargetEl = null
    if (activeScrollAbort) {
      activeScrollAbort.abort()
      internal.scrollInFlight = false
    }
    if (restoreFrame !== null) cancelAnimationFrame(restoreFrame)

    const apply = (): void => {
      if (ctx.container !== c) return // re-mounted in between
      if (pos.wasAtBottom) {
        // The user was following this thread — they want the NEW
        // bottom, not the pixel offset of the old one. Re-engage the
        // follow so the next stream is tracked.
        c.scrollTop = c.scrollHeight
        if (options.strategy === 'stick-to-bottom') internal.locked = true
      } else {
        // Measure from the TOP: messages append below, so the content
        // the user was reading keeps its offset-from-top. Restoring
        // from the bottom would shift their spot by however much
        // content arrived since the save. The browser clamps if
        // content shrank.
        c.scrollTop = Math.max(0, pos.scrollTop)
      }
    }
    // Apply now AND re-apply next frame: callers typically restore
    // right after swapping the message list in, and the synchronous
    // write can clamp against content that hasn't finished laying out.
    apply()
    restoreFrame = requestAnimationFrame(() => {
      restoreFrame = null
      apply()
      if (ctx.container) {
        internal.atBottom = measureAtBottom(ctx.container)
      }
      commit()
    })
    commit()
  }

  function subscribe(listener: (s: ChatScrollState) => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  function destroy(): void {
    teardownDom()
    listeners.clear()
    ctx.container = null
    ctx.content = null
    ctx.pinnedEl = null
    ctx.pinnedMargin = 0
    ctx.pinAnimationInterrupted = false
    ctx.reAnchorPin = undefined
    internal.pinnedY = -1
    internal.pinAnchored = false
    internal.scrollInFlight = false
    internal.pinActive = false
  }

  return {
    get state() {
      return snapshot
    },
    get options() {
      return options
    },
    mount,
    setOptions,
    pinMessage,
    pinLatest,
    pinRelative,
    getPinnedElement,
    referenceMessage,
    relativeMessage,
    scrollToMessage,
    scrollToBottom,
    lock,
    unlock,
    setStreaming,
    reset,
    savePosition,
    restorePosition,
    subscribe,
    destroy,
  }
}

function statesEqual(a: ChatScrollState, b: ChatScrollState): boolean {
  return (
    a.atBottom === b.atBottom &&
    a.pinActive === b.pinActive &&
    a.pinAnchored === b.pinAnchored &&
    a.streaming === b.streaming &&
    a.locked === b.locked &&
    a.scrollInFlight === b.scrollInFlight &&
    a.pinnedY === b.pinnedY
  )
}
