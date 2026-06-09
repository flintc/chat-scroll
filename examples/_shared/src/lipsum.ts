/**
 * Canonical conversation used across all demo scenarios so the recorded
 * videos are apples-to-apples — viewers can see how each strategy
 * renders the SAME exchange differently.
 *
 * Single source of truth. Vanilla/Solid/Vue all import from here.
 */

export const USER_PROMPT =
  'Why is chat scroll behavior so tricky to get right?'

export const FOLLOWUP_PROMPT = 'Got any more thoughts on this?'

export const TURN_PROMPTS = [USER_PROMPT, FOLLOWUP_PROMPT]

/**
 * Plain-text chunk array used by scenarios that don't render expandable
 * blocks (stick-to-bottom, fab-button, side-by-side, thread-switch). One
 * tick = one chunk.
 */
export const ASSISTANT_CHUNKS: readonly string[] = [
  "It's tricky because ",
  'the user has multiple intentions ',
  "you can't always distinguish. ",
  'Sometimes they want to be anchored ',
  'to the latest message — ',
  "that's how group chat works, ",
  'where the most recent line ',
  'is what matters most.\n\n',
  'Other times they want a stable position ',
  'while reading a long response, ',
  'with new content appearing below ',
  'without disturbing where their eyes are. ',
  "That's how an AI chat ",
  'wants to behave.\n\n',
  "The browser doesn't help. ",
  "There's only one scrollTop, ",
  'and any DOM mutation can affect it. ',
  'ResizeObserver fires asynchronously. ',
  'overflow-anchor anchors to arbitrary nodes. ',
  "The user's scroll wheel ",
  'can interrupt at any moment. ',
  'Smooth-scrolling animations ',
  'race with content growth.\n\n',
  'Most mature chat UIs ',
  'end up with two distinct strategies. ',
  'The first stays glued to the bottom: ',
  'new content pushes older content up, ',
  'unless the user has scrolled away. ',
  'The second pins each user turn to the top: ',
  'the question stays visible as context, ',
  'and the response streams in below it.\n\n',
  'Each is the right answer ',
  'for some kinds of conversation. ',
  'Group messaging wants the first; ',
  'long-form AI chat wants the second. ',
  'Picking the wrong one ',
  'for your domain ',
  'is one of those mistakes ',
  "that's only obvious in hindsight.",
]

/**
 * Richer streaming shape used by pin-to-top scenarios. Each tick
 * advances by one segment. Text segments extend the current run; block
 * segments emit a collapsible thinking/tool card whose body is streamed
 * incrementally by [[expandSegments]].
 *
 * The thinking block is `defaultOpen` so the viewer sees it appear
 * mid-stream (matching how chat UIs reveal live reasoning), and the
 * tool block starts collapsed (matching how chat UIs render tool
 * calls — the result is usually long and the summary is enough).
 */
export type BotSegment =
  | { type: 'text'; text: string }
  | {
      type: 'thinking'
      summary: string
      body: string
      defaultOpen?: boolean
    }
  | {
      type: 'tool'
      name: string
      args: string
      result: string
      defaultOpen?: boolean
    }

export const ASSISTANT_SEGMENTS: readonly BotSegment[] = [
  {
    type: 'thinking',
    summary: 'Thinking — picking apart the question',
    body:
      'The user is asking why chat scrolling is hard. Two angles matter: ' +
      'the user-intent ambiguity (do they want to track new content or ' +
      'hold their reading position?) and the platform realities (only one ' +
      'scrollTop, asynchronous resize observation, smooth scrolls racing ' +
      'with content growth). I should answer at both levels.',
    defaultOpen: true,
  },
  { type: 'text', text: "It's tricky because " },
  { type: 'text', text: 'the user has multiple intentions ' },
  { type: 'text', text: "you can't always distinguish. " },
  { type: 'text', text: 'Sometimes they want to be anchored ' },
  { type: 'text', text: 'to the latest message — ' },
  { type: 'text', text: "that's how group chat works, " },
  { type: 'text', text: 'where the most recent line ' },
  { type: 'text', text: 'is what matters most.\n\n' },
  {
    type: 'tool',
    name: 'search_codebase',
    args: '{ query: "overflow-anchor", path: "packages/" }',
    result:
      'Found 4 matches:\n' +
      '  packages/chat-scroll-core/src/chat-scroll.ts:219\n' +
      '  packages/chat-scroll-core/src/chat-scroll.ts:305\n' +
      '  examples/_shared/src/style.css: (none — relies on default)\n' +
      '  docs/recipes/overflow-anchor.md\n' +
      '\n' +
      'overflow-anchor is set to "none" during streaming so the browser ' +
      'does not anchor to an arbitrary node mid-stream, which would ' +
      'fight the controller for scrollTop.',
  },
  { type: 'text', text: 'Other times they want a stable position ' },
  { type: 'text', text: 'while reading a long response, ' },
  { type: 'text', text: 'with new content appearing below ' },
  { type: 'text', text: 'without disturbing where their eyes are.\n\n' },
  { type: 'text', text: "The browser doesn't help. " },
  { type: 'text', text: "There's only one scrollTop, " },
  { type: 'text', text: 'and any DOM mutation can affect it. ' },
  { type: 'text', text: 'ResizeObserver fires asynchronously. ' },
  { type: 'text', text: "The user's scroll wheel " },
  { type: 'text', text: 'can interrupt at any moment.\n\n' },
  { type: 'text', text: 'Most mature chat UIs ' },
  { type: 'text', text: 'end up with two distinct strategies — ' },
  { type: 'text', text: 'glue-to-bottom for group chat, ' },
  { type: 'text', text: 'and pin-each-turn-to-top for long-form AI.' },
]

/**
 * Follow-up turn — shorter, but still tall enough that streaming
 * overflows once the gutter shrinks.
 */
export const ASSISTANT_SEGMENTS_TURN_2: readonly BotSegment[] = [
  {
    type: 'thinking',
    summary: 'Thinking — what would I add?',
    body:
      'The first answer covered intent + browser realities. A natural ' +
      'follow-up is the implementation pattern: pin the user message to ' +
      'the top, grow a synthetic gutter so the response has room to ' +
      'stream, then shrink the gutter as the response fills the space.',
    defaultOpen: true,
  },
  { type: 'text', text: 'A few more thoughts: ' },
  { type: 'text', text: 'the trick is that you almost never want ' },
  { type: 'text', text: 'to fight the user. ' },
  { type: 'text', text: 'If they wheel-scroll mid-stream, ' },
  { type: 'text', text: 'cancel whatever auto-scroll is in flight. ' },
  { type: 'text', text: 'If they expand a thinking block, ' },
  { type: 'text', text: "their reading position shouldn't jump.\n\n" },
  {
    type: 'tool',
    name: 'inspect_dom',
    args: '{ selector: "[data-chat-scroll-gutter]" }',
    result:
      '<div data-chat-scroll-gutter style="height: 184px; flex-shrink: 0; ' +
      'pointer-events: none"></div>\n' +
      '\n' +
      'The gutter is a zero-height flex sibling that grows beneath the ' +
      'content. As the response streams in, scrollHeight increases and ' +
      'the gutter shrinks, keeping the pinned message exactly at the top.',
  },
  { type: 'text', text: 'The gutter is the load-bearing trick. ' },
  { type: 'text', text: 'Without it, ' },
  { type: 'text', text: 'a short response leaves the pinned user message ' },
  { type: 'text', text: 'floating in the middle of the viewport ' },
  { type: 'text', text: 'with empty space below — ' },
  { type: 'text', text: 'or the user can scroll past the response ' },
  { type: 'text', text: 'into whatever is below it.\n\n' },
  { type: 'text', text: 'With it, the response always has room ' },
  { type: 'text', text: 'to stream into, and the pinned message ' },
  { type: 'text', text: 'stays exactly at the top of the viewport.' },
]

export const TURN_SEGMENTS: readonly (readonly BotSegment[])[] = [
  ASSISTANT_SEGMENTS,
  ASSISTANT_SEGMENTS_TURN_2,
]

/**
 * Short pre-existing exchange used to seed the chat so scenarios that
 * need scroll history (stick-to-bottom, thread-switch) have something
 * above the streaming turn.
 */
export const PRIOR_TURNS: readonly { role: 'user' | 'bot'; text: string }[] = [
  { role: 'user', text: 'Hey, got a minute?' },
  { role: 'bot', text: 'Sure — what is it?' },
  { role: 'user', text: 'Nothing urgent. A UX question.' },
  { role: 'bot', text: "Go ahead, I'm listening." },
]
