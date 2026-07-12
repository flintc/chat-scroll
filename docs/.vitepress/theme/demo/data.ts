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
  'Here is the whole thing I am stuck on — pasting the full context so ' +
  'you have everything:\n\n' +
  'I render a streaming assistant reply under each user turn. On every ' +
  'chunk the viewport snaps to the bottom and I lose my place, so ' +
  'reading a long answer while it is still streaming is basically ' +
  'impossible — the text I am reading keeps getting yanked away.\n\n' +
  'This is the scroll effect I wired up, and I think it is the whole ' +
  'problem:\n\n' +
  'function onChunk(delta) {\n' +
  '  setMessages((prev) => appendDelta(prev, delta))\n' +
  '  // runs on every token — fights the user constantly\n' +
  '  requestAnimationFrame(() => {\n' +
  '    el.scrollTop = el.scrollHeight\n' +
  '  })\n' +
  '}\n\n' +
  'I have also tried a few hacks around it: debouncing the scroll, only ' +
  'scrolling when "near" the bottom, and listening for wheel events to ' +
  'cancel it. Each one fixes one case and breaks another — expanding a ' +
  'reasoning block jumps the page, switching threads loses my spot, and ' +
  'on mobile the keyboard opening triggers yet another snap.\n\n' +
  'What I actually want: the question I just asked should stay pinned at ' +
  'the top of the viewport while the answer streams in below it, exactly ' +
  'the way ChatGPT and Claude behave. How do I get that without ' +
  'hand-writing a scroll effect that fights the user on every frame — ' +
  'and, the part I really cannot figure out, what is supposed to happen ' +
  'when the pasted question itself is taller than the viewport?'

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

/** Arguments of the "tool call" block — streamed into its summary. */
export const TOOL_CALL_ARGS = '{ query: "scroll anchoring chat transcripts" }'

/** Result body of the collapsible "tool call" block. */
export const TOOL_CALL_BODY =
  '→ 3 results\n' +
  '  1. CSS Scroll Anchoring — overflow-anchor in transcripts\n' +
  '  2. ResizeObserver timing — callbacks fire after layout\n' +
  '  3. scrollTop clamping — grow the scroll range first\n\n' +
  'Expand this block mid-stream or after a reply settles — the ' +
  'viewport holds either way.'

/** Collapsible block (reasoning or tool call) rendered above the text. */
export interface DemoBlock {
  kind: 'reasoning' | 'tool'
  /** Reasoning label OR tool function name. */
  title: string
  /** Tool call arguments — grow while the call streams in. */
  args?: string
  body: string
  /** True while this block's content is still arriving. */
  streaming?: boolean
}

export interface DemoMsg {
  id: number
  role: 'user' | 'assistant'
  text: string
  /** Collapsible blocks (reasoning, tool calls) rendered above the text. */
  blocks?: DemoBlock[]
}

/**
 * One streamed event of an assistant turn. Mirrors how LLM APIs
 * deliver a turn: reasoning deltas first, then a tool call (its
 * arguments stream token by token, the result follows), then the
 * answer text. `useDemoChat` consumes one event per tick.
 */
export type DemoEvent =
  | { type: 'text'; text: string }
  | { type: 'block-open'; kind: DemoBlock['kind']; title: string }
  | { type: 'block-args'; text: string }
  | { type: 'block-body'; text: string }
  | { type: 'block-close' }

/** Split on word boundaries into chunks of roughly `chars` characters. */
function chunk(s: string, chars: number): string[] {
  const out: string[] = []
  let buf = ''
  for (const part of s.split(/(\s+)/)) {
    if (buf.length + part.length >= chars && buf.length > 0) {
      out.push(buf)
      buf = ''
    }
    buf += part
  }
  if (buf.length > 0) out.push(buf)
  return out
}

/**
 * The canned assistant turn as a stream of events: reasoning streams
 * first, then the tool call (args, then result), then the answer.
 */
export function buildReplyEvents(): DemoEvent[] {
  return [
    { type: 'block-open', kind: 'reasoning', title: 'Reasoning' },
    ...chunk(REASONING_BODY, 24).map(
      (text): DemoEvent => ({ type: 'block-body', text }),
    ),
    { type: 'block-close' },
    { type: 'block-open', kind: 'tool', title: 'search_docs' },
    ...chunk(TOOL_CALL_ARGS, 12).map(
      (text): DemoEvent => ({ type: 'block-args', text }),
    ),
    ...chunk(TOOL_CALL_BODY, 24).map(
      (text): DemoEvent => ({ type: 'block-body', text }),
    ),
    { type: 'block-close' },
    ...ASSISTANT_CHUNKS.map((text): DemoEvent => ({ type: 'text', text })),
  ]
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
 * A short, natural settled conversation with several user turns. It
 * gives the pin-to-top demos enough history for prev/next navigation
 * (`pinRelative`) to have somewhere to go, while ending on a brief,
 * inviting reply — so the demo opens on a clean exchange rather than
 * the tail of a wall of agent text. The long content arrives on demand,
 * when you press Send.
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
      'It owns the scroll position of a chat viewport. Pick a strategy ' +
        '— stick-to-bottom for group chat, pin-to-top for AI chat — and ' +
        'it keeps the right thing on screen as messages stream in.',
      [
        {
          kind: 'tool',
          title: 'search_docs',
          args: TOOL_CALL_ARGS,
          body: TOOL_CALL_BODY,
        },
      ],
    ),
    mk('user', 'Which one should a group chat use?'),
    mk(
      'assistant',
      'Stick-to-bottom: the viewport follows new messages while you sit ' +
        'at the bottom, and steps aside the moment you scroll up to read.',
    ),
    mk('user', 'And an assistant UI like this one?'),
    mk(
      'assistant',
      'Pin-to-top. Your question anchors at the top and the answer ' +
        'streams in below it, so your eyes stay put instead of chasing ' +
        'the text down the page.\n\n' +
        'The striped gutter underneath gives the answer room to grow, ' +
        'then shrinks as it fills — so you never overscroll past the ' +
        'reply into empty space.',
      [{ kind: 'reasoning', title: 'Reasoning', body: REASONING_BODY }],
    ),
    mk('user', 'How do the ‹ › buttons pick a turn?'),
    mk(
      'assistant',
      'They move relative to the turn you are actually on — however you ' +
        'got there, by clicking, scrolling, or sending. At the two ends ' +
        'they disable.',
    ),
    mk('user', 'Makes sense. Can I try it?'),
    mk(
      'assistant',
      'Go ahead — press Send to stream a reply, scroll up mid-stream to ' +
        'take over, or use ‹ › to hop between questions.',
    ),
  ]
}

/**
 * A settled group-chat-flavored conversation for the stick-to-bottom
 * demos — enough turns to overflow the pane so the follow/release
 * behavior is visible from the first interaction, but with short
 * replies that end on a brief, inviting line, so the demo doesn't open
 * on the tail of a wall of text.
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
      'It follows growth: while you sit at the bottom, every new message ' +
        'pushes older ones up and the viewport stays glued to the newest ' +
        'line — the group-chat contract.',
      [
        {
          kind: 'tool',
          title: 'search_docs',
          args: TOOL_CALL_ARGS,
          body: TOOL_CALL_BODY,
        },
      ],
    ),
    mk('user', 'And when I scroll up to read something older?'),
    mk(
      'assistant',
      'The follow releases the instant your scroll input arrives — ' +
        'wheel, touch, or keys — so a stream in full flight can never ' +
        'drag you back down.',
    ),
    mk('user', 'How do I get back to following?'),
    mk(
      'assistant',
      'The ↓ button returns you to the bottom and re-engages the follow; ' +
        'sending a message does too. Scrolling down by hand on purpose ' +
        'does not — those are different intents.',
    ),
    mk('user', 'What about expanding a block after the reply finished?'),
    mk(
      'assistant',
      'Go ahead — open a Tool call or Reasoning block in an earlier ' +
        'reply and your reading position holds. Resizing settled content ' +
        'never yanks the viewport.',
      [{ kind: 'reasoning', title: 'Reasoning', body: REASONING_BODY }],
    ),
    mk('user', 'Nice. Anything else to try?'),
    mk(
      'assistant',
      'Send a message to watch the follow track a stream, then scroll up ' +
        'mid-reply to take over. The speed control slows the chunks down ' +
        'so you can see each step.',
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
