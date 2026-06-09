import '@chat-scroll/example-shared/style.css'
import { mountPinToTop } from './scenarios/pin-to-top'
import { mountStickToBottom } from './scenarios/stick-to-bottom'
import { mountThreadSwitch } from './scenarios/thread-switch'
import { mountSideBySide } from './scenarios/side-by-side'

type Scenario = {
  slug: string
  title: string
  mount: (root: HTMLElement) => () => void
}

const SCENARIOS: Scenario[] = [
  { slug: 'pin-to-top', title: 'Pin to top', mount: mountPinToTop },
  {
    slug: 'stick-to-bottom',
    title: 'Stick to bottom',
    mount: mountStickToBottom,
  },
  { slug: 'thread-switch', title: 'Thread switch', mount: mountThreadSwitch },
  { slug: 'side-by-side', title: 'Side by side', mount: mountSideBySide },
]

const app = document.getElementById('app')
if (!app) throw new Error('#app not found')
const appEl: HTMLElement = app

let teardown: (() => void) | null = null

function currentSlug(): string {
  const hash = window.location.hash.replace(/^#\/?/, '')
  return hash || 'pin-to-top'
}

function render(): void {
  if (teardown) {
    teardown()
    teardown = null
  }

  appEl.innerHTML = ''

  // Header for human navigation. Specs ignore this and read inside the
  // .chat surface only — the header is hidden from the recorded video by
  // the spec resizing the viewport to crop it out, or just by visual
  // intent (it's small and at top).
  const bar = document.createElement('header')
  bar.className = 'demo-bar'
  SCENARIOS.forEach((s) => {
    const a = document.createElement('a')
    a.href = `#/${s.slug}`
    a.textContent = s.title
    if (s.slug === currentSlug()) a.classList.add('active')
    bar.appendChild(a)
  })
  appEl.appendChild(bar)

  const surface = document.createElement('section')
  surface.style.flex = '1 1 auto'
  surface.style.display = 'flex'
  surface.style.flexDirection = 'column'
  surface.style.minHeight = '0'
  appEl.appendChild(surface)

  const slug = currentSlug()
  const found = SCENARIOS.find((s) => s.slug === slug) ?? SCENARIOS[0]
  if (found) teardown = found.mount(surface)
}

window.addEventListener('hashchange', render)
render()
