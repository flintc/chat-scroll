import {
  test,
  expect,
  hold,
  sendUserMessage,
  showCue,
} from '../../fixtures'

/**
 * PROBE: a user pointerdown on something inside the chat container WHILE
 * the pin smooth-scroll animation is still running.
 *
 * Hypothesis: `attachUserInputCancellers` treats `pointerdown` as
 * `abort-only` — it aborts the in-flight rAF animation (so scrollTop
 * stops moving mid-flight) but DOES NOT clear `pinAnchored`. Then the
 * NEXT content resize (which can be as innocuous as the bot streaming
 * one more chunk, or the user expanding a block) fires `recalcGutter`,
 * which sees `userWasAnchored = true && !scrollInFlight`, and
 * synchronously writes `scrollTop = pinnedY`. The visual effect is a
 * sudden "teleport" jump from wherever the abort happened to the pin's
 * final landing spot.
 *
 * If the hypothesis holds, the recording will show the smooth animation
 * stopping abruptly when the user taps a block, then a hard snap after
 * the block expand. The scrollTop should jump in a single frame, not
 * animate.
 *
 * Reproduction:
 *  1. Send a user message (pin starts smooth animation toward pinnedY).
 *  2. ~120ms into the ~320ms animation, click an expandable block.
 *  3. Observe: scrollTop is somewhere between start and pinnedY.
 *  4. ~50ms later: scrollTop should still be near the abort point
 *     before the block-expand resize hits.
 *  5. After block expand: if scrollTop suddenly equals pinnedY (without
 *     an animation), that's the snap-back teleport.
 */
test('probe: pointerdown mid-pin-animation teleports on next resize', async ({
  page,
}) => {
  page.on('console', (msg) => {
    const t = msg.text()
    if (t.startsWith('[probe-pd]')) {
      // eslint-disable-next-line no-console
      console.log(t)
    }
  })

  await page.goto('/#/pin-to-top')
  await page.waitForFunction(() => Boolean(window.__demo))
  await hold(page, 400)

  // Turn 1 — stream to completion so we have a prior block to tap.
  await sendUserMessage(page)
  for (let i = 0; i < 50; i += 1) {
    const more = await page.evaluate(() => window.__demo?.tick() ?? false)
    if (!more) break
    await page.waitForTimeout(60)
  }
  await page.evaluate(() => window.__demo?.finishStream())
  await hold(page, 400)

  // Pre-scroll up so turn-1's tool block is visible above the next pin.
  await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    c.scrollTop = 0
  })
  await hold(page, 300)

  // Turn 2 — start the pin animation. Capture scrollTop samples.
  await showCue(page, 'send → pin animation starts')
  await sendUserMessage(page)

  // Sample scrollTop ~40ms in (well before the 320ms animation ends).
  await page.waitForTimeout(40)
  const sampleEarly = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    return { scrollTop: c.scrollTop }
  })

  // Tap the prior block summary mid-animation. Use page.evaluate to
  // dispatch pointerdown synchronously — playwright's `.click()`
  // waits for element stability, but the pin's smooth-scroll
  // animation is making scrollTop move, so the click would be
  // deferred until the animation completes — defeating the whole
  // point of the probe (which is "pointerdown DURING the animation").
  await showCue(page, 'user TAPS block mid-animation (pointerdown abort)')
  await page.evaluate(() => {
    const summary = document.querySelector<HTMLElement>(
      '[data-block-index="1"] .block__summary',
    )
    if (!summary) return
    summary.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    summary.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    summary.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    summary.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    summary.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })

  // Just after the click — capture the abort point.
  await page.waitForTimeout(30)
  const afterPointerdown = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    return { scrollTop: c.scrollTop, scrollHeight: c.scrollHeight }
  })

  // Take two consecutive frame samples while the block-expand
  // animation is still in progress. With the bug: the next resize
  // synchronously writes `scrollTop = pinnedY`, so two consecutive
  // sample-frames see a single-frame jump from "abort point" to
  // "pinnedY" — `between1` and `between2` are nearly equal and far
  // from `afterPointerdown`. With the fix: an animated catch-up
  // interpolates over ~320ms, so `between1` and `between2` are
  // distinct intermediate values.
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => r())),
  )
  const between1 = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    return { scrollTop: c.scrollTop }
  })
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => r())),
  )
  const between2 = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    return { scrollTop: c.scrollTop }
  })

  // The block-expand animation finishes ~200ms later, ResizeObserver
  // fires across that span. After the resize settles, sample again.
  await hold(page, 500)
  const afterExpand = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    const g = c.querySelector<HTMLElement>('[data-chat-scroll-gutter]')!
    return {
      scrollTop: c.scrollTop,
      scrollHeight: c.scrollHeight,
      gutterPx: parseFloat(g.style.height || '0'),
    }
  })

  // Where is the pinned message now (relative to viewport top)?
  const pinFinal = await page.evaluate(() => {
    const ub = document
      .querySelectorAll<HTMLElement>('[data-test="user-msg"]')
      [document.querySelectorAll('[data-test="user-msg"]').length - 1]!
    const sb = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    const u = ub.getBoundingClientRect()
    const s = sb.getBoundingClientRect()
    return { offsetFromViewportTop: u.top - s.top, scrollTop: sb.scrollTop }
  })

  // eslint-disable-next-line no-console
  console.log(
    `[probe-pd] early scrollTop≈${sampleEarly.scrollTop.toFixed(1)} ` +
      `afterPointerdown=${afterPointerdown.scrollTop.toFixed(1)} ` +
      `between1=${between1.scrollTop.toFixed(1)} ` +
      `between2=${between2.scrollTop.toFixed(1)} ` +
      `afterExpand=${afterExpand.scrollTop.toFixed(1)} ` +
      `pinFinal.offsetFromViewportTop=${pinFinal.offsetFromViewportTop.toFixed(1)} ` +
      `pinFinal.scrollTop=${pinFinal.scrollTop.toFixed(1)} ` +
      `gutter=${afterExpand.gutterPx}`,
  )

  await hold(page, 800)

  // ASSERTION 1: the pin ends up at the configured scrollMargin (12px)
  // from the top of the viewport — the user-visible correct outcome.
  expect(Math.abs(pinFinal.offsetFromViewportTop - 12)).toBeLessThan(15)

  // ASSERTION 2: motion was animated, not a single-frame teleport.
  // The bug took afterPointerdown → pinnedY in one frame, so two
  // consecutive frame samples within the animation window would be
  // nearly identical. The fix interpolates over ~320ms, so the two
  // frame samples differ by an animation step. Tolerate up to 2px
  // sub-pixel rounding for "same" detection.
  const frameDelta = Math.abs(between2.scrollTop - between1.scrollTop)
  const totalChange = Math.abs(afterExpand.scrollTop - afterPointerdown.scrollTop)
  // eslint-disable-next-line no-console
  console.log(
    `[probe-pd] frame-to-frame delta within animation=${frameDelta.toFixed(1)}px ` +
      `total change=${totalChange.toFixed(1)}px`,
  )
  // If the total scrollTop change is non-trivial (>40px), the motion
  // must be spread across frames — at least one of the two in-flight
  // samples differs from afterPointerdown by less than the total
  // delta. With a single-frame teleport, between1 ~= between2 ~=
  // afterExpand, and frameDelta is ~0 while both samples are already
  // at the final value.
  if (totalChange > 40) {
    const between1Progress = Math.abs(between1.scrollTop - afterPointerdown.scrollTop)
    expect(between1Progress).toBeLessThan(totalChange - 5)
  }
})
