import { BEHAVIOR_OPTIONS } from '@chat-scroll/example-shared'
import type { ChatScrollBehavior } from '@chat-scroll/core'
import type { UsePlaybackReturn } from './use-playback'

/**
 * Renders the shared three-widget playback strip: interval input,
 * smooth/instant select, Pause/Resume toggle. Every React scenario
 * uses this so the controls are visually identical across demos.
 */
export function PlaybackControls({ playback }: { playback: UsePlaybackReturn }) {
  return (
    <>
      <label className="playback">
        interval
        <input
          type="number"
          min={10}
          max={2000}
          step={10}
          data-test="interval"
          value={playback.intervalMs}
          onChange={(e) => {
            const n = Number(e.currentTarget.value)
            if (Number.isFinite(n) && n >= 10) playback.setIntervalMs(n)
          }}
        />
        ms
      </label>
      <label className="behavior">
        scroll
        <select
          data-test="behavior"
          value={playback.scrollBehavior}
          onChange={(e) =>
            playback.setScrollBehavior(
              e.currentTarget.value as ChatScrollBehavior,
            )
          }
        >
          {BEHAVIOR_OPTIONS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </label>
      <label className="duration">
        duration
        <input
          type="number"
          min={0}
          max={2000}
          step={20}
          data-test="duration"
          value={playback.scrollDurationMs}
          onChange={(e) => {
            const n = Number(e.currentTarget.value)
            if (Number.isFinite(n) && n >= 0) playback.setScrollDurationMs(n)
          }}
        />
        ms
      </label>
      {playback.supportsGutter ? (
        <label className="gutter-toggle">
          <input
            type="checkbox"
            data-test="show-gutter"
            checked={playback.showGutter}
            onChange={(e) => playback.setShowGutter(e.currentTarget.checked)}
          />
          show gutter
        </label>
      ) : null}
      <button
        data-test="auto-tick"
        data-running={playback.running ? 'true' : 'false'}
        onClick={() => playback.toggle()}
      >
        {playback.running ? 'Pause stream' : 'Resume stream'}
      </button>
    </>
  )
}
