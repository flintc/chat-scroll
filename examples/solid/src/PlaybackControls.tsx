import { BEHAVIOR_OPTIONS } from '@chat-scroll/example-shared'
import type { ChatScrollBehavior } from '@chat-scroll/core'
import type { UsePlaybackReturn } from './use-playback'

/**
 * Renders the shared three-widget playback strip: interval input,
 * smooth/instant select, Pause/Resume toggle. Every Solid scenario
 * uses this so the controls are visually identical across demos.
 */
export function PlaybackControls(props: { playback: UsePlaybackReturn }) {
  return (
    <>
      <label class="playback">
        interval
        <input
          type="number"
          min="10"
          max="2000"
          step="10"
          data-test="interval"
          value={props.playback.intervalMs()}
          onInput={(e) => {
            const n = Number(e.currentTarget.value)
            if (Number.isFinite(n) && n >= 10) props.playback.setIntervalMs(n)
          }}
        />
        ms
      </label>
      <label class="behavior">
        scroll
        <select
          data-test="behavior"
          value={props.playback.scrollBehavior()}
          onChange={(e) =>
            props.playback.setScrollBehavior(
              e.currentTarget.value as ChatScrollBehavior,
            )
          }
        >
          {BEHAVIOR_OPTIONS.map((b) => (
            <option value={b}>{b}</option>
          ))}
        </select>
      </label>
      <label class="duration">
        duration
        <input
          type="number"
          min="0"
          max="2000"
          step="20"
          data-test="duration"
          value={props.playback.scrollDurationMs()}
          onInput={(e) => {
            const n = Number(e.currentTarget.value)
            if (Number.isFinite(n) && n >= 0)
              props.playback.setScrollDurationMs(n)
          }}
        />
        ms
      </label>
      {props.playback.supportsGutter ? (
        <label class="gutter-toggle">
          <input
            type="checkbox"
            data-test="show-gutter"
            checked={props.playback.showGutter()}
            onChange={(e) =>
              props.playback.setShowGutter(e.currentTarget.checked)
            }
          />
          show gutter
        </label>
      ) : null}
      <button
        data-test="auto-tick"
        attr:data-running={props.playback.running() ? 'true' : 'false'}
        onClick={() => props.playback.toggle()}
      >
        {props.playback.running() ? 'Pause stream' : 'Resume stream'}
      </button>
    </>
  )
}
