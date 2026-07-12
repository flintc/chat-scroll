import {
  test,
  expect,
  hold,
  sendUserMessage,
  showCue,
  streamUntilDone,
} from '../../fixtures'

/**
 * PROBE: scroll-to-bottom + later block expand snaps back to the pin.
 *
 * This is the "I scrolled down to read, then I went back to look at a
 * prior block" use case. Different from `probe-fab-snap-back` because:
 *
 *  - The stream has fully finished, so `streaming: false` (no
 *    `overflow-anchor: none` — the browser would normally help).
 *  - The trigger for the snap-back is NOT a stream tick but a user
 *    action: expanding a prior thinking/tool block.
 *
 * Hypothesis (same root cause as `probe-fab-snap-back`): after
 * `pinMessage()`, `pinAnchored = true` and stays true through ALL
 * non-scroll-driving inputs — including a click on the FAB and a click
 * on a `<details>`-style block summary (`pointerdown` is abort-only by
 * design).
 *
 * So even when the user has clearly moved past the pin (clicking the
 * FAB to read the bottom of the response), and then innocently expands
 * a prior block to re-read context, the resize fires `recalcGutter`,
 * which writes `scrollTop = pinnedY` and yanks them back to the pin.
 *
 * If the hypothesis is right, sample after block-expand will be at
 * pinnedY (≈ 12 from top), not somewhere near the bottom.
 */
test('probe: FAB-down then expand-prior-block snaps back to pin', async ({
  page,
}) => {
  page.on('console', (msg) => {
    const t = msg.text()
    if (t.startsWith('[probe-fab-expand]')) {
      console.log(t)
    }
  })

  await page.goto('/#/pin-to-top')
  await page.waitForFunction(() => Boolean(window.__demo))
  await hold(page, 400)

  // Turn 1 — get blocks (thinking + tool) on screen.
  await sendUserMessage(page)
  await streamUntilDone(page, 60)
  await page.evaluate(() => window.__demo?.finishStream())
  await hold(page, 400)

  // Turn 2 — pin + finish.
  await sendUserMessage(page)
  await streamUntilDone(page, 60)
  await page.evaluate(() => window.__demo?.finishStream())
  await hold(page, 600)

  // FAB is visible because content extends below the viewport.
  const fab = page.locator('[data-test="fab"]')
  await expect(fab).toHaveClass(/fab--visible/, { timeout: 2_000 })

  const pinnedYNow = await page.evaluate(() => {
    const ubAll = document.querySelectorAll<HTMLElement>('[data-test="user-msg"]')
    const ub = ubAll[ubAll.length - 1]!
    const sb = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    const u = ub.getBoundingClientRect()
    const s = sb.getBoundingClientRect()
    return u.top - s.top + sb.scrollTop
  })
  console.log(`[probe-fab-expand] pinnedY ≈ ${pinnedYNow.toFixed(1)}`)

  await showCue(page, 'user clicks ↓ to read the bottom of the response')
  await fab.click()
  await hold(page, 600)

  const afterFab = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    return { scrollTop: c.scrollTop, scrollMax: c.scrollHeight - c.clientHeight }
  })
  console.log(
    `[probe-fab-expand] after FAB click: scrollTop=${afterFab.scrollTop} ` +
      `scrollMax=${afterFab.scrollMax} ` +
      `distFromBottom=${(afterFab.scrollMax - afterFab.scrollTop).toFixed(0)}`,
  )

  // User reads for a moment, then expands a prior-turn block to re-
  // check context. Block 1 is turn-1's tool-call (closed by default).
  await showCue(page, 'user expands a prior block to re-read context')
  await page.evaluate(() => window.__demo?.expandBlock?.(1))

  // 220ms animation + a beat for the controller to react.
  await hold(page, 500)

  const afterExpand = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    return { scrollTop: c.scrollTop, scrollMax: c.scrollHeight - c.clientHeight }
  })
  console.log(
    `[probe-fab-expand] after block expand: scrollTop=${afterExpand.scrollTop} ` +
      `scrollMax=${afterExpand.scrollMax} ` +
      `distFromBottom=${(afterExpand.scrollMax - afterExpand.scrollTop).toFixed(0)}`,
  )

  // Where did the pinned message end up?
  const finalPinnedOffset = await page.evaluate(() => {
    const ubAll = document.querySelectorAll<HTMLElement>('[data-test="user-msg"]')
    const ub = ubAll[ubAll.length - 1]!
    const sb = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    const u = ub.getBoundingClientRect()
    const s = sb.getBoundingClientRect()
    return u.top - s.top
  })
  console.log(
    `[probe-fab-expand] final pinned msg offset from scroll top: ` +
      `${finalPinnedOffset.toFixed(1)}`,
  )

  await hold(page, 1000)

  // ASSERTION: if the FAB intent is honored, the user should still be
  // near the bottom after expanding a prior block — within ~80px of
  // scrollMax (block expansion may grow scrollMax by ~150px above where
  // the user is, but the controller should not snap them away).
  // If the bug exists, distFromBottom will be hundreds of pixels.
  const distFromBottom = afterExpand.scrollMax - afterExpand.scrollTop
  expect(distFromBottom).toBeLessThan(80)
})
