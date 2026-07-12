import {
  test,
  expect,
  hold,
  sendUserMessage,
  showCue,
  streamN,
} from '../../fixtures'

/**
 * PROBE: tall user-message clamp (pin-to-top `pinClamp`).
 *
 * A very tall user message (long pasted prompt) pinned at the viewport
 * top fills/overflows the viewport, leaving the streaming response no
 * room. With `pinClamp: { tallerThan, visibleHeight }` the controller
 * over-scrolls the message so only `visibleHeight` px stay at the top.
 *
 * This rides the SAME JS scroll-correction the pin already uses, so the
 * clamp must hold on WebKit, not just Chromium — assistant-ui's analog
 * (`topAnchorMessageClamp`) leans on native scroll-anchoring and drifts
 * ~80px on WebKit on the in-turn block toggle. Ours corrects in JS with
 * `overflow-anchor: none`, so this probe runs on the webkit +
 * mobile-safari projects (see playwright.config.ts testMatch) and asserts
 * ~0 drift.
 *
 * Asserts:
 *   1. the message's TOP sits ABOVE the viewport top (over-scrolled),
 *   2. the visible slice ≈ `visibleHeight` (±tolerance),
 *   3. the bot reply's top sits well within the viewport (response room),
 *   4. the clamp holds (≈0 drift) across a content-above resize / stream
 *      tick — the cross-engine proof.
 */

const CLAMP = { tallerThan: 120, visibleHeight: 72 }
// The demo uses the default scrollMargin (12px). The clamp anchors the
// element top at `pinnedY = offset - scrollMargin + (height - visibleHeight)`,
// so the element top sits `scrollMargin` ABOVE the pure-clamp position and
// the visible slice at the top is `visibleHeight + scrollMargin`.
const SCROLL_MARGIN = 12
const EXPECTED_VISIBLE = CLAMP.visibleHeight + SCROLL_MARGIN

// A long multi-paragraph prompt; `.msg` uses `white-space: pre-wrap`, so
// the newlines force a tall message regardless of wrap width.
const TALL_PROMPT = Array.from(
  { length: 14 },
  (_, i) =>
    `Paragraph ${i + 1}: here is a long pasted block of context that makes ` +
    `the user message tall enough to overflow the viewport on its own.`,
).join('\n')

function geom() {
  const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
  const users = document.querySelectorAll<HTMLElement>('[data-test="user-msg"]')
  const u = users[users.length - 1]!
  const bots = document.querySelectorAll<HTMLElement>('[data-test="bot-msg"]')
  const b = bots[bots.length - 1] ?? null
  const cr = c.getBoundingClientRect()
  const ur = u.getBoundingClientRect()
  const br = b?.getBoundingClientRect() ?? null
  return {
    msgTopFromViewportTop: ur.top - cr.top, // negative = over-scrolled
    msgHeight: ur.height,
    visibleSlice: ur.bottom - cr.top, // how much of the msg shows at top
    viewportHeight: cr.height,
    botTopFromViewportTop: br ? br.top - cr.top : null,
  }
}

test('probe: tall user message is clamped (holds cross-engine)', async ({
  page,
}) => {
  page.on('console', (msg) => {
    const t = msg.text()
    if (t.startsWith('[tall-clamp]')) {
      console.log(t)
    }
  })

  await page.goto('/#/pin-to-top')
  await page.waitForFunction(() => Boolean(window.__demo))
  await hold(page, 300)

  // Enable the clamp BEFORE sending, so it's active at pinMessage time.
  await page.evaluate((clamp) => window.__demo?.setPinClamp?.(clamp), CLAMP)

  await showCue(page, 'send a very tall pasted prompt — watch it clamp')
  await sendUserMessage(page, TALL_PROMPT)
  // Stream a few chunks so a bot reply exists below the pin.
  await streamN(page, 6, 90)
  await hold(page, 500)

  const after = await page.evaluate(geom)

  await page.evaluate((g) => {
    console.log(
      `[tall-clamp] msgHeight=${g.msgHeight.toFixed(1)} ` +
        `msgTopFromViewportTop=${g.msgTopFromViewportTop.toFixed(1)} ` +
        `visibleSlice=${g.visibleSlice.toFixed(1)} ` +
        `botTopFromViewportTop=${g.botTopFromViewportTop?.toFixed(1)} ` +
        `viewportHeight=${g.viewportHeight.toFixed(1)}`,
    )
  }, after)

  // The message must be tall enough for the clamp to engage.
  expect(after.msgHeight).toBeGreaterThan(CLAMP.tallerThan)

  // 1. Over-scrolled: the message's top is ABOVE the viewport top.
  expect(after.msgTopFromViewportTop).toBeLessThan(0)
  // The amount over-scrolled ≈ height - visibleHeight - scrollMargin (the
  // margin keeps the top `scrollMargin` lower than the pure-clamp anchor).
  expect(
    Math.abs(
      -after.msgTopFromViewportTop -
        (after.msgHeight - CLAMP.visibleHeight - SCROLL_MARGIN),
    ),
  ).toBeLessThan(8)

  // 2. The visible slice at the top ≈ visibleHeight + scrollMargin.
  expect(Math.abs(after.visibleSlice - EXPECTED_VISIBLE)).toBeLessThan(8)

  // 3. Response room: the bot reply's top sits inside the viewport, well
  //    above its bottom — the whole point of the clamp.
  expect(after.botTopFromViewportTop).not.toBeNull()
  expect(after.botTopFromViewportTop!).toBeGreaterThan(0)
  expect(after.botTopFromViewportTop!).toBeLessThan(after.viewportHeight - 40)

  // 4. CROSS-ENGINE STABILITY: stream more (content grows below the pin)
  //    and sample the clamp again. The visible slice must hold ≈0 drift —
  //    this is exactly where assistant-ui's WebKit analog drifts ~80px.
  const before = after
  await streamN(page, 6, 90)
  await hold(page, 400)
  const later = await page.evaluate(geom)
  const drift = later.visibleSlice - before.visibleSlice
  await page.evaluate((d) => {
    console.log(
      `[tall-clamp] visible-slice drift after more streaming = ${d.toFixed(1)}px`,
    )
  }, drift)
  expect(Math.abs(drift)).toBeLessThan(8)

  await hold(page, 500)
})
