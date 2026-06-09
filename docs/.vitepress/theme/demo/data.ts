/**
 * Canned conversation for the live docs demos. Mirrors the canonical
 * exchange used by the example apps / recorded e2e videos so the docs
 * stay apples-to-apples with the demos.
 */

export const PROMPTS = [
  'Why is chat scroll behavior so tricky to get right?',
  'Got any more thoughts on this?',
  'How do the two strategies differ in practice?',
] as const

/** One tick of the fake stream appends one chunk. */
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
  'and the response streams in below it.',
]

/** Body of the collapsible "reasoning" block in assistant replies. */
export const REASONING_BODY =
  'Considering the two dominant interaction models for streaming chat. ' +
  'Group messaging anchors attention to the newest line, so the viewport ' +
  'should follow growth. Long-form assistants anchor attention to the ' +
  'question being answered, so the viewport should hold still while the ' +
  'answer streams in below. The browser primitives (scroll anchoring, ' +
  'ResizeObserver, smooth scrolling) were not designed around either ' +
  'model, which is why a controller has to arbitrate. Expanding or ' +
  'collapsing this block resizes the content above or below the pin — ' +
  'watch the scroll position stay put.'

export interface DemoMsg {
  id: number
  role: 'user' | 'assistant'
  text: string
  /** Optional collapsible reasoning block rendered above the text. */
  block?: { title: string; body: string }
}

let seedId = 0

/** A short settled exchange so panes don't start empty. */
export function seedConversation(): DemoMsg[] {
  return [
    {
      id: ++seedId,
      role: 'user',
      text: 'What does this library actually do?',
    },
    {
      id: ++seedId,
      role: 'assistant',
      text:
        'It owns the scroll position of a chat viewport. You pick a ' +
        'strategy — stick-to-bottom for group chat, pin-to-top for AI ' +
        'chat — and it handles streaming growth, user interruptions, ' +
        'expandable blocks, and thread switches without fighting the user.',
    },
  ]
}

/** A second, visibly different thread for the thread-switch demo. */
export function seedAltThread(): DemoMsg[] {
  return [
    { id: ++seedId, role: 'user', text: 'Different thread — what changed?' },
    {
      id: ++seedId,
      role: 'assistant',
      text:
        'This is thread B. Scroll somewhere mid-thread, switch back to ' +
        'thread A, then return here: your reading position is restored ' +
        'per-thread via savePosition()/restorePosition().\n\n' +
        'Positions are measured from the top of content unless you were ' +
        'at the bottom, in which case restoration re-snaps to the (new) ' +
        'bottom.\n\n' +
        'Try it with the tabs above.',
    },
  ]
}
