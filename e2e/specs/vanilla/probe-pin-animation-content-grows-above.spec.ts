import {
  test,
  expect,
  hold,
  sendUserMessage,
  showCue,
} from '../../fixtures'

/**
 * PROBE: content ABOVE the pin grows DURING the pin's smooth-scroll
 * animation. The animation's target is captured at `pinMessage()` time;
 * the rAF loop interpolates toward that fixed target and re-clamps
 * against live `scrollHeight` each frame, but never re-reads `pinnedY`.
 *
 * Hypothesis: when content above the pin grows by Δ px while the
 * animation is in flight:
 *  - `refreshPinnedY` (called from `recalcGutter` on the resize) updates
 *    `ctx.state.pinnedY` from OLD to OLD+Δ.
 *  - But the animation's `target` constant in `animateScrollTo` is still
 *    the OLD pinnedY.
 *  - The animation lands at scrollTop = OLD pinnedY.
 *  - The pinned element is now at `OLD pinnedY + Δ`, so its viewport
 *    offset is `Δ` — NOT `scrollMargin` (12px).
 *  - The pin is visibly "low" by Δ px until the next resize fires
 *    `recalcGutter` with `scrollInFlight=false`, at which point
 *    `scrollTop = pinnedY` snaps the pin back to the correct position.
 *
 * Real-world trigger: user clicks "send" while a prior tool block is
 * collapsed (closed). The block was previously closed by the user OR
 * by the demo author's default. As the new pin animation runs, the
 * user (or some other UI event) toggles open the prior block. Now
 * content above the pin grows mid-animation.
 *
 * Visible symptom in the recorded video: the pin animation lands at a
 * position that's NOT the top-with-12px-margin; a beat later (after the
 * next resize), the pin jumps to the correct position.
 */
test('probe: content grows above pin during pin animation, pin lands wrong', async ({
  page,
}) => {
  page.on('console', (msg) => {
    const t = msg.text()
    if (t.startsWith('[probe-grow]')) {
      // eslint-disable-next-line no-console
      console.log(t)
    }
  })

  await page.goto('/#/pin-to-top')
  await page.waitForFunction(() => Boolean(window.__demo))
  await hold(page, 400)

  // Turn 1 — stream so we have blocks. Finish.
  await sendUserMessage(page)
  for (let i = 0; i < 60; i += 1) {
    const more = await page.evaluate(() => window.__demo?.tick() ?? false)
    if (!more) break
    await page.waitForTimeout(50)
  }
  await page.evaluate(() => window.__demo?.finishStream())
  await hold(page, 400)

  // Collapse block #0 (turn-1's first thinking block, default-open
  // by the demo author) so we can grow it back open mid-pin-animation.
  await page.evaluate(() => window.__demo?.collapseBlock?.(0))
  await hold(page, 400)

  // Make sure we're scrolled up to the top so turn-1 content matters.
  await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    c.scrollTop = 0
  })
  await hold(page, 300)

  // Turn 2 — start pin animation.
  await showCue(page, 'send → pin animation kicks off')
  await sendUserMessage(page)

  // ~60ms in: well within the 320ms animation. Expand the prior block
  // so content ABOVE the pin grows by the block's body height. The RO
  // will fire mid-animation.
  await page.waitForTimeout(60)
  await showCue(page, 'mid-animation: expand prior block ABOVE pin')
  await page.evaluate(() => window.__demo?.expandBlock?.(0))

  // Let the animation finish (320ms total) plus a bit of slack so
  // animateScrollTo's finally() commits scrollInFlight=false.
  await page.waitForTimeout(450)

  // Sample IMMEDIATELY after animation completes. At this instant, no
  // resize has fired since `scrollInFlight=false` was set, so any
  // mid-flight pinnedY drift is still uncorrected. If the bug holds,
  // pin's viewport offset will be > scrollMargin by ~Δ.
  const justAfterAnim = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    const ub = document
      .querySelectorAll<HTMLElement>('[data-test="user-msg"]')
      [document.querySelectorAll('[data-test="user-msg"]').length - 1]!
    const u = ub.getBoundingClientRect()
    const s = c.getBoundingClientRect()
    return {
      scrollTop: c.scrollTop,
      pinOffsetFromViewportTop: u.top - s.top,
      pinnedYReal: u.top - s.top + c.scrollTop,
    }
  })
  // eslint-disable-next-line no-console
  console.log(
    `[probe-grow] just after animation: scrollTop=${justAfterAnim.scrollTop.toFixed(1)} ` +
      `pin offset from viewport top=${justAfterAnim.pinOffsetFromViewportTop.toFixed(1)} ` +
      `pinnedY(real)=${justAfterAnim.pinnedYReal.toFixed(1)}`,
  )

  // Trigger another resize (a stream tick) to see if a subsequent
  // resize "fixes" the wrong pin position. If `justAfterAnim` shows
  // wrong pin AND `afterTick` shows correct pin, that's a visible jump.
  await page.evaluate(() => window.__demo?.tick())
  await page.waitForTimeout(120)

  const afterTick = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    const ub = document
      .querySelectorAll<HTMLElement>('[data-test="user-msg"]')
      [document.querySelectorAll('[data-test="user-msg"]').length - 1]!
    const u = ub.getBoundingClientRect()
    const s = c.getBoundingClientRect()
    return {
      scrollTop: c.scrollTop,
      pinOffsetFromViewportTop: u.top - s.top,
    }
  })
  // eslint-disable-next-line no-console
  console.log(
    `[probe-grow] after extra tick (resize fires recalcGutter): ` +
      `scrollTop=${afterTick.scrollTop.toFixed(1)} ` +
      `pin offset from viewport top=${afterTick.pinOffsetFromViewportTop.toFixed(1)}`,
  )

  const jumpDelta =
    afterTick.pinOffsetFromViewportTop -
    justAfterAnim.pinOffsetFromViewportTop
  // eslint-disable-next-line no-console
  console.log(
    `[probe-grow] visible pin jump on next resize = ${jumpDelta.toFixed(1)}px`,
  )

  await hold(page, 800)

  // ASSERTION: pin should land at ~scrollMargin (12px). If the
  // animation landed at the old pinnedY while content grew above, the
  // pin's viewport offset will be > 12 by the growth amount.
  expect(Math.abs(justAfterAnim.pinOffsetFromViewportTop - 12)).toBeLessThan(15)
})
