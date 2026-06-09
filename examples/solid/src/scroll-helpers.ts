import { createEffect, createSignal, onMount, type Accessor } from 'solid-js'
import type { CreateChatScrollReturn } from '@chat-scroll/solid'

/**
 * Scroll to bottom after the first paint. Needed at mount because the
 * ResizeObserver hasn't measured the initial content yet — calling
 * `scrollToBottom` directly would read a stale `scrollHeight`.
 */
export function scrollToBottomOnMount(scroll: CreateChatScrollReturn): void {
  onMount(() => {
    requestAnimationFrame(() => scroll.scrollToBottom())
  })
}

export interface UseStickFollowOptions {
  /**
   * Reactive signal whose changes should trigger a lock-repair (re-call
   * `scroll.lock()`). Typically `chat.messages` — every chunk that grows
   * the content also fires a scroll event that can race the lock off.
   */
  maintainOn?: Accessor<unknown>
}

export interface UseStickFollowReturn {
  following: Accessor<boolean>
  /** Re-call `lock()` if we're still following. Safe to call from anywhere. */
  maintain: () => void
  /** Resume following (e.g. user clicked the ↓ FAB). */
  resume: () => void
  /** Mark the user as having broken the lock (e.g. programmatic scroll up). */
  release: () => void
}

/**
 * Tracks whether the demo should keep auto-following the bottom during a
 * stream. The flag flips off the moment anything breaks the lock (user
 * scroll, programmatic scroll, FAB) and back on when the consumer
 * explicitly resumes. Pass `maintainOn` to auto-repair the lock after
 * every content change.
 */
export function useStickFollow(
  scroll: CreateChatScrollReturn,
  opts: UseStickFollowOptions = {},
): UseStickFollowReturn {
  const [following, setFollowing] = createSignal(true)

  // Mirror the lock — anything that breaks it (user scroll, etc.) drops
  // following so subsequent content changes don't fight the user.
  createEffect(() => {
    if (!scroll.state().locked) setFollowing(false)
  })

  if (opts.maintainOn) {
    const dep = opts.maintainOn
    createEffect(() => {
      dep() // subscribe
      if (following()) scroll.lock()
    })
  }

  return {
    following,
    maintain: () => {
      if (following()) scroll.lock()
    },
    resume: () => {
      setFollowing(true)
      scroll.lock()
    },
    release: () => setFollowing(false),
  }
}
