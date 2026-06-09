# Scroll-to-bottom button

A floating action button that appears when the user has scrolled away
from the bottom. Works with both strategies.

<DemoVideo name="vanilla__fab-button" caption="The FAB appears on scroll-up; clicking it snaps back. Fades in/out on the `atBottom` state transition." />

```tsx
import { useChatScroll } from '@chat-scroll/react'

export function ChatWithFab({ messages }: { messages: Message[] }) {
  const scroll = useChatScroll({ strategy: 'pin-to-top' })

  return (
    <div className="chat" ref={scroll.containerRef}>
      <div className="messages" ref={scroll.contentRef}>
        {messages.map((m) => <Bubble key={m.id} msg={m} />)}
      </div>

      <button
        className={`scroll-fab ${scroll.state.atBottom ? '' : 'visible'}`}
        onClick={scroll.scrollToBottom}
        aria-label="Scroll to bottom"
      >
        <ChevronDown />
      </button>
    </div>
  )
}
```

The pattern is identical for `stick-to-bottom` — `state.atBottom`
fires the same way for both strategies.

## CSS

A standard appear/disappear transition driven by the class toggle:

```css
.scroll-fab {
  position: absolute;
  bottom: 1rem;
  right: 1rem;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 9999px;
  background: var(--surface);
  border: 1px solid var(--border);
  display: grid;
  place-items: center;
  opacity: 0;
  transform: translateY(8px);
  pointer-events: none;
  transition:
    opacity 200ms ease,
    transform 200ms ease;
}

.scroll-fab.visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

@media (prefers-reduced-motion: reduce) {
  .scroll-fab { transition: none; }
}
```

## Threshold

The "at bottom" threshold is configurable. Higher values hide the
button sooner as the user scrolls back toward the end:

```ts
useChatScroll({
  strategy: 'pin-to-top',
  bottomThreshold: 100, // default 40
})
```
