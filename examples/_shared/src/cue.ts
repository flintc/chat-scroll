/**
 * Single global "user action" cue, lazy-attached to body so any
 * scenario can call it without owning the DOM. Specs flash it via
 * `window.__demo.showCue('user scrolled up')` so a viewer of the
 * recorded video can connect a sudden state change to the gesture
 * that caused it.
 */

let cueEl: HTMLElement | null = null
let timer: number | null = null

function ensure(): HTMLElement {
  if (cueEl && document.body.contains(cueEl)) return cueEl
  cueEl = document.createElement('div')
  cueEl.className = 'cue cue--global'
  cueEl.dataset.test = 'cue'
  document.body.appendChild(cueEl)
  return cueEl
}

export function showCue(text: string): void {
  const el = ensure()
  el.textContent = text
  el.classList.add('cue--visible')
  if (timer !== null) window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    el.classList.remove('cue--visible')
    timer = null
  }, 1500)
}

export function destroyCue(): void {
  if (timer !== null) {
    window.clearTimeout(timer)
    timer = null
  }
  if (cueEl) {
    cueEl.remove()
    cueEl = null
  }
}
