import { useEffect, useRef, useState } from 'react'
import type { ChatScrollBehavior } from '@chat-scroll/core'
import {
  createPlaybackController,
  type PlaybackController,
  type PlaybackState,
} from '@chat-scroll/example-shared'

/**
 * React wrapper around the shared framework-agnostic playback
 * controller. Mirrors its state into React state so JSX can render
 * directly. The controller is created once per component lifetime;
 * callbacks route through a ref so they always see the latest render's
 * closures (`tick` reads current chat state).
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
  running: boolean
  intervalMs: number
  scrollBehavior: ChatScrollBehavior
  scrollDurationMs: number
  showGutter: boolean
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
  const optsRef = useRef(opts)
  optsRef.current = opts

  const controllerRef = useRef<PlaybackController | null>(null)
  if (controllerRef.current === null) {
    controllerRef.current = createPlaybackController({
      ...opts,
      tick: () => optsRef.current.tick(),
      onBehaviorChange: (b) => optsRef.current.onBehaviorChange?.(b),
      onDurationChange: (ms) => optsRef.current.onDurationChange?.(ms),
      isEnabled: () => optsRef.current.isEnabled?.() ?? true,
    })
  }
  const controller = controllerRef.current

  const [state, setState] = useState<PlaybackState>({ ...controller.state })

  useEffect(() => {
    // The controller mutates its state object in place, so copy on every
    // publish to give React a fresh reference to diff against.
    const off = controller.subscribe((s) => setState({ ...s }))
    return () => {
      off()
      controller.destroy()
    }
  }, [controller])

  return {
    controller,
    supportsGutter: controller.supportsGutter,
    running: state.running,
    intervalMs: state.intervalMs,
    scrollBehavior: state.scrollBehavior,
    scrollDurationMs: state.scrollDurationMs,
    showGutter: state.showGutter,
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
