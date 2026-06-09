import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
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

function currentSlug(): string {
  return window.location.hash.replace(/^#\/?/, '') || 'pin-to-top'
}

function App() {
  const [slug, setSlug] = useState(currentSlug)

  useEffect(() => {
    const onHash = () => setSlug(currentSlug())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <>
      <header className="demo-bar">
        {SCENARIOS.map((s) => (
          <a
            key={s.slug}
            href={`#/${s.slug}`}
            className={slug === s.slug ? 'active' : undefined}
          >
            {s.title}
          </a>
        ))}
      </header>
      <section
        style={{
          flex: '1 1 auto',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        {slug === 'pin-to-top' && <PinToTop key="pin-to-top" />}
        {slug === 'pin-to-top-simple' && (
          <PinToTopSimple key="pin-to-top-simple" />
        )}
        {slug === 'stick-to-bottom' && <StickToBottom key="stick-to-bottom" />}
        {slug === 'thread-switch' && <ThreadSwitch key="thread-switch" />}
        {slug === 'side-by-side' && <SideBySide key="side-by-side" />}
      </section>
    </>
  )
}

const root = document.getElementById('app')
if (!root) throw new Error('#app not found')
createRoot(root).render(<App />)
