import {
  BEHAVIOR_OPTIONS,
  type PlaybackController,
} from '@chat-scroll/example-shared'

/**
 * Vanilla DOM renderer for the playback controls strip. Mounted into
 * the scenario's `.controls` element (after Send/Finish), it owns the
 * three widgets every scenario exposes:
 *
 *   - `interval` (number input, 10–2000ms)
 *   - `behavior` (smooth / instant / auto select)
 *   - `auto-tick` (Pause/Resume toggle)
 *
 * Returns a cleanup function the scenario calls on unmount.
 */
export function mountPlaybackBar(
  parent: HTMLElement,
  controller: PlaybackController,
): () => void {
  const intervalLabel = document.createElement('label')
  intervalLabel.className = 'playback'
  intervalLabel.innerHTML = `interval <input
    type="number" min="10" max="2000" step="10"
    data-test="interval" /> ms`
  const intervalInput = intervalLabel.querySelector<HTMLInputElement>(
    'input[data-test="interval"]',
  )!
  intervalInput.value = String(controller.state.intervalMs)
  intervalInput.addEventListener('input', () => {
    const n = Number(intervalInput.value)
    if (Number.isFinite(n) && n >= 10) controller.setIntervalMs(n)
  })

  const behaviorLabel = document.createElement('label')
  behaviorLabel.className = 'behavior'
  behaviorLabel.innerHTML = `scroll <select data-test="behavior">${BEHAVIOR_OPTIONS.map(
    (b) => `<option value="${b}">${b}</option>`,
  ).join('')}</select>`
  const behaviorSelect = behaviorLabel.querySelector<HTMLSelectElement>(
    'select[data-test="behavior"]',
  )!
  behaviorSelect.value = controller.state.scrollBehavior
  behaviorSelect.addEventListener('change', () => {
    controller.setScrollBehavior(
      behaviorSelect.value as (typeof BEHAVIOR_OPTIONS)[number],
    )
  })

  const durationLabel = document.createElement('label')
  durationLabel.className = 'duration'
  durationLabel.innerHTML = `duration <input
    type="number" min="0" max="2000" step="20"
    data-test="duration" /> ms`
  const durationInput = durationLabel.querySelector<HTMLInputElement>(
    'input[data-test="duration"]',
  )!
  durationInput.value = String(controller.state.scrollDurationMs)
  durationInput.addEventListener('input', () => {
    const n = Number(durationInput.value)
    if (Number.isFinite(n) && n >= 0) controller.setScrollDurationMs(n)
  })

  const autoBtn = document.createElement('button')
  autoBtn.dataset.test = 'auto-tick'
  autoBtn.type = 'button'
  autoBtn.textContent = 'Resume stream'
  autoBtn.addEventListener('click', () => controller.toggle())

  let gutterLabel: HTMLLabelElement | null = null
  let gutterInput: HTMLInputElement | null = null
  if (controller.supportsGutter) {
    gutterLabel = document.createElement('label')
    gutterLabel.className = 'gutter-toggle'
    gutterLabel.innerHTML = `<input type="checkbox" data-test="show-gutter" /> show gutter`
    gutterInput = gutterLabel.querySelector<HTMLInputElement>(
      'input[data-test="show-gutter"]',
    )!
    gutterInput.checked = controller.state.showGutter
    gutterInput.addEventListener('change', () => {
      controller.setShowGutter(gutterInput!.checked)
    })
  }

  parent.appendChild(intervalLabel)
  parent.appendChild(behaviorLabel)
  parent.appendChild(durationLabel)
  if (gutterLabel) parent.appendChild(gutterLabel)
  parent.appendChild(autoBtn)

  const off = controller.subscribe((s) => {
    autoBtn.textContent = s.running ? 'Pause stream' : 'Resume stream'
    autoBtn.dataset.running = s.running ? 'true' : 'false'
    if (document.activeElement !== intervalInput) {
      intervalInput.value = String(s.intervalMs)
    }
    if (document.activeElement !== behaviorSelect) {
      behaviorSelect.value = s.scrollBehavior
    }
    if (document.activeElement !== durationInput) {
      durationInput.value = String(s.scrollDurationMs)
    }
    if (gutterInput && document.activeElement !== gutterInput) {
      gutterInput.checked = s.showGutter
    }
  })

  return () => {
    off()
    intervalLabel.remove()
    behaviorLabel.remove()
    durationLabel.remove()
    gutterLabel?.remove()
    autoBtn.remove()
  }
}
