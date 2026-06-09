import { createSignal, onCleanup, type Accessor } from 'solid-js'
import type { ChatScrollBehavior } from '@chat-scroll/core'
import {
  createPlaybackController,
  type PlaybackController,
} from '@chat-scroll/example-shared'

/**
 * Solid wrapper around the shared framework-agnostic playback
 * controller. Mirrors its state into Solid signals so JSX can render
 * directly.
 */
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
  running: Accessor<boolean>
  intervalMs: Accessor<number>
  scrollBehavior: Accessor<ChatScrollBehavior>
  scrollDurationMs: Accessor<number>
  showGutter: Accessor<boolean>
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
  const [running, setRunning] = createSignal(controller.state.running)
  const [intervalMs, setIntervalMs] = createSignal(controller.state.intervalMs)
  const [scrollBehavior, setBehavior] = createSignal<ChatScrollBehavior>(
    controller.state.scrollBehavior,
  )
  const [scrollDurationMs, setDuration] = createSignal(
    controller.state.scrollDurationMs,
  )
  const [showGutter, setShowGutter] = createSignal(controller.state.showGutter)
  const off = controller.subscribe((s) => {
    setRunning(s.running)
    setIntervalMs(s.intervalMs)
    setBehavior(s.scrollBehavior)
    setDuration(s.scrollDurationMs)
    setShowGutter(s.showGutter)
  })
  onCleanup(() => {
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
