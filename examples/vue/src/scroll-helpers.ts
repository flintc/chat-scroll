import { onMounted, ref, watchEffect, type Ref, type WatchSource } from 'vue'
import type { UseChatScrollReturn } from '@chat-scroll/vue'

/**
 * Scroll to bottom after the first paint. Needed at mount because the
 * ResizeObserver hasn't measured the initial content yet — calling
 * `scrollToBottom` directly would read a stale `scrollHeight`.
 */
export function scrollToBottomOnMount(scroll: UseChatScrollReturn): void {
  onMounted(() => {
    requestAnimationFrame(() => scroll.scrollToBottom())
  })
}

export interface UseStickFollowOptions {
  /**
   * Reactive source whose changes should trigger a lock-repair (re-call
   * `scroll.lock()`). Typically `chat.messages` — every chunk that grows
   * the content also fires a scroll event that can race the lock off.
   */
  maintainOn?: WatchSource<unknown>
}

export interface UseStickFollowReturn {
  following: Ref<boolean>
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
  const following = ref(true)

  // Mirror the lock — anything that breaks it (user scroll, etc.) drops
  // following so subsequent content changes don't fight the user.
  watchEffect(() => {
    if (!scroll.state.value.locked) following.value = false
  })

  if (opts.maintainOn) {
    const dep = opts.maintainOn
    watchEffect(() => {
      // subscribe to dep
      if (typeof dep === 'function') {
        ;(dep as () => unknown)()
      } else {
        void (dep as { value: unknown }).value
      }
      if (following.value) scroll.lock()
    })
  }

  return {
    following,
    maintain: () => {
      if (following.value) scroll.lock()
    },
    resume: () => {
      following.value = true
      scroll.lock()
    },
    release: () => {
      following.value = false
    },
  }
}
