import { onBeforeUnmount, ref, type Ref } from 'vue'
import type { ChatScrollBehavior } from '@chat-scroll/core'
import {
  createPlaybackController,
  type PlaybackController,
} from '@chat-scroll/example-shared'

export interface UsePlaybackOptions {
  initialIntervalMs?: number
  initialBehavior?: ChatScrollBehavior
  initialDurationMs?: number
  initialShowGutter?: boolean
  supportsGutter?: boolean
  tick: () => boolean
  onBehaviorChange?: (b: ChatScrollBehavior) => void
  onDurationChange?: (ms: number) => void
  isEnabled?: () => boolean
}

export interface UsePlaybackReturn {
  controller: PlaybackController
  supportsGutter: boolean
  running: Ref<boolean>
  intervalMs: Ref<number>
  scrollBehavior: Ref<ChatScrollBehavior>
  scrollDurationMs: Ref<number>
  showGutter: Ref<boolean>
  start: () => void
  stop: () => void
  toggle: () => void
  setIntervalMs: (ms: number) => void
  setScrollBehavior: (b: ChatScrollBehavior) => void
  setScrollDurationMs: (ms: number) => void
  setShowGutter: (show: boolean) => void
  refresh: () => void
}

export function usePlayback(opts: UsePlaybackOptions): UsePlaybackReturn {
  const controller = createPlaybackController(opts)
  const running = ref(controller.state.running)
  const intervalMs = ref(controller.state.intervalMs)
  const scrollBehavior = ref<ChatScrollBehavior>(controller.state.scrollBehavior)
  const scrollDurationMs = ref(controller.state.scrollDurationMs)
  const showGutter = ref(controller.state.showGutter)
  const off = controller.subscribe((s) => {
    running.value = s.running
    intervalMs.value = s.intervalMs
    scrollBehavior.value = s.scrollBehavior
    scrollDurationMs.value = s.scrollDurationMs
    showGutter.value = s.showGutter
  })
  onBeforeUnmount(() => {
    off()
    controller.destroy()
  })
  return {
    controller,
    supportsGutter: controller.supportsGutter,
    running,
    intervalMs,
    scrollBehavior,
    scrollDurationMs,
    showGutter,
    start: controller.start,
    stop: controller.stop,
    toggle: controller.toggle,
    setIntervalMs: controller.setIntervalMs,
    setScrollBehavior: controller.setScrollBehavior,
    setScrollDurationMs: controller.setScrollDurationMs,
    setShowGutter: controller.setShowGutter,
    refresh: controller.refresh,
  }
}
