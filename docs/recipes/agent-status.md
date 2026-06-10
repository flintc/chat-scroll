# Agent status messages

Agentic UIs narrate while they work — "Searching the docs…",
"Reading 3 results…", "Drafting the answer…" — one line at a time,
each sliding up and out as the next arrives, until the real answer
streams in.

<AgentDemo caption="Send a message: the question pins, status lines cycle in place below it, then the reply streams in. The transcript never shifts while statuses animate — and you can scroll away mid-run without being yanked back." />

## The one rule

Ephemeral UI must never touch layout. Give the status area a **fixed
height** and animate lines with **`transform` and `opacity` only** —
then `scrollHeight` never changes while statuses cycle, and there is
nothing for the scroll position to absorb: no jitter under a pin, no
at-bottom flapping under a stick. The controller only sees the real
events — the pin on send, the answer streaming in, and one small
resize when the slot hands over to the reply.

## The wiring

```tsx
import { useChatScroll } from '@chat-scroll/react'

export function AgentChat({ messages, run, sendToAgent }) {
  // `streaming` spans the WHOLE run — narration and answer — so the
  // strategy stays engaged from send to final token.
  const scroll = useChatScroll({
    strategy: 'pin-to-top',
    streaming: run.status !== 'idle',
  })

  function handleSend(text: string) {
    sendToAgent(text)
    scroll.pinLatest('[data-role="user"]')
  }

  return (
    <div className="chat" ref={scroll.containerRef}>
      <div ref={scroll.contentRef}>
        {messages.map((m) => (
          <div key={m.id} data-role={m.role}>{m.text}</div>
        ))}
        {run.status === 'working' && (
          <div className="status-slot" aria-live="polite">
            {/* keyed remount restarts the enter animation per line */}
            <span key={run.statusIndex} className="status-line">
              {run.statusText}
            </span>
          </div>
        )}
      </div>
      <Composer onSend={handleSend} />
    </div>
  )
}
```

```css
/* Fixed height + overflow hidden: the slot never participates in
   layout. Absolutely positioned lines animate without affecting flow. */
.status-slot {
  position: relative;
  height: 1.625rem;
  overflow: hidden;
}
.status-line {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  animation: status-rise 240ms ease;
}
@keyframes status-rise {
  from {
    transform: translateY(100%);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .status-line {
    animation: none;
  }
}
```

A plain CSS animation covers the enter; for a true exit animation
(the outgoing line sliding up while the new one arrives) keep both
nodes mounted briefly with your framework's transition primitive —
Vue's `<Transition>` (what the demo uses), `react-transition-group`,
Solid's `<Transition>`. Either way the rule holds: the slot's height
is fixed, so neither variant moves the transcript.

## How it behaves

- **Send.** The question pins to the viewport top; the status slot
  appears below it — one small growth the gutter absorbs.
- **Statuses cycle.** Zero layout change, zero scroll involvement.
  The reader can scroll away mid-run and nothing tugs at them.
- **The answer arrives.** The slot unmounts, the reply streams in
  below the pinned question — the normal
  [streaming flow](./ai-streaming) from here.

## Notes

- **Long statuses wrap — fixed height doesn't mean one line.** Size
  the slot for your longest expected line count and clamp the text so
  an outlier truncates with an ellipsis instead of clipping
  mid-glyph (the demo's slot is two lines tall, and one of its
  statuses wraps):

  ```css
  .status-slot { height: 2.5rem; } /* two lines */
  .status-line {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
  ```

  If statuses are always short, the single-line version is simpler:
  `white-space: nowrap; text-overflow: ellipsis; overflow: hidden`.
- **Keeping a permanent record?** If the steps collapse into a
  "Ran 4 steps" disclosure instead of disappearing, that's settled
  content resizing — both strategies already absorb expand/collapse
  without moving the reading position (open the Tool call blocks in
  any demo).
- **Stick-to-bottom works the same.** The slot sits after the last
  message; with a fixed height there's nothing to flap `atBottom`.
- **Real agents** emit these as events (tool started, tool finished).
  Map the latest event to `run.statusText` — the slot renders only
  the current one, so there's no list to manage.
