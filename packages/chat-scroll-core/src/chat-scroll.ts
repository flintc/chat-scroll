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

  function restoreContainerStyles(container: HTMLElement): void {
    if (!savedContainerStyles) return
    container.style.overflowY = savedContainerStyles.overflowY
    container.style.display = savedContainerStyles.display
    container.style.flexDirection = savedContainerStyles.flexDirection
    container.style.overflowAnchor = savedContainerStyles.overflowAnchor
    savedContainerStyles = null
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

  // ── Public API ──────────────────────────────────────────────────
  function mount(container: HTMLElement, content: HTMLElement): void {
    if (ctx.container === container && ctx.content === content) return
    if (ctx.container) teardownDom()

    ctx.container = container
    ctx.content = content

    applyContainerStyles(container)
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
      internal.atBottom = isAtBottom(ctx.container, options.bottomThreshold)
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
        if (ctx.container) {
          internal.atBottom = isAtBottom(
            ctx.container,
            options.bottomThreshold,
          )
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

    internal.atBottom = isAtBottom(container, options.bottomThreshold)
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

  function pinRelative(selector: string, direction: -1 | 1): boolean {
    if (options.strategy !== 'pin-to-top') return false
    if (!ctx.container) return false
    const container = ctx.container
    // Resolve synchronously — navigation targets already-rendered
    // messages, so there's no layout to wait for, and deferring would
    // make rapid calls race the rAF (two quick "prev" clicks would
    // both resolve against the same settled pin and move one turn).
    const matches = Array.from(
      container.querySelectorAll<HTMLElement>(selector),
    )
    if (matches.length === 0) return false

    // Reference point. While the user is still anchored at the pin —
    // or a pin call from this same frame is pending — navigate
    // relative to that element: it's what's at the top of their
    // viewport, and it stays correct under rapid successive calls.
    //
    // Once the user scrolls away, the pin no longer describes what
    // they're looking at, so "previous"/"next" relative to it would
    // teleport them somewhere unrelated to their reading position.
    // Fall back to VIEWPORT-relative navigation below.
    const anchoredEl =
      pendingPinEl ?? (internal.pinAnchored ? ctx.pinnedEl : null)
    if (anchoredEl) {
      const currentIdx = matches.indexOf(anchoredEl)
      if (currentIdx !== -1) {
        const target = matches[currentIdx + direction]
        if (!target) return false
        pinMessage(target)
        return true
      }
      // Anchored element not in the matched set (detached, or a
      // different selector) — fall through to the geometric reference.
    }

    // Viewport-relative reference: the last match whose margin-adjusted
    // top sits at or above the viewport top — i.e. the turn the user is
    // currently reading. This also makes pinRelative usable before any
    // pin exists.
    const FUDGE = 2 // sub-pixel scroll positions + rounding
    const st = container.scrollTop
    const tops = matches.map(
      (el) => offsetWithin(el, container) - options.scrollMargin,
    )
    let currentIdx = -1
    let currentTop = 0
    for (let i = 0; i < tops.length; i++) {
      const top = tops[i]
      if (top !== undefined && top <= st + FUDGE) {
        currentIdx = i
        currentTop = top
      }
    }
    let targetIdx: number
    if (direction === 1) {
      // The next turn below the viewport top. With every match above
      // the viewport (currentIdx === -1) this resolves to the first.
      targetIdx = currentIdx + 1
    } else {
      // Reading mid-reply, below the reference turn's top: "previous"
      // first snaps to the turn being read; pressing again walks up.
      // Mirrors editor gutter navigation (go-to-previous-change).
      targetIdx =
        currentIdx >= 0 && st > currentTop + FUDGE
          ? currentIdx
          : currentIdx - 1
    }
    const target = targetIdx >= 0 ? matches[targetIdx] : undefined
    if (!target) return false
    pinMessage(target)
    return true
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
    internal.streaming = streaming
    if (ctx.container) {
      ctx.container.style.overflowAnchor = streaming ? 'none' : ''
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
    strategy.reset(ctx)
    if (ctx.container) {
      internal.atBottom = isAtBottom(ctx.container, options.bottomThreshold)
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
      wasAtBottom: isAtBottom(c, options.bottomThreshold),
    }
  }

  function restorePosition(pos: ScrollPosition): void {
    if (!ctx.container) return
    const c = ctx.container
    if (pos.wasAtBottom) {
      c.scrollTop = c.scrollHeight
    } else {
      // Measure from the TOP: messages append below, so the content the
      // user was reading keeps its offset-from-top. Restoring from the
      // bottom would shift their spot by however much content arrived
      // since the save. The browser clamps if content shrank.
      c.scrollTop = Math.max(0, pos.scrollTop)
    }
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
