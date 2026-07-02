/**
 * The gutter is a zero-height flex sibling that grows beneath the content
 * so the user can't scroll past `pinnedY`.
 *
 * Math (the **tight-pin contract**):
 *
 *   gutterHeight = max(
 *     0,
 *     pinnedY + container.clientHeight - gutterTop - container.paddingBottom,
 *   )
 *
 * Where `gutterTop` is the gutter's distance from the container's
 * padding-edge top, in scroll coordinates. The formula yields
 * `container.scrollHeight - container.clientHeight === pinnedY` — the
 * user can scroll the pinned element exactly to the top of the viewport
 * and no further.
 *
 * Why compute `gutterTop` from bounding rects instead of reading
 * `gutter.offsetTop`? Because `offsetTop` is measured from the
 * **offsetParent**, which is only the container when the container is
 * positioned (`relative`/`absolute`/`fixed`/`sticky`). With the default
 * `position: static` on the container, `offsetParent` walks up to the
 * nearest positioned ancestor (or the body), and `offsetTop` then
 * absorbs the height of everything between that ancestor and the
 * container — in the demo that's the demo bar + status row above the
 * chat surface (~30px). The gutter ends up undersized by that amount and
 * the pin sits ~30px BELOW where it should. The bounding-rect form below
 * always references the container, regardless of position style.
 *
 * The expression breaks down as:
 *   (gRect.top - cRect.top)       — viewport delta from container to gutter
 *   - borderTop                   — strip the container's top border so we
 *                                   land on the padding-edge top
 *   + container.scrollTop         — convert viewport-relative to scroll-
 *                                   coordinate (layout) space
 *
 * This is consumer-agnostic: the library makes no assumptions about the
 * host app's stylesheet beyond "container is the scroll port, content is
 * its child." Any padding/margin/border layered on either element is
 * handled automatically.
 *
 * Scrollbar caveat: if the container uses `overflow-y: auto` and the
 * scrollbar is added/removed when the gutter grows, `clientHeight` can
 * shift by the scrollbar's width and the pin can be off by that amount.
 * Consumers who need sub-pixel precision should set `overflow-y: scroll`
 * or `scrollbar-gutter: stable` so the scrollbar's footprint is stable.
 */

const GUTTER_DATA_ATTR = 'data-chat-scroll-gutter'

/**
 * Find a gutter among `container`'s DIRECT children. Only direct children
 * count — a descendant match could be a *nested* chat instance's gutter
 * (e.g. a chat preview embedded in a message), and adopting it would
 * hijack that instance's layout.
 */
export function findGutterChild(container: HTMLElement): HTMLElement | null {
  for (const child of Array.from(container.children)) {
    if (child.hasAttribute(GUTTER_DATA_ATTR)) {
      return child as HTMLElement
    }
  }
  return null
}

/**
 * The inline styles the controller writes on the gutter, captured before it
 * takes over an adopted (consumer-rendered) node so teardown can restore
 * them exactly — the same contract `applyContainerStyles` /
 * `applyContentStyles` honor for the other two elements.
 */
export interface SavedGutterStyles {
  flexShrink: string
  pointerEvents: string
  height: string
  margin: string
}

/**
 * Apply the layout styles the gutter math depends on, returning the prior
 * inline values. `flex-shrink: 0` so the flex column can't crush it;
 * `pointer-events: none` so the empty band below the content doesn't eat
 * clicks; no margin — the formula assumes nothing sits between the gutter
 * and the container's padding-bottom edge.
 */
export function applyGutterStyles(el: HTMLElement): SavedGutterStyles {
  const saved: SavedGutterStyles = {
    flexShrink: el.style.flexShrink,
    pointerEvents: el.style.pointerEvents,
    height: el.style.height,
    margin: el.style.margin,
  }
  el.style.flexShrink = '0'
  el.style.pointerEvents = 'none'
  el.style.height = '0px'
  el.style.margin = '0'
  return saved
}

export function restoreGutterStyles(
  el: HTMLElement,
  saved: SavedGutterStyles | null,
): void {
  if (!saved) return
  el.style.flexShrink = saved.flexShrink
  el.style.pointerEvents = saved.pointerEvents
  el.style.height = saved.height
  el.style.margin = saved.margin
}

export function createGutter(container: HTMLElement): HTMLElement {
  // Reuse an existing gutter if a previous mount left one behind (HMR, etc).
  const existing = findGutterChild(container)
  if (existing) return existing

  const el = container.ownerDocument.createElement('div')
  el.setAttribute(GUTTER_DATA_ATTR, '')
  applyGutterStyles(el)
  container.appendChild(el)
  return el
}

export interface ResolvedGutter {
  el: HTMLElement
  /**
   * True when the controller created the node itself and therefore owns
   * it: teardown removes it. False for an adopted node (passed to
   * `mount` or rendered by the consumer with `data-chat-scroll-gutter`):
   * teardown must never remove a node the framework's renderer may hold
   * references to — it restores `savedStyles` and leaves it in place.
   */
  owned: boolean
  /** Prior inline styles of an adopted node; null when `owned`. */
  savedStyles: SavedGutterStyles | null
}

/**
 * Resolve the gutter for a mount. Precedence:
 *
 *  1. An element the consumer handed to `mount` — adopted.
 *  2. A direct child of the container carrying `data-chat-scroll-gutter`
 *     (the consumer rendered it in their template, below the content) —
 *     adopted.
 *  3. Neither → the controller creates and appends one (the vanilla /
 *     batteries-included path).
 *
 * Adoption is the headless-clean form: the framework creates the node,
 * exactly like the container and content, and the core only ever writes
 * its `height` — never its structure. It also survives SSR hydration
 * (the div is part of the server markup) where a client-appended node
 * would not exist in the server render.
 */
export function resolveGutter(
  container: HTMLElement,
  provided?: HTMLElement,
): ResolvedGutter {
  const adopted = provided ?? findGutterChild(container)
  if (adopted) {
    // Tag an explicitly-provided node so e2e/tooling selectors and a
    // later adoption-by-attribute remount both find it.
    if (!adopted.hasAttribute(GUTTER_DATA_ATTR)) {
      adopted.setAttribute(GUTTER_DATA_ATTR, '')
    }
    return { el: adopted, owned: false, savedStyles: applyGutterStyles(adopted) }
  }
  return { el: createGutter(container), owned: true, savedStyles: null }
}

export function setGutterHeight(gutter: HTMLElement, height: number): void {
  // Sub-pixel precision (not rounded to whole px) on purpose: during
  // streaming the content grows by fractional pixels while the gutter
  // shrinks to compensate, keeping the scroll extent constant. Rounding
  // the gutter to whole px breaks that cancellation, so `scrollHeight`
  // alternates ±1px frame to frame and the scrollbar visibly jitters.
  // Round to 2 decimals only to keep the inline style tidy.
  gutter.style.height = `${Math.max(0, Math.round(height * 100) / 100)}px`
}

export function destroyGutter(gutter: HTMLElement): void {
  gutter.remove()
}

export function calcGutterHeight(opts: {
  container: HTMLElement
  gutter: HTMLElement
  pinnedY: number
}): number {
  const { container, gutter, pinnedY } = opts
  if (pinnedY < 0) return 0
  const gutterTop = gutterTopWithin(container, gutter)
  const paddingBottom = readPx(container, 'paddingBottom')
  return Math.max(
    0,
    pinnedY + container.clientHeight - gutterTop - paddingBottom,
  )
}

/**
 * Distance from `container`'s padding-edge top to `gutter`'s border-top,
 * in scroll-coordinate space. Equivalent to `gutter.offsetTop` when the
 * container is the gutter's `offsetParent`, but works regardless of the
 * container's `position` style (see the file header for why this matters).
 */
function gutterTopWithin(container: HTMLElement, gutter: HTMLElement): number {
  const cRect = container.getBoundingClientRect()
  const gRect = gutter.getBoundingClientRect()
  const borderTop = readPx(container, 'borderTopWidth')
  return gRect.top - cRect.top - borderTop + container.scrollTop
}

function readPx(el: HTMLElement, prop: 'paddingBottom' | 'borderTopWidth'): number {
  const view = el.ownerDocument.defaultView
  if (!view) return 0
  const raw = view.getComputedStyle(el)[prop]
  const px = parseFloat(raw)
  return Number.isFinite(px) ? px : 0
}
