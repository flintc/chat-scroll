import {
  test,
  expect,
  hold,
  showCue,
  streamN,
  streamUntilDone,
  userScrollSmooth,
} from '../../fixtures'

test('stick-scrolls-mid-stream', async ({ page }) => {
  await page.goto('/#/stick-to-bottom')
  await page.waitForFunction(() => Boolean(window.__demo))

  await hold(page, 2200) // opening still

  await expect(page.locator('[data-test="status"]')).toContainText(
    'locked=✓',
  )

  // Build a tall transcript first: one full turn streamed to completion, so
  // there is real room to scroll up. The demo's transcripts are short — a
  // single partially-streamed reply doesn't overflow far enough past the
  // bottom-threshold for an upward scroll to read as "left the bottom", and
  // the lock (correctly) never releases because the viewport never actually
  // leaves the bottom.
  await page.evaluate(() => window.__demo?.sendUserMessage())
  await streamUntilDone(page, 40)
  await page.evaluate(() => window.__demo?.finishStream())
  await hold(page, 400)

  await showCue(page, 'user sends a question')
  await page.evaluate(() => {
    window.__demo?.sendUserMessage()
  })
  await hold(page, 600)

  await streamN(page, 12, 150)
  await hold(page, 800)

  // ─── User scrolls up mid-stream ────────────────────────────
  await showCue(page, 'user scrolls up MID-stream — lock breaks')
  await userScrollSmooth(page, -250)
  await hold(page, 1500)

  await expect(page.locator('[data-test="status"]')).toContainText(
    'locked=·',
  )

  const beforeTop = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')
    return c?.scrollTop ?? 0
  })

  await streamN(page, 25, 150)
  await hold(page, 1500)

  const afterTop = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')
    return c?.scrollTop ?? 0
  })
  expect(Math.abs(afterTop - beforeTop)).toBeLessThan(50)

  await showCue(page, 'user clicks ↓ — snaps to bottom')
  await page.click('[data-test="fab"]')
  await hold(page, 1500)

  await expect(page.locator('[data-test="status"]')).toContainText(
    'locked=✓',
  )
})
