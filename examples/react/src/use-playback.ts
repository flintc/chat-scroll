import { useEffect, useRef, useState } from 'react'
import type { ChatScrollBehavior } from '@chat-scroll/core'
import {
  createPlaybackController,
  initialPlaybackState,
  type PlaybackController,
  type PlaybackState,
} from '@chat-scroll/example-shared'

/**
 * React wrapper around the shared framework-agnostic playback
 * controller. Mirrors its state into React state so JSX can render
 * directly. The controller is created once, inside the mount effect —
 * construction can synchronously fire `onBehaviorChange` /
 * `onDurationChange` (persisted-prefs hydration), which forward into
 * `instance.setOptions`, a side effect that must not run mid-render.
 * Callbacks route through a ref so they always see the latest render's
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
  // Latest-opts mirror, refreshed after every commit. Controller
  // callbacks fire from its timer (never during render), so they always
  // observe the current render's closures.
  const optsRef = useRef(opts)
  useEffect(() => {
    optsRef.current = opts
  })

  const controllerRef = useRef<PlaybackController | null>(null)
  const [state, setState] = useState<PlaybackState>(() =>
    initialPlaybackState(opts),
  )

  useEffect(() => {
    const controller = createPlaybackController({
      ...optsRef.current,
      tick: () => optsRef.current.tick(),
      onBehaviorChange: (b) => optsRef.current.onBehaviorChange?.(b),
      onDurationChange: (ms) => optsRef.current.onDurationChange?.(ms),
      isEnabled: () => optsRef.current.isEnabled?.() ?? true,
    })
    controllerRef.current = controller
    // The controller mutates its state object in place, so copy on every
    // publish to give React a fresh reference to diff against.
    const off = controller.subscribe((s) => setState({ ...s }))
    return () => {
      off()
      controller.destroy()
      controllerRef.current = null
    }
  }, [])

  // Method surface, created once so consumers can safely list these in
  // effect dependencies. Each defers to whatever controller is current.
  const [methods] = useState(() => ({
    start: () => controllerRef.current?.start(),
    stop: () => controllerRef.current?.stop(),
    toggle: () => controllerRef.current?.toggle(),
    setIntervalMs: (ms: number) => controllerRef.current?.setIntervalMs(ms),
    setScrollBehavior: (b: ChatScrollBehavior) =>
      controllerRef.current?.setScrollBehavior(b),
    setScrollDurationMs: (ms: number) =>
      controllerRef.current?.setScrollDurationMs(ms),
    setShowGutter: (show: boolean) =>
      controllerRef.current?.setShowGutter(show),
    refresh: () => controllerRef.current?.refresh(),
  }))

  return {
    ...methods,
    supportsGutter: opts.supportsGutter ?? false,
    running: state.running,
    intervalMs: state.intervalMs,
    scrollBehavior: state.scrollBehavior,
    scrollDurationMs: state.scrollDurationMs,
    showGutter: state.showGutter,
  }
}
