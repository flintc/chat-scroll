import {
  test,
  expect,
  hold,
  sendUserMessage,
  streamN,
  streamUntilDone,
} from '../../fixtures'

/**
 * Regression: tapping a block summary (mouse click or touch tap) to
 * expand it must NOT cause the pinned message to drift. The
 * controller listens for `pointerdown` / `touchstart` to abort
 * in-flight scroll animations — but those events ALSO fire when the
 * user is merely interacting with a button inside the scroll
 * container, not scrolling. If we clear `pinAnchored` on every
 * pointerdown, a tap-to-expand on a prior-turn block clears the
 * flag and the subsequent resize is left un-anchored — the pin
 * visibly drifts by the block's expansion height.
 */
test('pin-expandable: tapping a block does not drift the pin', async ({
  page,
}) => {
  await page.goto('/#/pin-to-top')
  await page.waitForFunction(() => Boolean(window.__demo))
  await hold(page, 600)

  // Turn 1: send + stream + finish.
  await sendUserMessage(page)
  await streamUntilDone(page, 60)
  await page.evaluate(() => window.__demo?.finishStream())
  await hold(page, 400)

  // Turn 2: send + stream a few chunks so streaming is in flight.
  await sendUserMessage(page)
  await hold(page, 400)
  await streamN(page, 5, 80)

  const ub1 = await page.locator('[data-test="user-msg"]').last().boundingBox()
  const sb1 = await page.locator('[data-test="scroll"]').boundingBox()
  if (!ub1 || !sb1) throw new Error('missing boxes')
  const offsetBefore = ub1.y - sb1.y

  // Tap the tool-call block summary in turn-1 (block index 1). The
  // block is currently scrolled off the top of the viewport, so we
  // scrollIntoView it briefly so Playwright's click can reach it.
  // (Real users would not need to do this — they'd already see the
  // block. But for the test to work in the headless browser, we
  // need the summary to be a click target.)
  //
  // Instead, simulate a tap directly on the block's summary via the
  // dispatchEvent path so we don't need to scroll the viewport.
  await page.evaluate(() => {
    const summary = document.querySelector<HTMLElement>(
      '.block[data-block-index="1"] .block__summary',
    )
    if (!summary) throw new Error('summary not found')
    // Fire the events a real tap would: pointerdown, pointerup, click.
    summary.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    summary.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    summary.click()
  })

  // Wait for the 220ms transition to settle.
  await hold(page, 600)

  const ub2 = await page.locator('[data-test="user-msg"]').last().boundingBox()
  const sb2 = await page.locator('[data-test="scroll"]').boundingBox()
  if (!ub2 || !sb2) throw new Error('missing boxes')
  const offsetAfter = ub2.y - sb2.y
  const drift = offsetAfter - offsetBefore
  console.log(
    `[pin-tap] pin drift after tap-expand: ${drift.toFixed(1)}px ` +
      `(before=${offsetBefore.toFixed(1)}, after=${offsetAfter.toFixed(1)})`,
  )
  expect(Math.abs(drift)).toBeLessThan(15)
})
