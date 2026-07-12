import {
  test,
  expect,
  hold,
  sendUserMessage,
  streamN,
  streamUntilDone,
} from '../../fixtures'

/**
 * Extreme case: collapse every prior-turn expandable block so content
 * above the pin shrinks dramatically. The pinned message's `pinnedY`
 * approaches zero (or hits a small value), the gutter recalculates
 * accordingly, and the pin must still hold at the top.
 *
 * Also exercises the reverse: re-expand everything. Combined, this is
 * the heaviest content-above-the-pin churn the controller will see in
 * practice.
 */
test('pin-expandable: collapse-all then expand-all keeps the pin', async ({
  page,
}) => {
  await page.goto('/#/pin-to-top')
  await page.waitForFunction(() => Boolean(window.__demo))
  await hold(page, 500)

  // Turn 1: full stream + finish. Now we have 2 turn-1 blocks (one
  // open thinking, one closed tool) and the assistant prose.
  await sendUserMessage(page)
  await streamUntilDone(page, 50)
  await page.evaluate(() => window.__demo?.finishStream())
  await hold(page, 300)

  // Turn 2: stream a few chunks so we're mid-stream and pinned.
  await sendUserMessage(page)
  await hold(page, 300)
  await streamN(page, 4, 60)

  const baseline = await page
    .locator('[data-test="user-msg"]')
    .last()
    .boundingBox()
  const sb = await page.locator('[data-test="scroll"]').boundingBox()
  if (!baseline || !sb) throw new Error('missing boxes')
  const baselineOffset = baseline.y - sb.y

  // Collapse-all: every prior block (index 0 = turn-1 thinking,
  // index 1 = turn-1 tool, index 2 = turn-2 thinking which is below
  // the pin so this also exercises the below-pin path).
  await page.evaluate(() => {
    window.__demo?.collapseBlock?.(0)
    window.__demo?.collapseBlock?.(1)
    window.__demo?.collapseBlock?.(2)
  })
  await hold(page, 400)

  const afterCollapse = await page
    .locator('[data-test="user-msg"]')
    .last()
    .boundingBox()
  if (!afterCollapse) throw new Error('missing box')
  const afterCollapseOffset = afterCollapse.y - sb.y
  console.log(
    `[pin-extreme] after collapse-all: baseline=${baselineOffset.toFixed(1)} after=${afterCollapseOffset.toFixed(1)}`,
  )
  expect(Math.abs(afterCollapseOffset - baselineOffset)).toBeLessThan(5)

  // Expand-all.
  await page.evaluate(() => {
    window.__demo?.expandBlock?.(0)
    window.__demo?.expandBlock?.(1)
    window.__demo?.expandBlock?.(2)
  })
  await hold(page, 400)

  const afterExpand = await page
    .locator('[data-test="user-msg"]')
    .last()
    .boundingBox()
  if (!afterExpand) throw new Error('missing box')
  const afterExpandOffset = afterExpand.y - sb.y
  console.log(
    `[pin-extreme] after expand-all: offset=${afterExpandOffset.toFixed(1)}`,
  )
  expect(Math.abs(afterExpandOffset - baselineOffset)).toBeLessThan(5)

  // Verify the scroll container is in a sane state: pinned message
  // visible somewhere in the viewport, not scrolled completely off.
  expect(afterExpandOffset).toBeGreaterThanOrEqual(0)
  expect(afterExpandOffset).toBeLessThanOrEqual(60)
})
