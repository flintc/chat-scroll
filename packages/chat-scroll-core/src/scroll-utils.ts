import type { ChatScrollBehavior } from './types'

/**
 * Resolve `'auto'` to either `'smooth'` or `'instant'` based on
 * `prefers-reduced-motion`. Read at call time — users can change the
 * setting mid-session without us caching a stale value.
 */
export function resolveScrollBehavior(
  behavior: ChatScrollBehavior,
): ScrollBehavior {
  if (behavior === 'smooth') return 'smooth'
  if (behavior === 'instant') return 'instant' as ScrollBehavior
  if (typeof window === 'undefined') return 'auto'
  const reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches
  return reducedMotion ? ('instant' as ScrollBehavior) : 'smooth'
}

/**
 * True when the container is within `threshold` px of its bottom.
 * `scrollHeight - scrollTop - clientHeight` is the remaining
 * scroll distance.
 */
export function isAtBottom(
  container: HTMLElement,
  threshold: number,
): boolean {
  return (
    container.scrollHeight - container.scrollTop - container.clientHeight <=
    threshold
  )
}

/**
 * Distance from the top of `el` to the top of `container`, expressed as
 * the equivalent `scrollTop` value — what you'd assign to make `el` the
 * topmost visible element.
 */
export function offsetWithin(
  el: HTMLElement,
  container: HTMLElement,
): number {
  const elRect = el.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  return elRect.top - containerRect.top + container.scrollTop
}
