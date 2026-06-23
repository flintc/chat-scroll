import { animateScrollTo, shouldReduceMotion } from '../smooth-scroll'
import type { ControllerContext } from './context'
import { commit } from './store'

/**
 * Drive an rAF-owned smooth scroll toward `target` (a number or a getter
 * re-read every frame), superseding any in-flight animation. Marks
 * `scrollInFlight` only while a real rAF loop runs, and clears it — emitting
 * a commit — when the animation settles or aborts. `onComplete` fires only on
 * a clean finish, never on abort (an abort means the user took over).
 */
export function startAnimatedScroll(
  cc: ControllerContext,
  target: number | (() => number),
  onComplete?: () => void,
): void {
  const container = cc.ctx.container
  if (!container) return
  cc.activeScrollAbort?.abort()
  cc.activeScrollAbort = new AbortController()
  const signal = cc.activeScrollAbort.signal
  const reducedMotion = shouldReduceMotion(cc.options.scrollBehavior)
  // Only mark scrollInFlight when an actual rAF loop will run. In
  // reduced-motion (or `'instant'`) mode, animateScrollTo writes scrollTop
  // synchronously and returns a resolved promise — no interpolation to
  // protect, and the flag would otherwise stay set until microtasks drain,
  // blocking the next sync recalcGutter.
  //
  // Prologue: just mark the flag — the caller (pinMessage rAF /
  // scrollToBottom) commits at the end of its own work. Emitting here would
  // double-commit and, because subscribers may force a layout in their
  // render path, can introduce micro-jitter in the smooth-scroll animation
  // that fires the same frame.
  if (!reducedMotion) cc.internal.scrollInFlight = true
  void animateScrollTo(container, target, {
    reducedMotion,
    duration: cc.options.scrollDurationMs,
    signal,
  }).finally(() => {
    // Epilogue runs asynchronously after the animation settles or aborts. No
    // external committer is going to fire then, so we must emit so
    // subscribers see `scrollInFlight: false`.
    if (cc.activeScrollAbort?.signal === signal) {
      cc.internal.scrollInFlight = false
      // `onComplete` only fires when the animation ran to its end — an abort
      // (user wheel/touch, superseding scroll) means the user took over and
      // the caller's intent no longer stands.
      if (!signal.aborted) onComplete?.()
      commit(cc)
    }
  })
}
