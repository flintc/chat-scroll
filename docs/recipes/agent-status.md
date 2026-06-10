# Agent status messages

Agentic UIs narrate while they work — "Searching the docs…",
"Reading 3 results…", "Drafting the answer…" — one line at a time,
each sliding up and out as the next arrives, until the real answer
streams in.

<AgentDemo caption="Send a message: the question pins, status lines cycle in place below it, then the reply streams in. The transcript never shifts while statuses animate — and you can scroll away mid-run without being yanked back. Toggle Variable-height statuses for the unpredictable case: the area swings between 1 and 10 lines and the question still never moves." />

## Keeping the transcript still

Two ways, depending on how predictable your statuses are.

**Fixed-height slot — zero scroll involvement.** Give the status area
a fixed height and animate lines with **`transform` and `opacity`
only** — then `scrollHeight` never changes while statuses cycle, and
there is nothing for the scroll position to absorb: no jitter under a
pin, no at-bottom flapping under a stick. The controller only sees
the real events — the pin on send, the answer streaming in, and one
small resize when the slot hands over to the reply. Works identically
under both strategies. Use this when statuses are short and regular.

**Natural height — let the library absorb it.** When statuses are
unpredictable — one line or ten — don't reserve worst-case space.
Render the area at its natural height and let every status resize the
content; under `pin-to-top` that's already handled: the controller
re-anchors to the pinned question on every resize and the gutter
grows to cover shrinks, so the reading position doesn't move — and
neither does a reader who scrolled away mid-run. No extra wiring,
just skip the fixed height.

Two trade-offs with natural height. Exit animations want fixed
geometry, so animate entrances only (the demo's variable mode uses a
fade-in). And under `stick-to-bottom` *at the bottom*, a resizing
last element must visibly shift the transcript — that's the bottom
anchor doing its job. There, prefer the fixed slot, or cap the area
with `max-height` plus internal `overflow-y: auto` (an inner scroll
region never touches the outer layout).

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
- **Statuses cycle.** In the fixed slot: zero layout change, zero
  scroll involvement. At natural height: each resize is absorbed by
  the pin and the gutter. Either way the reader can scroll away
  mid-run and nothing tugs at them.
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
