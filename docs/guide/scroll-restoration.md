# Scroll restoration

When the user navigates between threads, switches tabs, or re-mounts the
component, you usually want their scroll position preserved.

<LiveDemo scenario="thread-switch" caption="Live demo — scroll mid-thread, switch away, switch back: your spot is where you left it." />

## API

```ts
const pos = scroll.savePosition() // → ScrollPosition
scroll.restorePosition(pos)
```

`ScrollPosition` is opaque — treat it as a token:

```ts
interface ScrollPosition {
  scrollTop: number
  wasAtBottom: boolean
}
```

The `wasAtBottom` flag matters: when restoring, if the user _was_ at the
bottom before, we jump to the new bottom (which may be lower if more
messages arrived). Otherwise we measure from the top of content.

## Per-thread restoration

```tsx
// Inside your top-level chat component:
const positions = useRef<Map<string, ScrollPosition>>(new Map())

// Save when leaving a thread:
useEffect(() => {
  return () => {
    positions.current.set(threadId, scroll.savePosition())
  }
}, [threadId])

// Restore when arriving:
useEffect(() => {
  const saved = positions.current.get(threadId)
  if (saved) scroll.restorePosition(saved)
}, [threadId])
```

## Tab switch

If your chat view is a tab inside a larger app, the component may unmount
on tab change — losing scroll. Save before unmount:

```tsx
useEffect(() => {
  return () => {
    sessionStorage.setItem(
      `chat-scroll:${threadId}`,
      JSON.stringify(scroll.savePosition()),
    )
  }
}, [threadId])

useEffect(() => {
  const raw = sessionStorage.getItem(`chat-scroll:${threadId}`)
  if (raw) scroll.restorePosition(JSON.parse(raw))
}, [threadId])
```

## Caveats

- Restoration runs immediately on call — the content must already be
  rendered. If you're restoring after async data load, defer until after
  render (e.g. `useEffect` post-render, `nextTick`, `requestAnimationFrame`).
- If the content is _shorter_ on restoration than when saved, `scrollTop`
  is clamped to the maximum allowed by the new content.
