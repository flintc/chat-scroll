# Changelog

## Unreleased

### Added

- **`referenceMessage(selector)` and `relativeMessage(selector, ±1)`**
  on the instance and every adapter: the reference-point resolution
  `pinRelative` uses internally, exposed as pure queries.
  `referenceMessage` returns the match the user is at
  (`{ el, index, count, past }`) for counters and disabled states;
  `relativeMessage` returns the element a prev/next navigation would
  target (`null` at the edges). Work under both strategies.
- **`scrollToMessage(el)`**: animated scroll bringing a message to the
  viewport top (minus `scrollMargin`) under either strategy. Releases
  the stick lock first, clears `pinAnchored`, re-reads its target
  every frame, and resolves rapid calls last-call-wins (the in-flight
  target feeds `relativeMessage`). With `relativeMessage` this makes
  stick-to-bottom prev/next navigation a two-liner — see the
  [message-navigation recipe](/recipes/message-navigation).
- **`initialPosition: 'bottom'` option**: open at the latest content
  and keep landing there through hydration / font-swap / late-media
  growth until the first interaction. Re-armed by `reset()`. Replaces
  the mount + rAF + `fonts.ready` snap dance.
- **`getPinnedElement()`** on the instance (and re-exposed by every
  adapter): the element currently pinned, including one whose
  `pinMessage` call is still waiting on its measurement frame. Powers
  navigation UI — disabled prev/next at the edges, a "turn 3/7"
  indicator, highlighting the pinned turn.

- **React example app** (`examples/react`) mirroring the vanilla / Vue /
  Solid demos, plus a `react` Playwright project running the shared e2e
  specs against it.
- **[Troubleshooting guide](/guide/troubleshooting)** — symptom-first
  pitfalls page (container sizing, scrollbar gutter, keyboard focus,
  transforms, scroll chaining, restore timing).
- **Three new fields on `ChatScrollState`:** `pinAnchored`,
  `scrollInFlight`, `pinnedY`. Previously internal-only; promoted
  to the public surface so consumers can build UI on top (e.g. show a
  "jump to pin" affordance only while `pinActive && !pinAnchored`).
  See [`ChatScrollState`](/reference/state).

### Fixed

- **The container's own `padding-bottom` now recalculates the gutter at
  runtime.** The controller already subtracted container padding from
  the gutter math, but only re-ran on a border-box resize — so growing
  the container's `padding-bottom` (the way you reserve space for a
  `position: fixed`/`absolute` composer that just got taller) left the
  gutter stale under `box-sizing: border-box`, where the border box
  doesn't move. The controller now also observes the container's content
  box, so a padding change re-tightens the pin (or re-snaps the bottom)
  on the same frame. See the new
  [overlay-composer recipe](/recipes/composer-overlay).
- **`atBottom` no longer counts the gutter.** It now measures against
  the end of the content, as documented — the gutter is
  controller-owned slack, not content. Previously the no-shrink floor
  during a pin animation made `atBottom` flap with every streamed
  chunk, flickering scroll-to-bottom buttons bound to it.
- **Keyboard/mouse parity for in-chat interactions.** Scroll keys
  consumed by the focused element are now treated as interaction, not
  scroll intent: Space on a button / `<summary>` / link (it activates
  — previously it dropped the pin anchor for keyboard users while a
  mouse click preserved it), and arrows / Home / End / Space inside an
  editable (they move the caret — previously they released the stick
  lock mid-typing).

### Changed

- **`savePosition()` snapshots are anchored to the message at the
  reading position** (the content child nearest the viewport top).
  `restorePosition` lands relative to that element while it's still
  in the DOM, so a restore survives content changes *above* the
  reader — history pages prepending
  ([infinite-history recipe](/recipes/infinite-history)), expandable
  blocks settling — that shift a plain top offset. When the element
  is gone (a re-rendered thread, a JSON-round-tripped token) the
  previous offset-from-top behavior is the fallback; saved-at-bottom
  snapshots still re-snap to the new bottom. `ScrollPosition` gained
  optional `anchorEl` / `anchorOffset` fields and is no longer fully
  JSON-serializable (persisted tokens restore via the fallback).
- **`setStreaming(false)` keeps the follow alive for a two-frame
  grace period.** The final chunk's growth typically renders after
  the consumer flips their loading flag; previously that growth was
  orphaned above the bottom unless the consumer hand-deferred the
  flag flip. User input during the grace still wins immediately.
- **`restorePosition` is self-sufficient.** It releases the stick
  lock (the content swap's resize would otherwise snap to the bottom
  over the restore), applies immediately and re-applies next frame,
  and a `wasAtBottom` snapshot restores to the new bottom and
  re-engages the follow. The `unlock()` + `requestAnimationFrame`
  wrapping recipes used to show is gone.
- **The controller pins `flex-shrink: 0` on the content element.**
  The container is a column flexbox, and a content element with only
  absolutely-positioned children (a virtualizer's total-size wrapper)
  has min-content height 0 — default flex-shrink silently crushed its
  scroll range to the viewport height.
- **`pinRelative` resolves synchronously, returns `boolean`, and
  adapts its reference point.** It now returns `true` when a target
  was pinned and `false` at the edges (wire it to disabled states).
  While the user is anchored at the pin, navigation stays relative to
  the pinned element — and resolves synchronously against the DOM, so
  rapid calls accumulate (two quick "prev"s move two turns instead of
  racing the measurement frame). Once the user scrolls away, the pin
  no longer describes what they're looking at, so navigation becomes
  relative to the match nearest the viewport top: `-1` first re-pins
  the turn being read (editor go-to-previous-change convention), then
  walks upward. This also makes `pinRelative` work before any pin
  exists — no `pinLatest()` seeding required.
- **`stick-to-bottom` releases the lock on upward *input*, not on the
  resulting scroll position.** Wheel-up, a downward touch pan, and
  ArrowUp / PageUp / Home / Shift+Space release the lock the moment
  they arrive (unless a nested scrollable absorbs the event, or the
  content doesn't overflow yet). During a stream the strategy re-snaps
  to the bottom on every chunk, which cancels the browser's
  in-progress scroll before it can observably leave the bottom — so
  the old position-based release lost that race and the chat
  "swallowed" upward scrolls mid-stream, yanking readers back down.
  The position-based release remains as a backup for inputs that emit
  no wheel/touch/key events (scrollbar drags), now gated on the
  viewport actually moving up (see Fixed).
- **Docs demos are live.** Every recorded `.webm` demo in the docs has
  been replaced by an interactive in-page demo driven by the real
  library (via `@chat-scroll/vue`) — stream, scroll, expand blocks, and
  switch threads yourself. The e2e video pipeline (`pnpm e2e:promote`)
  still exists for recorded captures.
- **`UseChatScrollResult` (React) renamed to `UseChatScrollReturn`**
  for consistency with the Vue adapter.
- **`stick-to-bottom` now gates auto-snap on `state.streaming`.** Previously
  the strategy snapped `scrollTop` to `scrollHeight` on every content resize
  whenever `state.locked` was true. That fought users tapping to expand a
  collapsible block (tool-call body, thinking block) in a completed reply:
  the block grew, the controller pulled the viewport to the bottom, and the
  click target visibly jumped up by the block's height. The strategy now
  re-pins only when `locked && streaming`, so post-stream interaction is the
  user's. Around a stream, call `scroll.setStreaming(true / false)` (or use
  the adapter's reactive `streaming` option) — the same pattern already
  needed for `overflow-anchor` handling.

### Fixed

- **The stick lock no longer self-destructs on send.** On `lock()` /
  during a stream, new content can render *between* a snap write and
  that write's scroll event, so the event observes a gap beyond
  `bottomThreshold` without the viewport ever moving — and the old
  release check read that as "user scrolled away", silently breaking
  the follow right as a message was sent. The position-based release
  is now gated on a negative scroll delta (the viewport moving up),
  which only genuine user movement produces.
- **`pinRelative()` to an earlier turn animates instead of
  teleporting.** Pinning an earlier message shrinks the gutter, and the
  synchronous shrink dropped `scrollHeight` below the current
  `scrollTop` — the browser clamped it instantly, jumping most of the
  distance before the smooth-scroll could run. The gutter now holds a
  no-shrink floor while a controller-owned scroll animation is in
  flight and tightens back to the tight-pin contract on arrival.
- **`reset()` cancels in-flight pin work.** A `pinMessage` /
  `pinLatest` scheduled just before a thread switch no longer lands on
  the new thread's DOM; pending measurement frames and the active
  scroll animation are cancelled.
- **`setOptions` no longer clobbers defaults with `undefined`.** The
  framework adapters sync options by passing every key on every render,
  with `undefined` for options the consumer never set. Spreading those
  verbatim erased the resolved defaults: `bottomThreshold` became
  `undefined` (breaking at-bottom detection and the stick lock for every
  React consumer using defaults) and `scrollMargin: undefined` made the
  next `pinMessage()` compute `pinnedY = NaN`. Keys passed as
  `undefined` are now ignored.
- **`restorePosition` restores the reading position from the top.** The
  docs always said non-at-bottom restoration "measures from the top of
  content", but the implementation measured from the *bottom* — so any
  messages that arrived while away shifted the restored position by
  their combined height. Restoration now uses the saved `scrollTop`
  (at-bottom restoration still re-snaps to the new bottom).
- **React adapter survives StrictMode.** Under React 18's StrictMode,
  the simulated unmount ran `destroy()` but callback refs are not
  re-invoked on the simulated remount, leaving the instance dead (no
  listeners, no gutter) for the component's real lifetime. The mount
  effect now re-mounts from the stored refs on its setup phase.
- **Consumer scroll *below* the pin now clears `pinAnchored` too.** The
  away-from-pin detection only covered upward scrolls
  (`scrollTo({top: 0})`); a `scrollIntoView()` of a message below the
  pin left `pinAnchored` armed and the next resize yanked the user back
  up. The check is now symmetric.
- **`scrollToBottom()` re-engages the stick-to-bottom lock.** A FAB
  wired to `scrollToBottom()` now resumes following the stream once the
  scroll completes (skipped if the user aborts mid-animation). It also
  tracks live `scrollHeight` per-frame, so content streaming in during
  the animation no longer leaves the scroll short of the real bottom.
- **Aborted pin animations catch up smoothly from every input path.**
  Wheel/touch/scroll-key events absorbed by a nested scrollable (e.g. a
  horizontal pan over a wide code block) aborted an in-flight pin
  animation without flagging it, so the next resize teleported instead
  of animating the catch-up like the pointerdown path does. All
  pin-preserving input paths now flag the interruption.
- **Nested instances keep their own gutters.** `createGutter`'s
  HMR-reuse lookup used `querySelector`, which could adopt a *nested*
  chat instance's gutter (a chat preview embedded in a message). Only
  direct children are considered now.
- **CI runs on a clean checkout.** The workflow ran `typecheck` and
  `test` before `build`, but the adapters resolve `@chat-scroll/core`
  through its `dist` — both steps failed without it. CI now builds
  first, and a vitest alias resolves the core *source* in unit tests so
  `pnpm test` works without a build locally too.
- **Consumer programmatic `container.scrollTo()` no longer snaps back
  to the pin.** When the host application scrolls the container
  itself (deep-link to top, focus a search hit, "scroll to top"
  hotkey, etc.), the controller now detects the move and clears
  `pinAnchored`. Previously only wheel/touch/keys and
  `scrollToBottom()` cleared it; a consumer-issued scroll left
  `pinAnchored` armed and the next content resize yanked the user
  back to the pin. Detection looks for the signature transition
  (scrollTop crosses the away-from-pin threshold *without* a
  corresponding `scrollHeight` change) which distinguishes consumer
  scrolls from layout-driven browser clamps.
- **Pointerdown mid-pin-animation no longer teleports.** When the
  user taps something inside the chat (a tool-block summary, a link)
  while the pin's smooth-scroll is still in flight, the next content
  resize used to write `scrollTop = pinnedY` synchronously — a
  visible single-frame jump. The controller now flags the
  interruption and routes the resize-time re-anchor through an
  animated catch-up so motion stays continuous.
- **Pin animation tracks live `pinnedY` across mid-flight content
  changes.** When content above the pin grows during the pin's
  smooth-scroll animation (a prior block opens, an image loads, a
  late stream chunk arrives), the animation now re-reads its target
  every frame so it lands at the *current* `pinnedY` instead of the
  value captured at `pinMessage()` time. Previously the pin would
  settle 100+ px below the configured `scrollMargin` and snap up on
  the next resize.
- **Wheel / touch / keys on a nested scrollable no longer clear
  `pinAnchored`.** Horizontally-pannable code blocks, vertical inner
  panels, scrollable inner tables — events on these used to bubble
  to the chat container's listener and falsely drop the pin even
  when the chat itself didn't move. The controller now walks from
  `event.target` up looking for an ancestor with `overflow-x/y` that
  can absorb the delta, and skips the clear if one exists.
- **Tight-pin contract under `position: static` containers.** The
  gutter math previously read `gutter.offsetTop`, which walks up to
  the nearest *positioned* ancestor. When the consumer's container was
  the default `position: static`, that offset absorbed whatever chrome
  sat between the positioned ancestor and the container — leaving the
  gutter short and the pin rendering ~30px below the configured
  `scrollMargin`. The formula now derives the same distance from
  `getBoundingClientRect()`, which always references the container.
- **`scrollToBottom()` snap-back.** Programmatic
  `scrollToBottom()` (and the FAB pattern consumers wire to it) now
  clears `pinAnchored` so the next content resize doesn't re-anchor
  scroll to `pinnedY`. Previously, after clicking a scroll-to-bottom
  FAB and reading the bottom of the response, expanding any prior
  thinking / tool block would yank the user back to the pin.
- **Viewport / container resize while pinned.** The internal
  `ResizeObserver` now watches both the content and the container,
  and observes the **border-box**. The container observer catches
  viewport changes (orientation, mobile keyboard, DevTools, sidebar
  resize). `border-box` mode also catches consumer padding mutations
  on the content element — a content-box observer wouldn't fire on
  padding alone, leaving the gutter stale.
- **Initial tight-pin contract for `pin-to-top`.** The gutter math
  now guarantees `container.scrollHeight − container.clientHeight ===
  pinnedY` exactly, regardless of consumer CSS. Previously, a
  consumer's container padding and content `padding-bottom` could let
  the user scroll a handful of pixels past the pinned message
  (≈ container `padding-top + padding-bottom + content
  padding-bottom`). See the [Tight pin recipe](/recipes/tight-pin)
  for the one remaining edge case (`overflow-y: auto` scrollbar
  toggling).

### Removed

- **`createChatScrollInstance`** — pre-release alias of
  `createChatScroll`; use the canonical name.
- **`UseChatScrollResult`** (React) — renamed to `UseChatScrollReturn`
  (see Changed); the old name is gone, not deprecated.
- **`ScrollPosition.scrollFromBottom`** — unused after the
  `restorePosition` fix; the token is now `{ scrollTop, wasAtBottom }`.

### Changed (breaking, low-level only)

- **`calcGutterHeight` signature.** Now takes
  `{ container, gutter, pinnedY }` instead of
  `{ container, content, pinnedY, contentPaddingBottom }`. The helper
  is exported under the "Lower-level utilities" header in
  [`@chat-scroll/core`](/reference/core#lower-level-utilities); standard
  consumers using `createChatScroll` / the framework adapters are
  unaffected.

## v0.1.0 — Initial release

### Added

- `@chat-scroll/core` — framework-agnostic core with `pin-to-top` and
  `stick-to-bottom` strategies.
- `@chat-scroll/react` — React adapter with `useChatScroll` hook.
- `@chat-scroll/vue` — Vue 3 adapter with `useChatScroll` composable.
- `@chat-scroll/solid` — Solid adapter with `createChatScroll` factory.
- Dynamic gutter management for pin-to-top.
- At-bottom detection with configurable threshold.
- Streaming mode (overflow-anchor toggle).
- Reduced-motion support.
- Scroll position save / restore.
- Identity-stable state snapshots for reactive frameworks.
