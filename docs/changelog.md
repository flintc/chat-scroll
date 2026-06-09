# Changelog

## Unreleased

### Changed (semantics, low risk)

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

### Added

- **Three new fields on `ChatScrollState`:** `pinAnchored`,
  `scrollInFlight`, `pinnedY`. Previously internal-only; promoted
  to the public surface so consumers can build UI on top (e.g. show a
  "jump to pin" affordance only while `pinActive && !pinAnchored`).
  See [`ChatScrollState`](/reference/state).

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
