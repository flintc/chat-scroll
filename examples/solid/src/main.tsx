import { render } from 'solid-js/web'
import { createSignal, For, onMount, Show } from 'solid-js'
import { PinToTop } from './scenarios/PinToTop'
import { PinToTopSimple } from './scenarios/PinToTopSimple'
import { StickToBottom } from './scenarios/StickToBottom'
import { ThreadSwitch } from './scenarios/ThreadSwitch'
import { SideBySide } from './scenarios/SideBySide'
import '@chat-scroll/example-shared/style.css'

const SCENARIOS = [
  { slug: 'pin-to-top', title: 'Pin to top' },
  { slug: 'pin-to-top-simple', title: 'Pin to top (simple)' },
  { slug: 'stick-to-bottom', title: 'Stick to bottom' },
  { slug: 'thread-switch', title: 'Thread switch' },
  { slug: 'side-by-side', title: 'Side by side' },
]

function App() {
  const [slug, setSlug] = createSignal(
    window.location.hash.replace(/^#\/?/, '') || 'pin-to-top',
  )

  onMount(() => {
    const onHash = () =>
      setSlug(window.location.hash.replace(/^#\/?/, '') || 'pin-to-top')
    window.addEventListener('hashchange', onHash)
  })

  return (
    <>
      <header class="demo-bar">
        <For each={SCENARIOS}>
          {(s) => (
            <a href={`#/${s.slug}`} classList={{ active: slug() === s.slug }}>
              {s.title}
            </a>
          )}
        </For>
      </header>
      <section
        style={{
          flex: '1 1 auto',
          display: 'flex',
          'flex-direction': 'column',
          'min-height': '0',
        }}
      >
        <Show when={slug() === 'pin-to-top'}>
          <PinToTop />
        </Show>
        <Show when={slug() === 'pin-to-top-simple'}>
          <PinToTopSimple />
        </Show>
        <Show when={slug() === 'stick-to-bottom'}>
          <StickToBottom />
        </Show>
        <Show when={slug() === 'thread-switch'}>
          <ThreadSwitch />
        </Show>
        <Show when={slug() === 'side-by-side'}>
          <SideBySide />
        </Show>
      </section>
    </>
  )
}

const root = document.getElementById('app')
if (!root) throw new Error('#app not found')
render(() => <App />, root)
