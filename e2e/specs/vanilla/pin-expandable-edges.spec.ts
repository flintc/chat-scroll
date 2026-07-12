import {
  test,
  expect,
  hold,
  sendUserMessage,
  showCue,
  streamN,
  streamUntilDone,
  userWheelScroll,
} from '../../fixtures'

/**
 * Edge cases for the pin-to-top + expandable-blocks interaction. The
 * main `pin-to-top` spec exercises the happy path (user is anchored
 * to the pin, prior block toggles, pin stays). This file covers the
 * cases where we explicitly do NOT want the controller to re-anchor.
 */
test('pin-expandable: scrolled-away does not snap back', async ({
  page,
  browserName,
}) => {
  page.on('console', (msg) => {
    const txt = msg.text()
    if (txt.startsWith('[pin-edges]')) {
      console.log(txt)
    }
  })
  await page.goto('/#/pin-to-top')
  await page.waitForFunction(() => Boolean(window.__demo))
  await hold(page, 1000)

  // Turn 1: send + stream + finish.
  await sendUserMessage(page)
  await streamUntilDone(page, 80)
  await page.evaluate(() => window.__demo?.finishStream())
  await hold(page, 500)

  // Turn 2: send + stream a few chunks so we're mid-stream.
  await sendUserMessage(page)
  await hold(page, 400)
  await streamN(page, 4, 100)

  // User wheel-scrolls UP — past the pinned message into prior turn.
  // This should clear `pinAnchored` via the user-input cancellers.
  await showCue(page, 'user wheel-scrolls up past the pin')
  await userWheelScroll(page, -350)
  await hold(page, 500)

  // Record the pin's VISUAL position (its offset from the viewport top). The
  // pin is parked in the lower half of the viewport — the reader scrolled up
  // to read prior content but the pinned turn + its streaming answer are what
  // they're tracking. Two invariants when the prior block grows:
  //   (1) the pinned turn must not jump (its visual position holds), and
  //   (2) the controller must not snap them back to the pin (pin nowhere near
  //       the top / scrollMargin).
  const readPin = () =>
    page.evaluate(() => {
      const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
      const cr = c.getBoundingClientRect()
      const pin = Array.from(
        c.querySelectorAll<HTMLElement>('[data-test="user-msg"]'),
      ).at(-1)!
      return {
        pinOffset: pin.getBoundingClientRect().top - cr.top,
        scrollTop: c.scrollTop,
      }
    })
  const before = await readPin()

  // Now toggle a prior block above the pin. With pinAnchored cleared, the
  // controller must NOT re-anchor to the pin — and because overflow-anchor is
  // handed back to the browser the moment the reader scrolls away, the block
  // growing above the pin must not shove the pinned turn down the viewport.
  await showCue(page, 'now expand a prior tool call')
  await page.evaluate(() => window.__demo?.expandBlock?.(1))
  await hold(page, 500)

  const after = await readPin()
  const pinDrift = after.pinOffset - before.pinOffset
  console.log(
    `[pin-edges] scrolled-away: pin visual drift=${pinDrift.toFixed(1)}px ` +
      `(${before.pinOffset.toFixed(0)}→${after.pinOffset.toFixed(0)}) ` +
      `scrollTopΔ=${after.scrollTop - before.scrollTop}px`,
  )

  // (1) The controller did NOT slam them back to the pin: it stays far below
  // the viewport top, nowhere near scrollMargin (~12px). True on every engine.
  expect(after.pinOffset).toBeGreaterThan(150)
  // (2) The pinned turn stays put when the prior block grows. On baseline
  // (overflow-anchor `none` while streaming) the growth shoved the pin DOWN by
  // its height — the reader lost their place even though scrollTop never
  // moved. Handing anchoring back to the browser on scroll-away holds it —
  // but ONLY on engines that anchor inside nested scroll containers. WebKit /
  // iOS Safari do not, so there the pin still drifts; the no-snap-back
  // invariant above is all we can guarantee. (See `reconcileOverflowAnchor`.)
  if (browserName === 'webkit') {
    const scrollTopDrift = after.scrollTop - before.scrollTop
    console.log(
      `[pin-edges] webkit: anchoring unavailable in nested scroller, ` +
        `pin drift=${pinDrift.toFixed(1)}px (place-keeping is a no-op here), ` +
        `scrollTopΔ=${scrollTopDrift.toFixed(1)}px`,
    )
    // With no browser anchoring in play, nothing may touch scrollTop: a
    // regression that partially re-anchors (nudging scrollTop back toward
    // the pin) must fail here, not just log.
    expect(Math.abs(scrollTopDrift)).toBeLessThan(60)
  } else {
    expect(Math.abs(pinDrift)).toBeLessThan(24)
  }

  await hold(page, 500)
})

test('pin-expandable: stream-ended toggle leaves layout stable', async ({
  page,
}) => {
  page.on('console', (msg) => {
    const txt = msg.text()
    if (txt.startsWith('[pin-edges]')) {
      console.log(txt)
    }
  })
  await page.goto('/#/pin-to-top')
  await page.waitForFunction(() => Boolean(window.__demo))
  await hold(page, 700)

  // Turn 1: send + stream + finish.
  await sendUserMessage(page)
  await streamUntilDone(page, 60)
  await page.evaluate(() => window.__demo?.finishStream())
  await hold(page, 400)

  // Turn 2: send + stream + finish so we end with `streaming: false`.
  await sendUserMessage(page)
  await streamUntilDone(page, 60)
  await page.evaluate(() => window.__demo?.finishStream())
  await hold(page, 600)

  await expect(page.locator('[data-test="status"]')).toContainText(
    'streaming=·',
  )

  const user2BoxBefore = await page
    .locator('[data-test="user-msg"]')
    .last()
    .boundingBox()
  const scrollBoxBefore = await page
    .locator('[data-test="scroll"]')
    .boundingBox()

  // Toggle a prior block AFTER stream has ended. With `streaming: false`,
  // `overflow-anchor` is back to 'auto' so the browser auto-anchors;
  // the controller also re-anchors when pinAnchored is still true (no
  // user input has cleared it).
  await page.evaluate(() => window.__demo?.collapseBlock?.(0))
  await hold(page, 600)
  await page.evaluate(() => window.__demo?.expandBlock?.(1))
  await hold(page, 600)

  const user2BoxAfter = await page
    .locator('[data-test="user-msg"]')
    .last()
    .boundingBox()
  const scrollBoxAfter = await page
    .locator('[data-test="scroll"]')
    .boundingBox()

  if (scrollBoxBefore && user2BoxBefore && scrollBoxAfter && user2BoxAfter) {
    const dy =
      user2BoxAfter.y -
      scrollBoxAfter.y -
      (user2BoxBefore.y - scrollBoxBefore.y)
    console.log(
      `[pin-edges] stream-ended toggle: pin drift = ${dy.toFixed(1)}px`,
    )
    expect(Math.abs(dy)).toBeLessThan(10)
  }
})
