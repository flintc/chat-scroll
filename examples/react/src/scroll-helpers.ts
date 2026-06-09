import { useEffect, useRef, useState } from 'react'
import type { UseChatScrollReturn } from '@chat-scroll/react'

/**
 * Scroll to bottom after the first paint. Needed at mount because the
 * ResizeObserver hasn't measured the initial content yet — calling
 * `scrollToBottom` directly would read a stale `scrollHeight`.
 */
export function scrollToBottomOnMount(scroll: UseChatScrollReturn): void {
  // `scrollToBottom` is the stable instance method, so this effect only
  // runs on mount.
  const { scrollToBottom } = scroll
  useEffect(() => {
    const raf = requestAnimationFrame(() => scrollToBottom())
    return () => cancelAnimationFrame(raf)
  }, [scrollToBottom])
}

export interface UseStickFollowOptions {
  /**
   * Value whose changes should trigger a lock-repair (re-call
   * `scroll.lock()`). Typically `chat.messages` — every chunk that grows
   * the content also fires a scroll event that can race the lock off.
   */
  maintainOn?: unknown
}

export interface UseStickFollowReturn {
  following: boolean
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
  scroll: UseChatScrollReturn,
  opts: UseStickFollowOptions = {},
): UseStickFollowReturn {
  const [following, setFollowingState] = useState(true)
  // Ref mirror so effects and callbacks read the current value without
  // re-binding per render.
  const followingRef = useRef(true)
  function setFollowing(v: boolean) {
    followingRef.current = v
    setFollowingState(v)
  }

  // Mirror the lock — anything that breaks it (user scroll, etc.) drops
  // following so subsequent content changes don't fight the user.
  const { lock } = scroll
  const locked = scroll.state.locked
  useEffect(() => {
    if (!locked) setFollowing(false)
  }, [locked])

  useEffect(() => {
    if (followingRef.current) lock()
  }, [opts.maintainOn, lock])

  return {
    following,
    maintain: () => {
      if (followingRef.current) scroll.lock()
    },
    resume: () => {
      setFollowing(true)
      scroll.lock()
    },
    release: () => setFollowing(false),
  }
}
