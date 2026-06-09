import type { ChatScrollBehavior } from '@chat-scroll/core'

/**
 * Framework-agnostic playback controller for the demo apps. Owns:
 *   - the streaming interval (ms between ticks)
 *   - the running flag (interval engaged or not)
 *   - the scroll behavior choice (smooth / instant / auto)
 *   - the smooth-scroll duration
 *
 * The adapter (Solid / Vue / vanilla) wraps this so the framework's
 * reactive primitives (signals, refs, manual subscriptions) can mirror
 * the state. We deliberately don't take a dependency on any framework
 * here — the controller publishes via a simple subscribe() callback.
 *
 * Optionally persists prefs to sessionStorage. By default uses a
 * shared key so the user's choice (e.g. "duration=1000ms") follows
 * them across every scenario without re-tuning.
 */

export interface PlaybackState {
  running: boolean
  intervalMs: number
  scrollBehavior: ChatScrollBehavior
  scrollDurationMs: number
  /** Pin-to-top only — overlay the synthetic gutter so it's visible. */
  showGutter: boolean
}

export interface PlaybackControllerOptions {
  initialIntervalMs?: number
  initialBehavior?: ChatScrollBehavior
  initialDurationMs?: number
  initialShowGutter?: boolean
  /**
   * When the scenario doesn't render a gutter (every non-pin-to-top
   * one), set this so the playback bar hides the show-gutter checkbox.
   */
  supportsGutter?: boolean
  /**
   * Called every interval. Return true to keep running, false to stop
   * automatically (e.g. when the underlying stream ends).
   */
  tick: () => boolean
  /**
   * Called whenever the user changes scroll behavior. The chat-scroll
   * instance owner forwards this into `instance.setOptions(...)`.
   */
  onBehaviorChange?: (behavior: ChatScrollBehavior) => void
  /**
   * Called whenever the user changes the smooth-scroll duration.
   * Forwarded into `instance.setOptions({ scrollDurationMs })`.
   */
  onDurationChange?: (durationMs: number) => void
  /**
   * Optional gate. When provided, the interval is paused while it
   * returns false — useful for gating playback on `state.streaming`.
   */
  isEnabled?: () => boolean
  /**
   * sessionStorage key for persisting interval / behavior / duration
   * across reloads. Pass `null` to disable persistence. Defaults to
   * a shared key so prefs apply across every scenario.
   */
  storageKey?: string | null
}

export interface PlaybackController {
  readonly state: PlaybackState
  readonly supportsGutter: boolean
  subscribe: (fn: (s: PlaybackState) => void) => () => void
  start: () => void
  stop: () => void
  toggle: () => void
  setIntervalMs: (ms: number) => void
  setScrollBehavior: (behavior: ChatScrollBehavior) => void
  setScrollDurationMs: (durationMs: number) => void
  setShowGutter: (show: boolean) => void
  /**
   * Re-evaluate the gate. Call when the upstream `isEnabled` source
   * changes — the controller will start/stop the timer to match.
   */
  refresh: () => void
  destroy: () => void
}

export const DEFAULT_PLAYBACK_STORAGE_KEY = 'chat-scroll-demo:playback'

interface PersistedPrefs {
  intervalMs?: number
  scrollBehavior?: ChatScrollBehavior
  scrollDurationMs?: number
  showGutter?: boolean
}

function readPrefs(key: string | null): PersistedPrefs {
  if (!key) return {}
  try {
    if (typeof sessionStorage === 'undefined') return {}
    const raw = sessionStorage.getItem(key)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const out: PersistedPrefs = {}
    const p = parsed as Record<string, unknown>
    if (typeof p.intervalMs === 'number' && Number.isFinite(p.intervalMs)) {
      out.intervalMs = p.intervalMs
    }
    if (
      p.scrollBehavior === 'auto' ||
      p.scrollBehavior === 'smooth' ||
      p.scrollBehavior === 'instant'
    ) {
      out.scrollBehavior = p.scrollBehavior
    }
    if (
      typeof p.scrollDurationMs === 'number' &&
      Number.isFinite(p.scrollDurationMs) &&
      p.scrollDurationMs >= 0
    ) {
      out.scrollDurationMs = p.scrollDurationMs
    }
    if (typeof p.showGutter === 'boolean') {
      out.showGutter = p.showGutter
    }
    return out
  } catch {
    return {}
  }
}

function writePrefs(key: string | null, prefs: PersistedPrefs): void {
  if (!key) return
  try {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.setItem(key, JSON.stringify(prefs))
  } catch {
    // Quota exceeded, disabled storage, etc. — non-fatal.
  }
}

export function createPlaybackController(
  opts: PlaybackControllerOptions,
): PlaybackController {
  const listeners = new Set<(s: PlaybackState) => void>()
  let timer: ReturnType<typeof setInterval> | null = null

  const storageKey =
    opts.storageKey === null ? null : opts.storageKey ?? DEFAULT_PLAYBACK_STORAGE_KEY
  const stored = readPrefs(storageKey)

  const state: PlaybackState = {
    running: false,
    intervalMs: stored.intervalMs ?? opts.initialIntervalMs ?? 140,
    scrollBehavior:
      stored.scrollBehavior ?? opts.initialBehavior ?? 'smooth',
    scrollDurationMs:
      stored.scrollDurationMs ?? opts.initialDurationMs ?? 320,
    showGutter: stored.showGutter ?? opts.initialShowGutter ?? false,
  }

  // If we hydrated a behavior/duration from storage, push it into the
  // chat-scroll instance immediately so the very first scroll uses the
  // restored values.
  if (
    stored.scrollBehavior !== undefined &&
    stored.scrollBehavior !== (opts.initialBehavior ?? 'smooth')
  ) {
    opts.onBehaviorChange?.(state.scrollBehavior)
  }
  if (
    stored.scrollDurationMs !== undefined &&
    stored.scrollDurationMs !== (opts.initialDurationMs ?? 320)
  ) {
    opts.onDurationChange?.(state.scrollDurationMs)
  }

  function persist(): void {
    writePrefs(storageKey, {
      intervalMs: state.intervalMs,
      scrollBehavior: state.scrollBehavior,
      scrollDurationMs: state.scrollDurationMs,
      showGutter: state.showGutter,
    })
  }

  function publish(): void {
    for (const fn of listeners) fn(state)
  }

  function gated(): boolean {
    if (!state.running) return false
    if (opts.isEnabled && !opts.isEnabled()) return false
    return true
  }

  function ensureTimer(): void {
    if (timer !== null) return
    if (!gated()) return
    timer = setInterval(() => {
      const more = opts.tick()
      if (!more) stop()
    }, state.intervalMs)
  }

  function clearTimer(): void {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }

  function start(): void {
    if (state.running) {
      ensureTimer()
      return
    }
    state.running = true
    ensureTimer()
    publish()
  }

  function stop(): void {
    const wasRunning = state.running
    state.running = false
    clearTimer()
    if (wasRunning) publish()
  }

  function toggle(): void {
    if (state.running) stop()
    else start()
  }

  function setIntervalMs(ms: number): void {
    if (!Number.isFinite(ms) || ms < 10) return
    if (state.intervalMs === ms) return
    state.intervalMs = ms
    persist()
    // Re-create at the new pacing if currently running.
    if (timer !== null) {
      clearTimer()
      ensureTimer()
    }
    publish()
  }

  function setScrollBehavior(behavior: ChatScrollBehavior): void {
    if (state.scrollBehavior === behavior) return
    state.scrollBehavior = behavior
    persist()
    opts.onBehaviorChange?.(behavior)
    publish()
  }

  function setScrollDurationMs(durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) return
    if (state.scrollDurationMs === durationMs) return
    state.scrollDurationMs = durationMs
    persist()
    opts.onDurationChange?.(durationMs)
    publish()
  }

  function setShowGutter(show: boolean): void {
    if (state.showGutter === show) return
    state.showGutter = show
    persist()
    publish()
  }

  function refresh(): void {
    if (state.running && gated()) ensureTimer()
    else clearTimer()
  }

  return {
    state,
    supportsGutter: opts.supportsGutter ?? false,
    subscribe(fn) {
      listeners.add(fn)
      // Push current state synchronously so subscribers don't need a
      // separate initial-read path.
      fn(state)
      return () => listeners.delete(fn)
    },
    start,
    stop,
    toggle,
    setIntervalMs,
    setScrollBehavior,
    setScrollDurationMs,
    setShowGutter,
    refresh,
    destroy() {
      clearTimer()
      listeners.clear()
    },
  }
}

export const BEHAVIOR_OPTIONS: readonly ChatScrollBehavior[] = [
  'smooth',
  'instant',
  'auto',
]
