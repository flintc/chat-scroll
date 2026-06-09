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

/**
 * A longer settled conversation with several user turns — gives the
 * pin-to-top demos enough history that prev/next turn navigation
 * (`pinRelative`) has somewhere to go.
 */
export function seedLongConversation(): DemoMsg[] {
  const mk = (role: DemoMsg['role'], text: string): DemoMsg => ({
    id: ++seedId,
    role,
    text,
  })
  return [
    mk('user', 'What does this library actually do?'),
    mk(
      'assistant',
      'It owns the scroll position of a chat viewport. You pick a ' +
        'strategy — stick-to-bottom for group chat, pin-to-top for AI ' +
        'chat — and it handles streaming growth, user interruptions, ' +
        'expandable blocks, and thread switches without fighting the user.',
    ),
    mk('user', 'Which strategy should a group chat use?'),
    mk(
      'assistant',
      'Stick-to-bottom. In group messaging the newest line is what ' +
        'matters, so the viewport follows growth while the user is at ' +
        'the bottom and gets out of the way the moment they scroll up ' +
        'to read history. Sending a message re-engages the follow.\n\n' +
        'The lock is released by real scroll input only — expanding a ' +
        'block in a completed reply never yanks you back down.',
    ),
    mk('user', 'And an AI assistant UI like this one?'),
    mk(
      'assistant',
      'Pin-to-top. Each question anchors at the top of the viewport ' +
        'and the answer streams in below it, so your eyes never chase ' +
        'the text. A synthetic gutter below the response stops you from ' +
        'overscrolling into empty space, and it shrinks away as the ' +
        'answer fills in.\n\n' +
        'Because every user turn is an anchor, prev/next navigation ' +
        'falls out for free: pinRelative() hops the pin between turns — ' +
        'try the ‹ › buttons above.',
    ),
  ]
}

/** A second, visibly different thread for the thread-switch demo. */
export function seedAltThread(): DemoMsg[] {
  const mk = (role: DemoMsg['role'], text: string): DemoMsg => ({
    id: ++seedId,
    role,
    text,
  })
  return [
    mk('user', 'Different thread — what changed?'),
    mk(
      'assistant',
      'This is thread B. Scroll somewhere mid-thread, switch back to ' +
        'thread A, then return here: your reading position is restored ' +
        'per-thread via savePosition()/restorePosition().\n\n' +
        'Positions are measured from the top of content unless you were ' +
        'at the bottom, in which case restoration re-snaps to the (new) ' +
        'bottom. Try it with the tabs above.',
    ),
    mk('user', 'Why measure from the top and not the bottom?'),
    mk(
      'assistant',
      'Because new messages append below. The content you were reading ' +
        'keeps its offset from the top, so restoring scrollTop puts the ' +
        'same messages back under your eyes even if the thread grew ' +
        'while you were away.\n\n' +
        'Measuring from the bottom would shift your spot down by ' +
        'everything that arrived in the meantime — subtly wrong in ' +
        'exactly the case restoration exists for.',
    ),
    mk('user', 'What about the thread I was following live?'),
    mk(
      'assistant',
      'That is the wasAtBottom flag. If you were at the bottom when you ' +
        'left, you almost certainly want the NEW bottom when you return ' +
        '— not the pixel offset of the old one. Restoration forks on ' +
        'that flag so both intents work.\n\n' +
        'The same flag is also why the demo lands at the latest message ' +
        'the first time you open a thread: with no saved position, ' +
        'jumping to the bottom is the sensible default.',
    ),
    mk('user', 'Anything to watch out for when wiring this up?'),
    mk(
      'assistant',
      'Timing. Restore only after the returning thread has rendered — ' +
        'defer with nextTick or requestAnimationFrame, or the write ' +
        'clamps against half-laid-out content.\n\n' +
        'And with stick-to-bottom, release the lock before the deferred ' +
        'restore: the content swap fires a resize, and a still-engaged ' +
        'lock would snap to the bottom before your restore lands. The ' +
        'multi-thread recipe shows the full sequence.',
    ),
  ]
}
