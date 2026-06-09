// Hand-rolled smooth scroll for nested overflow containers.
//
// Native scrollTo({behavior: "smooth"}) on inner scroll containers is
// unreliable in iOS Safari (PWA + browser): smooth animations clamp against
// the *stale* scrollHeight when the same frame also writes a layout-affecting
// style (e.g. our gutter). The animation finalises at the old max-scroll
// instead of the requested target. Owning the rAF loop lets us re-clamp
// against the live scrollHeight on every frame.

export interface ScrollableElement {
  scrollTop: number
  readonly scrollHeight: number
  readonly clientHeight: number
}

export interface AnimateScrollOptions {
  duration?: number
  signal?: AbortSignal
  reducedMotion?: boolean
  now?: () => number
  raf?: (cb: FrameRequestCallback) => number
  caf?: (id: number) => void
}

/**
 * Animation target. Either a fixed number, or a getter evaluated each frame.
 *
 * The getter form lets the controller track a moving target — pin-to-top's
 * `pinnedY` shifts whenever content above the pin resizes mid-animation
 * (e.g. a thinking block expanding while the pin's smooth-scroll is in
 * flight). With a fixed number the animation lands at the *captured* value
 * and the pin is visibly off; with a getter the animation re-reads on
 * every frame and lands at the live value.
 */
export type AnimateScrollTarget = number | (() => number)

const DEFAULT_DURATION_MS = 320

export function easeOutExpo(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return 1 - Math.pow(2, -10 * t)
}

function clampTarget(target: number, el: ScrollableElement): number {
  const max = Math.max(0, el.scrollHeight - el.clientHeight)
  if (target < 0) return 0
  if (target > max) return max
  return target
}

function readTarget(target: AnimateScrollTarget): number {
  return typeof target === 'function' ? target() : target
}

export function animateScrollTo(
  el: ScrollableElement,
  target: AnimateScrollTarget,
  options: AnimateScrollOptions = {},
): Promise<void> {
  const {
    duration = DEFAULT_DURATION_MS,
    signal,
    reducedMotion = false,
    now = () => performance.now(),
    raf = (cb: FrameRequestCallback) => requestAnimationFrame(cb),
    caf = (id: number) => cancelAnimationFrame(id),
  } = options

  if (signal?.aborted) return Promise.resolve()

  if (reducedMotion || duration <= 0) {
    el.scrollTop = clampTarget(readTarget(target), el)
    return Promise.resolve()
  }

  const initialTarget = readTarget(target)
  const initialStart = el.scrollTop
  if (
    initialStart === clampTarget(initialTarget, el) &&
    initialStart === initialTarget
  ) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve) => {
    let startTime = now()
    let start = initialStart
    let lastTargetNum = initialTarget
    let frameId = 0
    let aborted = false

    const onAbort = (): void => {
      aborted = true
      if (frameId) caf(frameId)
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    const step = (): void => {
      if (aborted) return
      const liveTargetNum = readTarget(target)
      // If the target moved (pinnedY drifted because content grew above
      // the pin), restart the interpolation from the current scrollTop
      // toward the new target. Without this the animation either snaps
      // by the delta on the next frame (when easing is still high) or
      // lands at the OLD value. Re-anchoring start + startTime keeps the
      // motion smooth and continuous.
      if (liveTargetNum !== lastTargetNum) {
        start = el.scrollTop
        startTime = now()
        lastTargetNum = liveTargetNum
      }
      const elapsed = now() - startTime
      const t = Math.min(1, Math.max(0, elapsed / duration))
      const eased = easeOutExpo(t)
      // Re-clamp every frame: scrollHeight may grow (gutter commits, content
      // streams in) and a target unreachable at frame 0 may be reachable now.
      const liveTarget = clampTarget(liveTargetNum, el)
      el.scrollTop = start + (liveTarget - start) * eased

      if (t >= 1) {
        signal?.removeEventListener('abort', onAbort)
        resolve()
        return
      }
      frameId = raf(step)
    }

    frameId = raf(step)
  })
}

/**
 * Resolve the controller's `scrollBehavior` option to a concrete decision
 * for the rAF loop: either jump instantly (reduced motion / explicit
 * `instant`) or animate. Used by `pinMessage` and `scrollToBottom` so the
 * native browser smooth-scroll path is never taken on a nested container.
 */
export function shouldReduceMotion(behavior: 'auto' | 'smooth' | 'instant'): boolean {
  if (behavior === 'instant') return true
  if (behavior === 'smooth') return false
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
