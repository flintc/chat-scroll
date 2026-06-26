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

/**
 * A deliberately long, pasted-in question — tall enough to overflow a
 * pin pane on its own. The home demo leads with it so the `pinClamp`
 * control has an over-tall pinned turn to act on (a short prompt pins
 * fine and the clamp is a no-op, by design).
 */
export const LONG_PROMPT =
  'Here is the whole thing I am stuck on — pasting it so you have the ' +
  'full picture:\n\n' +
  'I render a streaming assistant reply under each user turn. On every ' +
  'chunk the viewport snaps to the bottom and I lose my place, so ' +
  'reading a long answer is impossible.\n\n' +
  'function onChunk(delta) {\n' +
  '  setText((t) => t + delta)\n' +
  '  el.scrollTop = el.scrollHeight  // <- this is what I tried\n' +
  '}\n\n' +
  'What I actually want: the question I just asked should stay pinned at ' +
  'the top of the viewport while the answer streams in below it, the way ' +
  'ChatGPT and Claude behave. How do I get that without hand-writing a ' +
  'scroll effect that fights the user — and what happens when the pasted ' +
  'question itself is taller than the viewport?'

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
  'Group messaging anchors attention to the newest line, so the ' +
  'viewport should follow growth. Long-form assistants anchor ' +
  'attention to the question being answered, so the viewport should ' +
  'hold still while the answer streams in below. Two models, two ' +
  'strategies.\n\n' +
  'Expanding or collapsing this block resizes a settled reply — ' +
  'notice your reading position (or the pin) stays put.'

/** Body of the collapsible "tool call" block in assistant replies. */
export const TOOL_CALL_BODY =
  'search_docs({ query: "scroll anchoring chat transcripts" })\n\n' +
  '→ 3 results\n' +
  '  1. CSS Scroll Anchoring — overflow-anchor in transcripts\n' +
  '  2. ResizeObserver timing — callbacks fire after layout\n' +
  '  3. scrollTop clamping — grow the scroll range first\n\n' +
  'Expand this block mid-stream or after a reply settles — the ' +
  'viewport holds either way.'

export interface DemoMsg {
  id: number
  role: 'user' | 'assistant'
  text: string
  /** Collapsible blocks (reasoning, tool calls) rendered above the text. */
  blocks?: { title: string; body: string }[]
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
  const mk = (
    role: DemoMsg['role'],
    text: string,
    blocks?: DemoMsg['blocks'],
  ): DemoMsg => ({
    id: ++seedId,
    role,
    text,
    ...(blocks ? { blocks } : {}),
  })
  return [
    mk('user', 'What does this library actually do?'),
    mk(
      'assistant',
      'It owns the scroll position of a chat viewport. You pick a ' +
        'strategy — stick-to-bottom for group chat, pin-to-top for AI ' +
        'chat — and it handles streaming growth, user interruptions, ' +
        'expandable blocks, and thread switches without fighting the user.',
      [{ title: 'Tool call · search_docs', body: TOOL_CALL_BODY }],
    ),
    mk('user', 'Which strategy should a group chat use?'),
    mk(
      'assistant',
      'Stick-to-bottom. The newest line is what matters, so the ' +
        'viewport follows growth while you sit at the bottom and gets ' +
        'out of the way the moment you scroll up to read history. ' +
        'Sending a message re-engages the follow.\n\n' +
        'Only real scroll input releases it — expanding a block in a ' +
        'finished reply never yanks you back down.',
    ),
    mk('user', 'And an AI assistant UI like this one?'),
    mk(
      'assistant',
      'Pin-to-top. Each question anchors at the top of the viewport ' +
        'and the answer streams in below it, so your eyes never chase ' +
        'the text. The striped gutter below the response keeps you ' +
        'from overscrolling into empty space, and it shrinks away as ' +
        'the answer fills in.\n\n' +
        'Since every question is an anchor, the ‹ › buttons below hop ' +
        'between turns for free.',
      [{ title: 'Reasoning', body: REASONING_BODY }],
    ),
    mk('user', 'How does prev/next decide where to go?'),
    mk(
      'assistant',
      'It navigates from wherever you actually are, so the buttons ' +
        'always do what they look like they will do.\n\n' +
        'While a turn is pinned, ‹ and › move relative to it — two ' +
        'quick presses move two turns. Once you scroll away, they ' +
        'move relative to the question whose answer you are reading: ' +
        'from the middle of a long reply, ‹ first snaps back to that ' +
        'question, then walks upward, the way editors handle ' +
        'go-to-previous-change.\n\n' +
        'At the ends of the conversation the buttons disable, and the ' +
        'counter between them always names the turn you are on — ' +
        'whether you got there by clicking, scrolling, or sending.\n\n' +
        'Every jump animates, even while a reply is streaming in and ' +
        'even if you change direction mid-flight — navigation and ' +
        'growth never fight, so there are no teleports and no sudden ' +
        'reflows while you read.\n\n' +
        'Try it mid-stream, too: send a message, jump back two ' +
        'questions while the reply is still arriving, read for a ' +
        'moment, then press › twice to come back and watch the rest ' +
        'of the answer fill in. The stream never tugs at your reading ' +
        'position, no matter where in the conversation you are.',
    ),
  ]
}

/**
 * A settled group-chat-flavored conversation for the stick-to-bottom
 * demos — long enough to overflow the pane so the follow/release
 * behavior is visible from the first interaction.
 */
export function seedStickConversation(): DemoMsg[] {
  const mk = (
    role: DemoMsg['role'],
    text: string,
    blocks?: DemoMsg['blocks'],
  ): DemoMsg => ({
    id: ++seedId,
    role,
    text,
    ...(blocks ? { blocks } : {}),
  })
  return [
    mk('user', 'What does stick-to-bottom actually do?'),
    mk(
      'assistant',
      'It follows growth. While you sit at the bottom, every new ' +
        'message (or stream chunk) pushes older content up and the ' +
        'viewport stays glued to the newest line — the group-chat ' +
        'contract.',
      [{ title: 'Tool call · search_docs', body: TOOL_CALL_BODY }],
    ),
    mk('user', 'And when I scroll up to read something older?'),
    mk(
      'assistant',
      'The follow releases the moment your input arrives — wheel, ' +
        'touch, or keyboard. It never waits to see where the scroll ' +
        'lands, so a stream in full flight cannot win a race against ' +
        'you and drag the viewport back down.\n\n' +
        'Try it: send a message, then scroll up mid-stream. The text ' +
        'keeps arriving below, but your reading position holds.',
    ),
    mk('user', 'How do I get back to following the stream?'),
    mk(
      'assistant',
      'The ↓ button takes you back to the bottom and resumes the ' +
        'follow, and sending a message does the same. Scrolling back ' +
        'down by hand deliberately does not — reading the latest text ' +
        'and following future text are different intents.',
    ),
    mk('user', 'What about expanding things after the reply finished?'),
    mk(
      'assistant',
      'Once the stream ends, the viewport is yours. Scroll up and ' +
        'open the "Tool call" or "Reasoning" blocks in the earlier ' +
        'replies — the content grows, and your reading position holds.',
      [{ title: 'Reasoning', body: REASONING_BODY }],
    ),
    mk('user', 'Can I jump between questions here too?'),
    mk(
      'assistant',
      'Yes — ‹ Prev / Next › below work here too. Each click scrolls ' +
        'the adjacent question to the top of the viewport, releasing ' +
        'the follow on the way, so you can revisit any exchange while ' +
        'a reply is still streaming in.\n\n' +
        'One difference from the pin-to-top demo: there is no gutter ' +
        'here, so a question near the end of the transcript can only ' +
        'rise as high as the real bottom allows. Right after you send, ' +
        'the newest question cannot reach the top yet — as the reply ' +
        'streams in, scroll room grows and it becomes a navigation ' +
        'target like any other turn.\n\n' +
        'The counter between the buttons names the question you are ' +
        'reading. At the bottom you are on the latest turn by ' +
        'definition, so it reads 5/5 and Next disables; the ↓ button ' +
        'or another send returns you to the live stream.\n\n' +
        '‹ also adapts to where you are: from the middle of a long ' +
        'answer it first scrolls back to the question you are reading, ' +
        'then walks upward one exchange per press — the convention ' +
        'editors use for go-to-previous-change.\n\n' +
        'Keyboard works too. Focus the transcript and ArrowUp, PageUp, ' +
        'or Home release the follow exactly like the wheel does, while ' +
        'the reply keeps growing below your reading position.\n\n' +
        'That is the whole tour. Send a message to watch the follow ' +
        'track a stream, scroll up mid-reply to take over, and use the ' +
        'speed selector to slow the chunks down enough to see each ' +
        'step happen.',
    ),
  ]
}

/**
 * A huge deterministic history for the virtualization demo. Varied
 * line lengths so row heights differ (the case windowing must
 * measure), numbered so jumps across the list are visible.
 */
export function seedHugeConversation(count: number): DemoMsg[] {
  const LINES = [
    'Quick question — does this hold up at scale?',
    'It does. Only the rows near the viewport exist in the DOM; the ' +
      'counter above shows how few that is at any moment.',
    'Scroll behavior is unchanged, though — a windowed list scrolls ' +
      'exactly like a fully rendered one.',
    'Right — the virtualizer decides which rows exist, chat-scroll ' +
      'decides where the viewport sits. Different jobs, one scroll ' +
      'element.',
    'Row heights vary and get re-measured as you scroll, and the ' +
      'viewport position absorbs it without jumping.',
    'Makes sense.',
    'Scrolling up to read mid-stream works exactly like the regular ' +
      'demos — the follow releases the moment you move.',
    'Try the "Jump to #1" button: five thousand rows away, only a ' +
      'couple dozen are ever in the DOM.',
  ]
  const out: DemoMsg[] = []
  for (let i = 0; i < count; i++) {
    out.push({
      id: ++seedId,
      role: i % 4 === 0 ? 'user' : 'assistant',
      // Deterministic variety (no RNG): step through lines co-prime
      // to the array length so neighbors rarely repeat.
      text: LINES[(i * 3) % LINES.length] as string,
    })
  }
  return out
}

/**
 * Simulated server-paged history for the infinite-history demo.
 * Page 0 is the oldest; ids are stable per message so pages can load
 * in any order. Each message carries its global number so prepends
 * are legible — you can see exactly which page just arrived above.
 */
export const HISTORY_PAGES = 12
export const HISTORY_PER_PAGE = 10

export function seedHistoryPage(page: number): DemoMsg[] {
  const LINES = [
    'Quick check — did the export finish overnight?',
    'It did. All 40k rows landed; the two retries were transient ' +
      'timeouts, nothing dropped.',
    'Worth adding an alert for those retries?',
    'Probably a counter, not an alert — they self-heal. I will add a ' +
      'dashboard panel so we can watch the trend instead.',
    'Sounds right. What about the staging deploy?',
    'Staging is green. One flaky e2e spec, rerun passed — I filed it ' +
      'so it does not get lost.',
    'Can you link the run here when you get a sec?',
    'Linked in the thread above. Short version: 14 minutes end to ' +
      'end, cache hit rate back over 90% after the runner image fix.',
  ]
  const out: DemoMsg[] = []
  for (let i = 0; i < HISTORY_PER_PAGE; i++) {
    const n = page * HISTORY_PER_PAGE + i
    out.push({
      id: 9_000_000 + n,
      role: n % 2 === 0 ? 'user' : 'assistant',
      text: `#${n + 1} · ${LINES[n % LINES.length]}`,
    })
  }
  return out
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
        'thread A, then return here: your reading position comes back ' +
        'with you, per thread.\n\n' +
        'Positions are measured from the top of the content unless you ' +
        'were at the bottom, in which case returning re-snaps to the ' +
        '(new) bottom. Try it with the tabs above.',
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
      'If you were at the bottom when you left, you almost certainly ' +
        'want the new bottom when you return — not the pixel offset of ' +
        'the old one. Restoration distinguishes the two, so both ' +
        'intents work.\n\n' +
        'That is also why a thread opens at its latest message the ' +
        'first time you visit: with no saved position, the bottom is ' +
        'the sensible default.',
    ),
    mk('user', 'Anything to watch out for when wiring this up?'),
    mk(
      'assistant',
      'Just one thing: restore after the returning thread has ' +
        'rendered. Swap the messages in, then hand the saved position ' +
        'back — the multi-thread recipe is a dozen lines end to end.',
    ),
  ]
}
