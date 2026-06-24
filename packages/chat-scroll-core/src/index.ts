export { createChatScroll } from './chat-scroll'
export type {
  ChatScrollBehavior,
  ChatScrollInstance,
  ChatScrollOptions,
  ChatScrollState,
  ChatScrollStrategy,
  PinClamp,
  ReferenceMessage,
  ScrollPosition,
} from './types'

// Lower-level utilities — exposed for advanced consumers and integrators.
export { isAtBottom, offsetWithin, resolveScrollBehavior } from './scroll-utils'
export {
  calcGutterHeight,
  createGutter,
  destroyGutter,
  setGutterHeight,
} from './gutter'
