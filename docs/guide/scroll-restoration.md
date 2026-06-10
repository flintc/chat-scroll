# Scroll restoration

When the user navigates between threads, switches tabs, or re-mounts the
component, you usually want their scroll position preserved.

<LiveDemo scenario="thread-switch" caption="Scroll mid-thread, switch away, switch back: your spot is where you left it." />

## API

```ts
const pos = scroll.savePosition() // → ScrollPosition
scroll.restorePosition(pos)
```

`ScrollPosition` is opaque — treat it as a token. Restoring resolves in
this order:

1. **Saved at the bottom** → jump to the _new_ bottom (which may be
   lower if more messages arrived) and re-engage the follow.
2. **The message the user was reading is still in the DOM** → land
   relative to it. The snapshot anchors to the content child nearest
   the viewport top, so the restore survives content changes _above_
   the reading position — history pages prepending, expandable blocks
   settling — that would shift a plain offset.
3. **Otherwise** (the thread re-rendered, the token came from
   `JSON.parse`) → fall back to the saved offset from the top of
   content, which is exact as long as content only appended below.

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

- Restore after the destination content has rendered. The controller
  applies immediately and re-applies on the next frame, but it can't
  restore against content that hasn't been swapped in yet.
- If the content is _shorter_ on restoration than when saved, `scrollTop`
  is clamped to the maximum allowed by the new content.
- The token holds a live element reference, so it isn't
  JSON-serializable — a `sessionStorage` round-trip (as above) still
  works, it just restores via the offset fallback.
- Anchoring assumes a keyed list. If your framework recycles message
  elements across _different_ messages (an unkeyed `v-for`/`map`), the
  anchor can point at the wrong message — key your lists.
