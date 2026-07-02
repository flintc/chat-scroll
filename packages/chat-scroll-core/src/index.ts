export { createChatScroll } from './chat-scroll'
export type {
  ChatScrollBehavior,
  ChatScrollInstance,
  ChatScrollOptions,
  ChatScrollState,
  ChatScrollStrategy,
  PinClamp,
  ReferenceMessage,
  ResolvedChatScrollOptions,
  ScrollPosition,
} from './types'

// Lower-level utilities — exposed for advanced consumers and integrators.
export { isAtBottom, offsetWithin, resolveScrollBehavior } from './scroll-utils'
// Gutter helpers. Integrators building a custom mount path should pair
// `resolveGutter` with `restoreGutterStyles`/`destroyGutter` according to
// ownership (`savedStyles` null → the node is yours to remove; non-null →
// restore and leave it — it belongs to the framework's renderer). The
// bare `createGutter`/`destroyGutter` pair is only safe when no template
// renders a tagged gutter in the same container: `createGutter` adopts a
// tagged child without restyling it, and `destroyGutter` removes whatever
// it is given.
export {
  applyGutterStyles,
  calcGutterHeight,
  createGutter,
  destroyGutter,
  findGutterChild,
  resolveGutter,
  restoreGutterStyles,
  setGutterHeight,
} from './gutter'
export type { ResolvedGutter, SavedGutterStyles } from './gutter'
